import { AUTH_ENABLED } from './flags';

/** Where "create an account" goes: real sign-up on the live site; the onboarding form in browser demo mode. */
export const signUpHref = (role: 'buyer' | 'seller') => (AUTH_ENABLED ? `/sign-up?as=${role}` : `/onboarding/${role}`);
