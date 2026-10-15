'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Company, Role, User, Viewer } from '@auctionit/domain';
import { useQuery } from '@/data';
import { AUTH_ENABLED } from './flags';
import { authStateFromClaims, type AuthState } from './supabase/claims';
import { supabaseBrowser } from './supabase/browser';
import { canView, demoSessionFor, GUEST, HOME, SESSION_COOKIE, serializeSession, type Session } from './session';

interface SessionCtx {
  session: Session;
  viewer: Viewer;
  user: User | null;
  company: Company | null;
  /** Live site: the Supabase sign-in (also before the AuctionIT account exists). Null with presenter controls. */
  auth: AuthState | null;
  /** Presenter controls only: switch sample account, staying on the current page when the new role may view it. */
  switchRole: (role: Role) => void;
  /** Presenter controls only: sign in as a specific sample/new account and go to `to`. */
  signInAs: (session: Session, to?: string) => void;
  /** Live site: re-read the verified session after the account was created (its role is now in the token), then go to `to`. */
  refreshAccount: (to?: string) => Promise<void>;
  /** Sign out and go to `to` (home by default). */
  signOut: (to?: string) => Promise<void>;
  /** Refresh the user/company record (e.g. after an eligibility decision). */
  reloadUser: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

function writeCookie(s: Session) {
  // Sample accounts only (presenter controls); Lax keeps it on top-level navigations.
  document.cookie =
    s.role === 'guest'
      ? `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${SESSION_COOKIE}=${serializeSession(s)}; Path=/; Max-Age=28800; SameSite=Lax`;
}

export function SessionProvider({ initial, initialAuth, children }: { initial: Session; initialAuth: AuthState | null; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(initialAuth);
  const [demoSession, setDemoSession] = useState<Session>(initial);
  const session = AUTH_ENABLED ? (auth?.session ?? GUEST) : demoSession;
  const router = useRouter();
  const pathname = usePathname();
  // While signing out, ignore Supabase's SIGNED_OUT event: pages on screen must not re-query as a guest.
  const signingOut = useRef(false);

  const userQ = useQuery(`user:${session.userId}`, (ds) => ds.me({ id: session.userId, role: session.role }), { enabled: !!session.userId });

  // Live site: follow sign-in, sign-out and token refreshes from Supabase (also from other tabs).
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!AUTH_ENABLED || !sb) return;
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      if (signingOut.current) return;
      void sb.auth.getClaims().then(({ data: c }) => setAuth(s ? authStateFromClaims(c?.claims as Record<string, unknown> | undefined) : authStateFromClaims(null)));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const apply = useCallback(
    (next: Session, to: string | null) => {
      writeCookie(next);
      setDemoSession(next);
      // Staying on the same URL keeps client state (form entries); only navigate when the path changes.
      if (to && to !== window.location.pathname + window.location.search) router.push(to);
      else router.refresh();
    },
    [router],
  );

  const switchRole = useCallback(
    (role: Role) => {
      if (AUTH_ENABLED) return;
      const next = demoSessionFor(role);
      apply(next, canView(pathname, role) ? null : HOME[role]);
    },
    [apply, pathname],
  );

  const signInAs = useCallback((next: Session, to?: string) => (AUTH_ENABLED ? undefined : apply(next, to ?? HOME[next.role])), [apply]);

  const refreshAccount = useCallback(
    async (to?: string) => {
      const sb = supabaseBrowser();
      if (sb) {
        await sb.auth.refreshSession();
        const { data } = await sb.auth.getClaims();
        const next = authStateFromClaims(data?.claims as Record<string, unknown> | undefined);
        setAuth(next);
        router.push(to ?? HOME[next.session.role]);
      }
      router.refresh();
    },
    [router],
  );

  const signOut = useCallback(async (to = '/') => {
    const sb = supabaseBrowser();
    if (sb) {
      // Revoke the session and clear its cookies, then load the home page fresh: nothing signed-in stays on screen
      // to re-query as a guest, and the next page is rendered signed out.
      signingOut.current = true;
      await sb.auth.signOut();
      window.location.assign(to);
      return;
    }
    writeCookie(GUEST);
    setDemoSession(GUEST);
    router.push(to);
    router.refresh();
  }, [router]);

  const value = useMemo<SessionCtx>(
    () => ({
      session,
      viewer: { id: session.userId, role: session.role },
      user: session.userId ? (userQ.data?.user ?? null) : null,
      company: session.userId ? (userQ.data?.company ?? null) : null,
      auth: AUTH_ENABLED ? auth : null,
      switchRole,
      signInAs,
      refreshAccount,
      signOut,
      reloadUser: userQ.reload,
    }),
    [session, userQ.data, userQ.reload, auth, switchRole, signInAs, refreshAccount, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession must be used inside <SessionProvider>');
  return c;
}

export { GUEST };
