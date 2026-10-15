'use client';

import type { ReactNode } from 'react';
import type { Role } from '@auctionit/domain';
import { ButtonLink } from '@/components/ui';
import { HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

/**
 * Sign-up and sign-in prompts are for visitors only: once someone is signed in they work in their own workspace,
 * so these render `signedIn` (nothing by default) instead.
 */
export function GuestOnly({ children, signedIn = null }: { children: ReactNode; signedIn?: ReactNode | ((role: Exclude<Role, 'guest'>) => ReactNode) }) {
  const { session } = useSession();
  if (session.role === 'guest') return <>{children}</>;
  return <>{typeof signedIn === 'function' ? signedIn(session.role) : signedIn}</>;
}

/** For signed-in visitors on public pages: the way back to their own workspace. */
export function WorkspaceButton({ size }: { size?: 'md' | 'lg' }) {
  const { session } = useSession();
  if (session.role === 'guest') return null;
  return (
    <ButtonLink href={HOME[session.role]} size={size}>
      {session.role === 'ops' ? 'Go to Operations' : 'Go to your dashboard'}
    </ButtonLink>
  );
}
