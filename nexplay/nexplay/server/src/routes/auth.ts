import { Router, type Request, type RequestHandler } from 'express';
import { authenticator } from 'otplib';
import type { User } from '@prisma/client';
import { audit } from '../audit.js';
import { adminOf, destroySession, regenerateSession, requireAdmin, saveSession } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import type { Deps } from '../deps.js';
import { HttpError } from '../errors.js';
import { decryptString, encryptString, hmacHex, newRecoveryCode, normalizeRecoveryCode, randomToken, sha256Hex } from '../lib/crypto.js';
import { passwordProblems } from '../lib/password-policy.js';
import { limit } from '../limiters.js';
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from '../password.js';
import { loginBody, mfaDisableBody, mfaEnableBody, mfaSetupBody, passwordChangeBody } from '../schemas.js';

// Accept the code from the previous and next 30-second window to allow for clock drift.
authenticator.options = { window: 1 };

const RECOVERY_CODE_COUNT = 10;

export function authRouter(d: Deps): Router {
  const r = Router();
  const csrf = csrfProtection([d.config.APP_ORIGIN]);
  const admin: RequestHandler = requireAdmin(d);
  const log = (event: Parameters<typeof audit>[2]) => audit(d.db, d.logger, event);

  /** Check a TOTP code once. A code that was already accepted can never be used again (replay protection). */
  async function consumeTotp(user: User, code: string): Promise<boolean> {
    if (!user.totpSecretEnc) return false;
    const secret = decryptString(d.config.ENCRYPTION_KEY, user.totpSecretEnc);
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null || delta === undefined) return false;
    const step = Math.floor(Date.now() / 30_000) + delta;
    const claimed = await d.db.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count === 1;
  }

  /** Recovery codes are single use. The conditional update makes "check and burn" one atomic step. */
  async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const codeHash = hmacHex(d.config.ENCRYPTION_KEY, 'recovery', normalizeRecoveryCode(code));
    const claimed = await d.db.recoveryCode.updateMany({ where: { userId, codeHash, usedAt: null }, data: { usedAt: new Date() } });
    return claimed.count === 1;
  }

  async function checkSecondFactor(user: User, input: { totp?: string; recoveryCode?: string }): Promise<boolean> {
    if (input.totp) return consumeTotp(user, input.totp);
    if (input.recoveryCode) return consumeRecoveryCode(user.id, input.recoveryCode);
    return false;
  }

  async function endOtherSessions(userId: string, keepSid: string): Promise<void> {
    await d.db.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${userId} AND sid <> ${keepSid}`;
  }

  async function startSession(req: Request, userId: string): Promise<string> {
    await regenerateSession(req); // new session id after login or a security change: defeats session fixation
    req.session.userId = userId;
    req.session.createdAt = Date.now();
    req.session.csrf = randomToken();
    await saveSession(req);
    return req.session.csrf;
  }

  r.get('/csrf', (req, res) => {
    req.session.csrf ??= randomToken();
    res.json({ csrfToken: req.session.csrf });
  });

  r.get('/me', admin, (req, res) => {
    res.json({ user: adminOf(req), csrfToken: req.session.csrf });
  });

  r.post('/login', limit(d.limiters.login), csrf, async (req, res) => {
    const body = loginBody.parse(req.body);
    const accountKey = sha256Hex(body.email);
    await d.limiters.loginAccount.consume(accountKey);

    const user = await d.db.user.findUnique({ where: { email: body.email } });
    const passwordOk = user ? await verifyPassword(user.passwordHash, body.password) : (await dummyVerify(body.password), false);
    if (!user || !passwordOk) {
      await log({ action: 'auth.login_failed', meta: { reason: 'bad_credentials' } });
      throw new HttpError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    if (user.totpEnabled) {
      if (!body.totp && !body.recoveryCode) throw new HttpError(401, 'mfa_required', 'Enter your authentication code.');
      if (!(await checkSecondFactor(user, body))) {
        await log({ actorId: user.id, action: 'auth.login_failed', meta: { reason: 'bad_second_factor' } });
        throw new HttpError(401, 'invalid_mfa', 'That authentication code is not valid.');
      }
    }

    if (needsRehash(user.passwordHash)) {
      await d.db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
    }
    await d.limiters.loginAccount.delete(accountKey);
    const csrfToken = await startSession(req, user.id);
    await log({ actorId: user.id, action: 'auth.login' });
    res.json({ user: { id: user.id, email: user.email, role: user.role, totpEnabled: user.totpEnabled }, csrfToken });
  });

  r.post('/logout', admin, csrf, async (req, res) => {
    const { id } = adminOf(req);
    await destroySession(req);
    // Must repeat the cookie's attributes, or browsers ignore the deletion of a __Host- cookie.
    res.clearCookie(req.app.get('session cookie name') as string, { path: '/', httpOnly: true, secure: d.config.NODE_ENV === 'production', sameSite: 'strict' });
    await log({ actorId: id, action: 'auth.logout' });
    res.status(204).end();
  });

  r.post('/password', admin, csrf, async (req, res) => {
    const body = passwordChangeBody.parse(req.body);
    const me = adminOf(req);
    const user = await d.db.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw new HttpError(403, 'wrong_password', 'The current password is not correct.');
    }
    if (user.totpEnabled && !(await consumeTotp(user, body.totp ?? ''))) {
      throw new HttpError(403, 'invalid_mfa', 'That authentication code is not valid.');
    }
    const problems = passwordProblems(body.newPassword, user.email);
    if (problems.length > 0) throw new HttpError(400, 'weak_password', problems.join(' '));
    if (body.newPassword === body.currentPassword) throw new HttpError(400, 'weak_password', 'Choose a different password.');

    await d.db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    const csrfToken = await startSession(req, user.id);
    await endOtherSessions(user.id, req.sessionID);
    await log({ actorId: user.id, action: 'auth.password_changed' });
    res.json({ csrfToken });
  });

  // ---- Two-factor authentication ----

  r.post('/mfa/setup', admin, csrf, async (req, res) => {
    const body = mfaSetupBody.parse(req.body);
    const user = await d.db.user.findUniqueOrThrow({ where: { id: adminOf(req).id } });
    if (user.totpEnabled) throw new HttpError(409, 'mfa_already_enabled', 'Two-factor authentication is already on.');
    if (!(await verifyPassword(user.passwordHash, body.password))) throw new HttpError(403, 'wrong_password', 'The password is not correct.');
    const secret = authenticator.generateSecret();
    await d.db.user.update({ where: { id: user.id }, data: { totpSecretEnc: encryptString(d.config.ENCRYPTION_KEY, secret), totpLastStep: null } });
    res.json({ secret, otpauthUrl: authenticator.keyuri(user.email, 'NEXPLAY', secret) });
  });

  r.post('/mfa/enable', admin, csrf, async (req, res) => {
    const body = mfaEnableBody.parse(req.body);
    const user = await d.db.user.findUniqueOrThrow({ where: { id: adminOf(req).id } });
    if (user.totpEnabled || !user.totpSecretEnc) throw new HttpError(409, 'mfa_not_pending', 'Start setup first.');
    if (!(await consumeTotp(user, body.code))) throw new HttpError(400, 'invalid_mfa', 'That code is not valid. Check your authenticator app and try again.');

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    await d.db.$transaction([
      d.db.user.update({ where: { id: user.id }, data: { totpEnabled: true } }),
      d.db.recoveryCode.deleteMany({ where: { userId: user.id } }),
      d.db.recoveryCode.createMany({
        data: codes.map((code) => ({ userId: user.id, codeHash: hmacHex(d.config.ENCRYPTION_KEY, 'recovery', normalizeRecoveryCode(code)) })),
      }),
    ]);
    const csrfToken = await startSession(req, user.id);
    await log({ actorId: user.id, action: 'auth.mfa_enabled' });
    // The only time the codes are ever shown. Only keyed hashes are stored.
    res.json({ recoveryCodes: codes, csrfToken });
  });

  r.post('/mfa/disable', admin, csrf, async (req, res) => {
    const body = mfaDisableBody.parse(req.body);
    const user = await d.db.user.findUniqueOrThrow({ where: { id: adminOf(req).id } });
    if (!user.totpEnabled) throw new HttpError(409, 'mfa_not_enabled', 'Two-factor authentication is not on.');
    if (!(await verifyPassword(user.passwordHash, body.password))) throw new HttpError(403, 'wrong_password', 'The password is not correct.');
    if (!(await checkSecondFactor(user, body))) throw new HttpError(403, 'invalid_mfa', 'That authentication code is not valid.');
    await d.db.$transaction([
      d.db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null } }),
      d.db.recoveryCode.deleteMany({ where: { userId: user.id } }),
    ]);
    const csrfToken = await startSession(req, user.id);
    await log({ actorId: user.id, action: 'auth.mfa_disabled' });
    res.json({ csrfToken });
  });

  return r;
}
