import { describe, expect, it } from 'vitest';
import { audit, sequentialIds } from './context';
import { checkedTx, ctx, tx } from './fixtures';
import { formatAge, formatCountdown, formatINR, formatMt, formatPct } from './format';
import { CATEGORIES, policyFor, suggestedEmd } from './policy';
import { describeTrackRecord, sellerTrackRecord } from './trackRecord';
import type { Claim } from './types';
import { fail, ok } from './types';

describe('formatINR', () => {
  it.each([
    [100_000, {}, '₹1,00,000'],
    [1_389_600, {}, '₹13,89,600'],
    [34_500, { perMt: true }, '₹34,500/MT'],
    [1_380_000, { estimate: true }, '~₹13,80,000'],
    [-50_400, {}, '−₹50,400'],
    [83_376, { signed: true }, '+₹83,376'],
    [0, { signed: true }, '₹0'],
    [999.6, {}, '₹1,000'],
  ] as const)('%s %o → %s', (n, o, s) => expect(formatINR(n, o)).toBe(s));
});

describe('other formatters', () => {
  it('quantities', () => {
    expect(formatMt(38.6)).toBe('38.6 MT');
    expect(formatMt(40, { estimate: true })).toBe('~40 MT');
    expect(formatMt(1234.567)).toBe('1,234.57 MT');
  });
  it('percent', () => expect(formatPct(14)).toBe('14.0%'));
  it.each([
    [0, 'Closed', false],
    [3 * 3_600_000 + 42 * 60_000, '3h 42m', false],
    [42 * 60_000 + 18_000, '42:18', true],
    [2 * 86_400_000 + 5 * 3_600_000, '2d 5h', false],
  ])('countdown %s → %s', (msLeft, label, urgent) => expect(formatCountdown(msLeft)).toEqual({ label, urgent }));
  it.each([
    [35 * 60_000, '35m'],
    [(2 * 1440 + 4 * 60) * 60_000, '2d 4h'],
    [125 * 60_000, '2h 5m'],
    [-5, '0m'],
  ])('age %s → %s', (msAgo, s) => expect(formatAge(msAgo)).toBe(s));
});

describe('policy', () => {
  it('every category is flagged demo', () => {
    expect(CATEGORIES.every((c) => c.demo === true)).toBe(true);
  });
  it('assurance pilot = ferrous / mixed steel only, each with tolerance, remedies and evidence', () => {
    const assured = CATEGORIES.filter((c) => c.assuranceEligible).map((c) => c.id);
    expect(assured).toEqual(['ferrous_hms', 'mixed_steel']);
    for (const id of assured) {
      const p = policyFor(id);
      expect(p.tolerance).not.toBeNull();
      expect(p.remedies).toEqual(['price_adjustment', 'exit_refund']);
      expect(p.evidence).toEqual({ minPhotos: 6, minVideos: 1 });
    }
  });
  it('tolerances are category-specific, not one hard-coded rule', () => {
    expect(policyFor('ferrous_hms').tolerance?.contaminationCeilingPct).not.toBe(policyFor('mixed_steel').tolerance?.contaminationCeilingPct);
  });
  it('suggested EMD: 7.5% of reserve value rounded up (LOT-0891 → ₹1,00,000), with a floor', () => {
    expect(suggestedEmd('ferrous_hms', 32_000, 40)).toBe(100_000);
    expect(suggestedEmd('ferrous_hms', 1_000, 1)).toBe(25_000);
  });
});

describe('sellerTrackRecord', () => {
  const claim = (status: Claim['status'], sellerId = 'U-SELLER') => ({ sellerId, status }) as Claim;
  it('counts completed and resolved (non-exit) sales and closed claims', () => {
    const txs = [
      tx({ id: 'a', status: 'completed' }),
      tx({ id: 'b', status: 'completed' }),
      tx({ id: 'c', status: 'resolved', resolution: 'price_adjustment' }),
      tx({ id: 'd', status: 'resolved', resolution: 'exit_refund' }),
      tx({ id: 'e', status: 'won_awaiting_balance' }),
      tx({ id: 'f', status: 'completed', sellerId: 'U-OTHER' }),
    ];
    const r = sellerTrackRecord('U-SELLER', txs, [claim('resolved'), claim('rejected'), claim('under_review'), claim('resolved', 'U-OTHER')]);
    expect(r).toEqual({ completedSales: 3, claimsRaised: 3, claimsResolved: 2, claimsUpheld: 1, hasHistory: true });
    expect(describeTrackRecord(r)).toBe('3 completed sales · 2 resolved claims');
  });
  it('new seller has no history', () => {
    const r = sellerTrackRecord('U-NEW', [checkedTx({ sellerId: 'U-NEW' })], []);
    expect(r.hasHistory).toBe(false);
    expect(describeTrackRecord(r)).toMatch(/New seller/);
  });
  it('wording for zero and one claim', () => {
    const base = { completedSales: 6, claimsRaised: 0, claimsResolved: 0, claimsUpheld: 0, hasHistory: true };
    expect(describeTrackRecord(base)).toBe('6 completed sales · no claims');
    expect(describeTrackRecord({ ...base, claimsResolved: 1 })).toBe('6 completed sales · 1 resolved claim');
  });
});

describe('context + result helpers', () => {
  it('sequential ids per prefix', () => {
    const id = sequentialIds(1000);
    expect([id('TX'), id('TX'), id('CLM')]).toEqual(['TX-1000', 'TX-1001', 'CLM-1000']);
  });
  it('audit fills actor and time', () => {
    const c = ctx('ops', 'U-OPS');
    expect(audit(c, { entity: 'lot', entityId: 'L', action: 'close' })).toMatchObject({ actorId: 'U-OPS', actorRole: 'ops', from: null, reason: null, at: c.now });
  });
  it('ok / fail', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(fail('x', 'what', 'next')).toEqual({ ok: false, error: { code: 'x', what: 'what', next: 'next' } });
  });
});
