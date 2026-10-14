import { describe, expect, it } from 'vitest';
import { canView, demoSessionFor, parseSession, requiredRole, serializeSession } from './session';

describe('demo session', () => {
  it('round-trips and rejects junk', () => {
    const s = demoSessionFor('buyer');
    expect(parseSession(serializeSession(s))).toEqual({ role: 'buyer', userId: 'U-RAHUL' });
    expect(parseSession('admin:U-X')).toEqual({ role: 'guest', userId: null });
    expect(parseSession('buyer:')).toEqual({ role: 'guest', userId: null });
    expect(parseSession(undefined)).toEqual({ role: 'guest', userId: null });
    expect(demoSessionFor('guest').userId).toBeNull();
  });

  it('guards areas by role', () => {
    expect(requiredRole('/buyer/dashboard')).toBe('buyer');
    expect(requiredRole('/seller/lots/new')).toBe('seller');
    expect(requiredRole('/ops/claims/CLM-1')).toBe('ops');
    expect(requiredRole('/transactions/TX-1')).toBe('signed_in');
    expect(requiredRole('/auctions/LOT-1')).toBeNull();
  });

  it('decides whether a role switch can stay on the current page', () => {
    expect(canView('/auctions/LOT-2025-0891', 'ops')).toBe(true);
    expect(canView('/buyer/dashboard', 'seller')).toBe(false);
    expect(canView('/transactions/TX-1042', 'ops')).toBe(true);
    expect(canView('/transactions/TX-1042', 'guest')).toBe(false);
    expect(canView('/onboarding/buyer', 'buyer')).toBe(false);
    expect(canView('/onboarding/buyer', 'guest')).toBe(true);
  });
});
