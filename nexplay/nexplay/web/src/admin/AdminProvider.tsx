import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, isAbort, setCsrfToken, setUnauthorizedHandler } from '../lib/api';
import { adminApi, type LoginInput } from '../lib/adminApi';
import type { AdminUser } from '../lib/types';

type Status = 'loading' | 'anonymous' | 'signedIn' | 'unavailable';

interface AdminContext {
  status: Status;
  user: AdminUser | null;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  reloadUser: () => Promise<void>;
  retry: () => void;
}

const Context = createContext<AdminContext | null>(null);

export function useAdmin(): AdminContext {
  const value = useContext(Context);
  if (!value) throw new Error('useAdmin must be used inside AdminProvider');
  return value;
}

/** Holds the signed-in administrator. The browser keeps the session cookie; this only mirrors what the server says. */
export function AdminProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AdminUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    adminApi.me(controller.signal).then(
      (result) => {
        setUser(result.user);
        setStatus('signedIn');
      },
      (err: unknown) => {
        if (isAbort(err)) return;
        setUser(null);
        setStatus(err instanceof ApiError && err.status === 0 ? 'unavailable' : 'anonymous');
      },
    );
    return () => controller.abort();
  }, [attempt]);

  // If the server ever answers 401 to an admin request, drop back to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setCsrfToken(null);
      setStatus('anonymous');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const result = await adminApi.login(input);
    setUser(result.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await adminApi.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const result = await adminApi.me();
    setUser(result.user);
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const value = useMemo(() => ({ status, user, signIn, signOut, reloadUser, retry }), [status, user, signIn, signOut, reloadUser, retry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
