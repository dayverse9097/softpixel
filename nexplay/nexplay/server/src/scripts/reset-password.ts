import { z } from 'zod';
import { passwordProblems } from '../lib/password-policy.js';
import { hashPassword } from '../password.js';
import { arg, ask, askHidden, flag, migratorDb } from './shared.js';

// Password recovery for administrators. It runs on the server with database access, because no
// email provider is configured. Existing sessions for the account are ended.
const db = migratorDb();
try {
  const email = z.string().trim().toLowerCase().email().parse(arg('email') ?? (await ask('Admin email: ')));
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error('No administrator with that email.');
    process.exit(1);
  }
  const password = await askHidden('New password (12+ characters): ');
  const problems = passwordProblems(password, email);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  if (password !== (await askHidden('Repeat password: '))) {
    console.error('The passwords do not match.');
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), ...(flag('disable-mfa') ? { totpEnabled: false, totpSecretEnc: null, totpLastStep: null } : {}) },
  });
  if (flag('disable-mfa')) await db.recoveryCode.deleteMany({ where: { userId: user.id } });
  await db.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${user.id}`;
  await db.auditEvent.create({ data: { actorId: user.id, action: 'admin.password_reset', targetType: 'user', targetId: user.id, meta: { mfaDisabled: flag('disable-mfa') } } });
  console.log('Password changed. All existing sessions for this account were ended.');
} finally {
  await db.$disconnect();
}
