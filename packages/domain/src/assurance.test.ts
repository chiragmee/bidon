import { describe, expect, it } from 'vitest';
import {
  applyRemedy,
  checkTolerance,
  claimEligibility,
  classifyClaim,
  decideClaim,
  describeRemedy,
  exitRefund,
  openClaim,
  priceAdjustment,
  respondToClaim,
  type ClaimInput,
} from './assurance';
import { at, checkedTx, ctx, lot, tx } from './fixtures';
import type { Claim } from './types';

const buyer = ctx('buyer', 'U-BUYER');
const seller = ctx('seller', 'U-SELLER');
const ops = ctx('ops', 'U-OPS');
const L = lot();

const input: ClaimInput = {
  type: 'contamination',
  observedValue: 14,
  mediaIds: ['P1', 'P2', 'T1'],
  expected: 'Up to 5% (agreed limit 8%)',
  observed: '14% slag and debris',
  explanation: 'Mud and slag below the top layer.',
  requestedRemedy: 'price_adjustment',
};

function opened() {
  const r = openClaim(L, checkedTx(), input, buyer);
  if (!r.ok) throw new Error(r.error.what);
  return r.value;
}

describe('checkTolerance', () => {
  it('contamination vs ceiling (14% vs 8% → 6 pts over)', () => {
    expect(checkTolerance(L, 'contamination', 14)).toMatchObject({ within: false, declared: 5, limit: 8, excess: 6, unit: '%' });
    expect(checkTolerance(L, 'contamination', 7.5)).toMatchObject({ within: true, excess: 0 });
  });
  it('quantity variance vs estimate', () => {
    expect(checkTolerance(L, 'quantity', 38.6).within).toBe(true); // 3.5%
    expect(checkTolerance(L, 'quantity', 30)).toMatchObject({ within: false, excess: 15, unit: 'MT' }); // 25% − 10%
  });
  it('grade / condition have no numeric tolerance', () => {
    expect(checkTolerance(L, 'grade', 0).within).toBeNull();
  });
  it('standard categories have no tolerance', () => {
    const std = lot({ category: 'non_ferrous' });
    expect(checkTolerance(std, 'contamination', 50)).toMatchObject({ within: null, limit: null, excess: 0 });
    expect(checkTolerance(std, 'quantity', 10)).toMatchObject({ within: null, limit: null });
  });
});

describe('claimEligibility — each §16.3 rule fails with its own reason', () => {
  const failing = (l = L, t: Parameters<typeof claimEligibility>[1] = checkedTx(), d: Parameters<typeof claimEligibility>[2] = input) =>
    claimEligibility(l, t, d).checks.filter((c) => !c.passed).map((c) => c.rule);

  it('eligible: TX-1042 scenario passes all six', () => {
    const r = claimEligibility(L, checkedTx(), input);
    expect(r.eligible).toBe(true);
    expect(r.checks).toHaveLength(6);
  });
  it('standard lot → not assured', () => {
    expect(failing(lot({ assurance: { enabled: false, agreedAt: null } }))).toContain('assured');
  });
  it('no transaction / closed transaction', () => {
    expect(failing(L, null)).toEqual(expect.arrayContaining(['valid_transaction', 'lifting_started', 'before_loading_complete']));
    expect(failing(L, checkedTx({ status: 'completed', loadingCompletedAt: at(50) }))).toEqual(
      expect.arrayContaining(['valid_transaction', 'before_loading_complete']),
    );
    expect(claimEligibility(L, checkedTx({ status: 'defaulted' }), input).checks[1]?.what).toMatch(/already closed/);
    expect(claimEligibility(L, null, null).checks[1]?.what).toMatch(/no winning transaction/);
  });
  it('lifting not started', () => {
    expect(failing(L, tx({ status: 'lifting_scheduled' }))).toEqual(['lifting_started']);
  });
  it('within tolerance', () => {
    const r = claimEligibility(L, checkedTx(), { ...input, observedValue: 7 });
    expect(r.checks.find((c) => c.rule === 'outside_tolerance')?.what).toMatch(/7.0% is within the agreed limit of 8.0%/);
  });
  it('within tolerance on a lot with no numeric limit falls back to a generic message', () => {
    const r = claimEligibility(lot({ category: 'non_ferrous' }), checkedTx(), input);
    expect(r.checks.find((c) => c.rule === 'outside_tolerance')?.passed).toBe(true);
  });
  it('missing evidence', () => {
    expect(failing(L, checkedTx(), { ...input, mediaIds: ['P1'] })).toEqual(['evidence_supplied']);
    expect(claimEligibility(L, checkedTx(), { ...input, mediaIds: [] }).checks.at(-1)?.what).toMatch(/0 files/);
  });
  it('after loading complete', () => {
    expect(failing(L, checkedTx({ loadingCompletedAt: at(50) }))).toEqual(['before_loading_complete']);
  });
  it('without a draft only the state rules are checked', () => {
    expect(claimEligibility(L, checkedTx(), null).checks).toHaveLength(4);
  });
});

