import { useState, type FormEvent, type ReactNode } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { adminApi } from '../lib/adminApi';
import { useAdmin } from './AdminProvider';

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="glass mt-6 max-w-2xl rounded-panel panel-pad">
      <h2 id={id} className="mb-4 text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Message({ kind, text }: { kind: 'ok' | 'error'; text: string }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={kind === 'error' ? 'error-text' : 'mt-1 text-sm text-neon-mint'}>
      {text}
    </p>
  );
}

function ChangePassword() {
  const { user } = useAdmin();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMsg(null);
    if (next !== again) return setMsg({ kind: 'error', text: 'The new passwords do not match.' });
    setBusy(true);
    try {
      await adminApi.changePassword({ currentPassword: current, newPassword: next, ...(user?.totpEnabled ? { totp: code.trim() } : {}) });
      setCurrent('');
      setNext('');
      setAgain('');
      setCode('');
      setMsg({ kind: 'ok', text: 'Password changed. Your other sessions were signed out.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not change the password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="password-heading" title="Change password">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div>
          <label htmlFor="current-password" className="label">Current password</label>
          <input id="current-password" className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="new-password" className="label">New password</label>
          <input id="new-password" className="input" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="new-password-help" />
          <p id="new-password-help" className="help">At least 12 characters. A few random words work well.</p>
        </div>
        <div>
          <label htmlFor="repeat-password" className="label">Repeat new password</label>
          <input id="repeat-password" className="input" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
        {user?.totpEnabled && (
          <div>
            <label htmlFor="password-code" className="label">Authentication code</label>
            <input id="password-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        {msg && <Message {...msg} />}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </Card>
  );
}

type Stage = 'idle' | 'password' | 'enroll' | 'codes';

function TwoFactor() {
  const { user, reloadUser } = useAdmin();
  const [stage, setStage] = useState<Stage>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [link, setLink] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [useRecovery, setUseRecovery] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await action();
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'That did not work.' });
    } finally {
      setBusy(false);
    }
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      const result = await adminApi.mfaSetup(password);
      setSecret(result.secret);
      // The link comes from the server, so only a real otpauth address is ever shown as a link.
      setLink(result.otpauthUrl.startsWith('otpauth://') ? result.otpauthUrl : '');
      setPassword('');
      setCode('');
      setStage('enroll');
    });
  };

  const enable = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      const result = await adminApi.mfaEnable(code.trim());
      setCodes(result.recoveryCodes);
      setSecret('');
      setCode('');
      setStage('codes');
    });
  };

  const disable = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      await adminApi.mfaDisable({ password, ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() }) });
      setPassword('');
      setCode('');
      await reloadUser();
      setMsg({ kind: 'ok', text: 'Two-factor authentication is off.' });
    });
  };

  const finish = async () => {
    setCodes([]);
    setStage('idle');
    await reloadUser();
    setMsg({ kind: 'ok', text: 'Two-factor authentication is on.' });
  };

  return (
    <Card id="mfa-heading" title="Two-factor authentication">
      {stage === 'codes' ? (
        <div className="grid gap-4">
          <p className="text-muted">Save these recovery codes somewhere safe, such as a password manager. Each works once if you lose your authenticator. <strong>They are shown only now.</strong></p>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 font-mono text-sm">
            {codes.map((c, i) => (
              <li key={`${i}-${c}`} className="rounded-inner bg-white/[0.07] px-3 py-2">{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-glass" onClick={() => navigator.clipboard?.writeText(codes.join('\n')).then(() => setMsg({ kind: 'ok', text: 'Copied.' }), () => setMsg({ kind: 'error', text: 'Could not copy. Select the codes and copy them by hand.' }))}>
              Copy codes
            </button>
            <button type="button" className="btn btn-primary" onClick={finish}>
              I have saved them
            </button>
          </div>
          {msg && <Message {...msg} />}
        </div>
      ) : user?.totpEnabled ? (
        <form onSubmit={disable} className="grid gap-4" noValidate>
          <p className="text-muted">Two-factor authentication is <strong>on</strong>. To turn it off, confirm your password and a code.</p>
          <div>
            <label htmlFor="mfa-off-password" className="label">Password</label>
            <input id="mfa-off-password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mfa-off-code" className="label">{useRecovery ? 'Recovery code' : 'Authentication code'}</label>
            <input id="mfa-off-code" className="input" inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {msg && <Message {...msg} />}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-danger" disabled={busy}>Turn off</button>
            <button type="button" className="btn btn-glass" onClick={() => { setUseRecovery((v) => !v); setCode(''); }}>
              {useRecovery ? 'Use an authentication code' : 'Use a recovery code'}
            </button>
          </div>
        </form>
      ) : stage === 'enroll' ? (
        <form onSubmit={enable} className="grid gap-4" noValidate>
          <p className="text-muted">Add this account to your authenticator app by entering the key below, then type the 6-digit code it shows.</p>
          <p className="break-all rounded-inner bg-white/[0.07] px-3.5 py-3 font-mono text-sm" aria-label="Setup key">{secret}</p>
          {link && <a href={link} className="font-semibold text-neon-cyan">Open in an authenticator app on this device</a>}
          <div>
            <label htmlFor="mfa-code" className="label">6-digit code</label>
            <input id="mfa-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {msg && <Message {...msg} />}
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>Turn on</button>
          </div>
        </form>
      ) : stage === 'password' ? (
        <form onSubmit={start} className="grid gap-4" noValidate>
          <p className="text-muted">Confirm your password to begin.</p>
          <div>
            <label htmlFor="mfa-password" className="label">Password</label>
            <input id="mfa-password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {msg && <Message {...msg} />}
          <div className="flex gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>Continue</button>
            <button type="button" className="btn btn-glass" onClick={() => setStage('idle')}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <p className="text-muted">Two-factor authentication is <strong>off</strong>. Turning it on asks for a code from an authenticator app each time you sign in.</p>
          {msg && <Message {...msg} />}
          <div>
            <button type="button" className="btn btn-primary" onClick={() => { setMsg(null); setStage('password'); }}>
              Turn on two-factor authentication
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function SecurityPage() {
  usePageTitle('Security');
  return (
    <div>
      <div className="page-title">
        <h1>Security</h1>
        <p className="text-muted">Protect the administrator account.</p>
      </div>
      <TwoFactor />
      <ChangePassword />
    </div>
  );
}
