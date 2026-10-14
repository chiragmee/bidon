'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Company, Role, User, Viewer } from '@auctionit/domain';
import { useQuery } from '@/data';
import { canView, demoSessionFor, GUEST, HOME, SESSION_COOKIE, serializeSession, type Session } from './session';

interface SessionCtx {
  session: Session;
  viewer: Viewer;
  user: User | null;
  company: Company | null;
  /** Switch to a demo role, staying on the current page when the new role may view it. */
  switchRole: (role: Role) => void;
  /** Sign in as a specific user (e.g. a newly onboarded buyer) and go to `to`. */
  signInAs: (session: Session, to?: string) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

function writeCookie(s: Session) {
  // 8 hours is plenty for a demo; Lax keeps it on top-level navigations.
  document.cookie =
    s.role === 'guest'
      ? `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${SESSION_COOKIE}=${serializeSession(s)}; Path=/; Max-Age=28800; SameSite=Lax`;
}

export function SessionProvider({ initial, children }: { initial: Session; children: ReactNode }) {
  const [session, setSession] = useState<Session>(initial);
  const router = useRouter();
  const pathname = usePathname();

  const userQ = useQuery(`user:${session.userId}`, (ds) => ds.getUser(session.userId ?? ''), { enabled: !!session.userId });

  const apply = useCallback(
    (next: Session, to: string | null) => {
      writeCookie(next);
      setSession(next);
      if (to) router.push(to);
      else router.refresh();
    },
    [router],
  );

  const switchRole = useCallback(
    (role: Role) => {
      const next = demoSessionFor(role);
      apply(next, canView(pathname, role) ? null : HOME[role]);
    },
    [apply, pathname],
  );

  const signInAs = useCallback((next: Session, to?: string) => apply(next, to ?? HOME[next.role]), [apply]);

  const value = useMemo<SessionCtx>(
    () => ({
      session,
      viewer: { id: session.userId, role: session.role },
      user: session.userId ? (userQ.data?.user ?? null) : null,
      company: session.userId ? (userQ.data?.company ?? null) : null,
      switchRole,
      signInAs,
    }),
    [session, userQ.data, switchRole, signInAs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession must be used inside <SessionProvider>');
  return c;
}

export { GUEST };
