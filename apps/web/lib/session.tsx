'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getSessionUser, type SessionUser } from './admin-api';

export type SessionStatus = 'loading' | 'guest' | 'authenticated';

type SessionContextValue = {
  status: SessionStatus;
  session: SessionUser | null;
  /** Re-fetch `/auth/me` (e.g. after profile changes). */
  refresh: () => Promise<void>;
  /** Drop client state after logout (server revocation happens in the API call). */
  clear: () => void;
};

const SessionContext = createContext<SessionContextValue>({
  status: 'loading',
  session: null,
  refresh: () => Promise.resolve(),
  clear: () => undefined,
});

export function useSession() {
  return useContext(SessionContext);
}

/**
 * Event dispatched (same-tab) whenever profile data may have changed, so the
 * navbar reflects updates without a full page refresh. Cross-tab sync is
 * intentionally out of scope: each tab holds its own HttpOnly-cookie session
 * and revalidates on mount/focus of this provider.
 */
export const SESSION_UPDATED_EVENT = 'jb:session-updated';

export function notifySessionUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
  }
}

async function fetchSession(): Promise<SessionUser | null> {
  try {
    return await getSessionUser();
  } catch {
    // UNAUTHENTICATED, expired/revoked sessions and network failures all
    // resolve to guest: the rest of the app must stay usable. No backend
    // details, tokens or stack traces are exposed here.
    return null;
  }
}

/**
 * Single authoritative client session cache. One `/auth/me` request per
 * mount; all consumers (Header, AccountNav, admin shell helpers) share it
 * instead of issuing per-component requests.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionUser | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await fetchSession();
    if (!mountedRef.current) return;
    setSession(result);
    setStatus(result ? 'authenticated' : 'guest');
  }, []);

  const clear = useCallback(() => {
    setSession(null);
    setStatus('guest');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const onUpdate = () => {
      refresh();
    };
    window.addEventListener(SESSION_UPDATED_EVENT, onUpdate);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(SESSION_UPDATED_EVENT, onUpdate);
    };
  }, [refresh]);

  const value = useMemo(() => ({ status, session, refresh, clear }), [status, session, refresh, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
