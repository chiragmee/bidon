import { DEMO_ACCOUNTS, type Role } from '@auctionit/domain';

/**
 * Demo session: "<role>:<userId>" in a cookie, so the server-side route guard (src/proxy.ts) and
 * the client agree on who is signed in. Demo only — not an authentication mechanism.
 */
export const SESSION_COOKIE = 'auctionit_session';

export interface Session {
  role: Role;
  userId: string | null;
}

export const GUEST: Session = { role: 'guest', userId: null };

export function parseSession(raw: string | undefined | null): Session {
  if (!raw) return GUEST;
  const [role, userId] = decodeURIComponent(raw).split(':');
  if ((role === 'buyer' || role === 'seller' || role === 'ops') && userId) return { role, userId };
  return GUEST;
}

export function serializeSession(s: Session): string {
  return encodeURIComponent(`${s.role}:${s.userId}`);
}

export function demoSessionFor(role: Role): Session {
  return role === 'guest' ? GUEST : { role, userId: DEMO_ACCOUNTS[role] };
}

export const HOME: Record<Role, string> = {
  guest: '/',
  buyer: '/buyer/dashboard',
  seller: '/seller/dashboard',
  ops: '/ops',
};

/** Which role a protected area needs; null = open to everyone. */
export function requiredRole(pathname: string): Role | 'signed_in' | null {
  if (pathname.startsWith('/buyer')) return 'buyer';
  if (pathname.startsWith('/seller')) return 'seller';
  if (pathname.startsWith('/ops')) return 'ops';
  if (pathname.startsWith('/transactions')) return 'signed_in';
  return null;
}

/** Can this role stay on this page after switching? (Party checks for transactions happen on the page.) */
export function canView(pathname: string, role: Role): boolean {
  const need = requiredRole(pathname);
  if (need === null) return !(pathname.startsWith('/onboarding') && role !== 'guest');
  if (need === 'signed_in') return role !== 'guest';
  return need === role;
}
