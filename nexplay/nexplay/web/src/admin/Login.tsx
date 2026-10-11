import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ApiError } from '../lib/api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAdmin } from './AdminProvider';

type Step = 'password' | 'code' | 'recovery';

export function LoginPage() {
  usePageTitle('Admin sign in');
  const { signIn, status } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Navigate to={from?.startsWith('/admin') ? from : '/admin'} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn({
        email: email.trim(),
        password,
        ...(step === 'code' ? { totp: code.trim() } : {}),
        ...(step === 'recovery' ? { recoveryCode: code.trim() } : {}),
      });
      navigate(from?.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'mfa_required') {
        setStep('code');
        setCode('');
      } else if (err instanceof ApiError && err.status === 429) {
        setError(`Too many attempts. Try again in ${err.retryAfterSeconds ?? 60} seconds.`);
      } else {
        setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="grid min-h-screen place-items-center p-4 outline-none">
      <div className="glass w-full max-w-md rounded-panel p-8">
        <div className="mb-6">
          <Logo to="/" label="NEXPLAY home" />
        </div>
        <h1 className="mb-1.5 text-2xl">Admin sign in</h1>
        <p className="mb-6 text-muted">{step === 'password' ? 'Use your administrator account.' : step === 'code' ? 'Enter the 6-digit code from your authenticator app.' : 'Enter one of your recovery codes.'}</p>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {step === 'password' ? (
            <>
              <div>
                <label htmlFor="email" className="label">Email</label>
                <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="password" className="label">Password</label>
                <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="code" className="label">{step === 'code' ? 'Authentication code' : 'Recovery code'}</label>
              <input
                id="code"
                className="input"
                inputMode={step === 'code' ? 'numeric' : 'text'}
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={step === 'code' ? 6 : 24}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="error-text !mt-0">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : step === 'password' ? 'Sign in' : 'Verify and sign in'}
          </button>
          {step !== 'password' && (
            <button type="button" className="btn btn-glass" onClick={() => { setStep(step === 'code' ? 'recovery' : 'code'); setCode(''); setError(''); }}>
              {step === 'code' ? 'Use a recovery code instead' : 'Use an authentication code instead'}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