describe('remedies (D-008)', () => {
  it('CLM-1042-01: 6% × 38.6 MT × ₹36,000 = ₹83,376', () => {
    expect(priceAdjustment(L, checkedTx(), 'contamination', 14)).toBe(83_376);
  });
  it('no adjustment for quantity claims or before weighing', () => {
    expect(priceAdjustment(L, checkedTx(), 'quantity', 30)).toBe(0);
    expect(priceAdjustment(L, tx(), 'contamination', 14)).toBe(0);
  });
  it('exit refunds EMD + balance paid', () => {
    expect(exitRefund(checkedTx())).toBe(1_440_000);
  });
  it('describes remedies without claiming AuctionIT moves money', () => {
    expect(describeRemedy('price_adjustment', 83_376)).toBe('Price reduced by ₹83,376');
    expect(describeRemedy('exit_refund', 1_440_000)).toBe('Buyer exits; the seller returns ₹14,40,000 EMD and balance');
  });
  it('applyRemedy sets final figures', () => {
    expect(applyRemedy(checkedTx(), 'price_adjustment', 83_376, ops)).toMatchObject({
      status: 'resolved',
      resolution: 'price_adjustment',
      finalPayable: 1_306_224,
    });
    expect(applyRemedy(checkedTx(), 'exit_refund', 1_440_000, ops)).toMatchObject({ resolution: 'exit_refund', finalPayable: 0, finalQtyMt: 0 });
    expect(applyRemedy(tx(), 'claim_rejected', 0, ops)).toMatchObject({ finalQtyMt: 40, finalPayable: 1_440_000 });
  });
});

describe('claim lifecycle', () => {
  it('buyer opens an eligible claim → transaction claim_opened', () => {
    const r = opened();
    expect(r.claim).toMatchObject({ status: 'open', type: 'contamination', observedValue: 14, buyerId: 'U-BUYER', sellerId: 'U-SELLER' });
    expect(r.tx.status).toBe('claim_opened');
    expect(r.audit.map((a) => a.action)).toEqual(['open_claim', 'open_claim']);
  });

  it('open: rejects non-buyer, ineligible, missing explanation, unavailable remedy', () => {
    const code = (...a: Parameters<typeof openClaim>) => {
      const r = openClaim(...a);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(code(L, checkedTx(), input, seller)).toBe('forbidden');
    expect(code(L, checkedTx(), { ...input, observedValue: 6 }, buyer)).toBe('not_eligible');
    expect(code(L, checkedTx(), { ...input, explanation: ' ' }, buyer)).toBe('explanation_required');
    const noExit = lot({ category: 'mixed_steel' });
    expect(code(noExit, checkedTx(), { ...input, requestedRemedy: 'exit_refund' }, buyer)).toBe('ok');
    expect(code(L, checkedTx(), { ...input, requestedRemedy: 'bogus' as never }, buyer)).toBe('invalid_remedy');
  });

  it('seller accepts → remedy applied, resolved without Operations', () => {
    const { claim, tx: t } = opened();
    const r = respondToClaim(L, t, claim, { decision: 'accept', explanation: '', mediaIds: [] }, seller);
    if (!r.ok) throw new Error(r.error.what);
    expect(r.value.claim.status).toBe('resolved');
    expect(r.value.tx).toMatchObject({ status: 'resolved', adjustment: 83_376 });
    expect(classifyClaim(r.value.claim)).toBe('clear_exception');
  });

  it('seller disputes → under Operations review', () => {
    const { claim, tx: t } = opened();
    expect(classifyClaim(claim)).toBe('awaiting_seller');
    const r = respondToClaim(L, t, claim, { decision: 'dispute', explanation: 'Transporter mixed sweepings.', mediaIds: ['S1'] }, seller);
    if (!r.ok) throw new Error(r.error.what);
    expect(r.value.claim.status).toBe('under_review');
    expect(r.value.tx.status).toBe('under_review');
    expect(classifyClaim(r.value.claim)).toBe('disputed');
  });

  it('respond: only the lot seller, only once, dispute needs an explanation', () => {
    const { claim, tx: t } = opened();
    const code = (c: Claim, x: Parameters<typeof respondToClaim>[3], cx = seller) => {
      const r = respondToClaim(L, t, c, x, cx);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(code(claim, { decision: 'accept', explanation: '', mediaIds: [] }, ctx('seller', 'U-OTHER'))).toBe('forbidden');
    expect(code({ ...claim, status: 'under_review' }, { decision: 'accept', explanation: '', mediaIds: [] })).toBe('invalid_state');
    expect(code(claim, { decision: 'dispute', explanation: '', mediaIds: [] })).toBe('explanation_required');
  });

  function disputed() {
    const { claim, tx: t } = opened();
    const r = respondToClaim(L, t, claim, { decision: 'dispute', explanation: 'We disagree.', mediaIds: [] }, seller);
    if (!r.ok) throw new Error();
    return r.value;
  }

  it.each([
    ['approve_adjustment', 'resolved', 'price_adjustment', 83_376],
    ['approve_exit', 'resolved', 'exit_refund', 1_440_000],
    ['reject', 'rejected', 'claim_rejected', 0],
  ] as const)('Ops %s → claim %s, tx %s', (outcome, claimStatus, resolution, amount) => {
    const { claim, tx: t } = disputed();
    const r = decideClaim(L, t, claim, { outcome, reason: 'Photos show slag below the top layer.' }, ops);
    if (!r.ok) throw new Error(r.error.what);
    expect(r.value.claim.status).toBe(claimStatus);
    expect(r.value.claim.opsDecision).toMatchObject({ outcome, amount, decidedBy: 'U-OPS' });
    expect(r.value.tx).toMatchObject({ status: 'resolved', resolution });
    expect(r.value.audit[0]).toMatchObject({ actorRole: 'ops', reason: 'Photos show slag below the top layer.' });
  });

  it('decide: only Operations, only under review, reason required', () => {
    const { claim, tx: t } = disputed();
    const code = (c: Claim, reason: string, cx = ops) => {
      const r = decideClaim(L, t, c, { outcome: 'reject', reason }, cx);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(code(claim, 'A good reason here.', buyer)).toBe('forbidden');
    expect(code(claim, 'A good reason here.', seller)).toBe('forbidden');
    expect(code({ ...claim, status: 'open' }, 'A good reason here.')).toBe('invalid_state');
    expect(code(claim, 'short')).toBe('reason_required');
  });
});
