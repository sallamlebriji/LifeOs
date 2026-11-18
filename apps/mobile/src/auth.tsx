import { type AuthResponse } from '@lifeos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, hasSession, saveSession, setSignedOutHandler } from './api';

interface AuthState {
  status: 'loading' | 'signedIn' | 'signedOut';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ status: 'loading', signIn: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const qc = useQueryClient();

  useEffect(() => {
    void hasSession().then((ok) => setStatus(ok ? 'signedIn' : 'signedOut'));
    setSignedOutHandler(() => {
      qc.clear();
      setStatus('signedOut');
    });
  }, [qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
    await saveSession(auth);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    await clearSession();
    qc.clear();
    setStatus('signedOut');
  }, [qc]);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
