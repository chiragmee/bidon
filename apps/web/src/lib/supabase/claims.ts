import type { Role } from '@auctionit/domain';
import { GUEST, type Session } from '@/lib/session';

/**
 * The Bid ON session from verified Supabase JWT claims. Role and profile id live in app_metadata, which only the
 * API (service role) writes when the account is created — users can't edit it. The API re-checks every request
 * against the profile row; this only decides which pages to show.
 */
export interface AuthState {
  session: Session;
  /** Signed in to Supabase (verified token), whether or not the Bid ON account exists yet. */
  signedIn: boolean;
  email: string | null;
  emailVerified: boolean;
  /** What they chose at sign-up (user_metadata) — only used to send them to the right onboarding form. */
  intendedRole: 'buyer' | 'seller' | null;
}

export const SIGNED_OUT: AuthState = { session: GUEST, signedIn: false, email: null, emailVerified: false, intendedRole: null };

export function authStateFromClaims(claims: Record<string, unknown> | null | undefined): AuthState {
  if (!claims || typeof claims.sub !== 'string') return SIGNED_OUT;
  const app = (claims.app_metadata ?? {}) as { role?: string; profile_id?: string };
  const user = (claims.user_metadata ?? {}) as { intended_role?: string; email_verified?: boolean };
  const role = app.role === 'buyer' || app.role === 'seller' || app.role === 'ops' ? (app.role as Exclude<Role, 'guest'>) : null;
  return {
    session: role && app.profile_id ? { role, userId: app.profile_id } : GUEST,
    signedIn: true,
    email: typeof claims.email === 'string' ? claims.email : null,
    // Supabase only issues a session after confirmation when confirmations are on; user_metadata mirrors it.
    emailVerified: user.email_verified !== false,
    intendedRole: user.intended_role === 'buyer' || user.intended_role === 'seller' ? user.intended_role : null,
  };
}
