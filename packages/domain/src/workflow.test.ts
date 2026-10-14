import { describe, expect, it } from 'vitest';
import type { Actor } from './context';
import { closeDemoAuction, payEmd, placeBid } from './operations';
import { createSeed, type DemoState } from './seed';
import { sellerTrackRecord } from './trackRecord';
import type { TxAction } from './transaction';
import type { LotMedia } from './types';
import { buyerDashboard } from './views';
import { opsDecide, runTxAction, sellerRespond, submitClaim } from './workflow';
import { claimReview, formatRemedyOutcome, opsOverview, timeline, transactionDetail } from './workflowViews';

const NOW = '2026-10-15T06:30:00.000Z';
const t = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();
const RAHUL = { id: 'U-RAHUL', role: 'buyer' as const };
const SURESH = { id: 'U-SURESH', role: 'seller' as const };
const OPS = { id: 'U-DEVENDRA', role: 'ops' as const };

function ok<T>(r: { ok: true; state: DemoState; value: T } | { ok: false; error: { what: string } }) {
  if (!r.ok) throw new Error(r.error.what);
  return r;
}
const file = (id: string, kind: LotMedia['kind'] = 'photo'): LotMedia => ({ id, kind, url: '', caption: id, stage: 'lifting', uploadedAt: '' });

/** Journey A 1–8: EMD, bid ₹35,000, Ops closes → TX-2000 for Rahul. */
function wonLot0891() {
  let s = createSeed(NOW);
  s = ok(payEmd(s, { lotId: 'LOT-2025-0891', outcome: 'success' }, RAHUL, NOW)).state;
  s = ok(placeBid(s, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'a', seenHighestPerMt: 34_500 }, RAHUL, NOW)).state;
  const c = ok(closeDemoAuction(s, 'LOT-2025-0891', OPS, t(0.1)));
  return { s: c.state, txId: c.value.transactionId! };
}

function upToChecked(observed: number) {
  const won = wonLot0891();
  const txId = won.txId;
  let s = won.s;
  const run = (a: TxAction, actor: Actor = RAHUL, media: LotMedia[] = []) => (s = ok(runTxAction(s, txId, a, actor, t(1), media)).state);
  run({ type: 'pay_balance' });
  run({ type: 'propose_lifting', at: t(24), vehicle: 'MH 04 GP 8812' });
  run({ type: 'confirm_lifting' }, SURESH);
  run({ type: 'record_weighbridge', ticketRef: 'WB-1', weighbridge: 'Raipur Gate #2', grossMt: 54.2, tareMt: 15.6, measuredMt: 38.6, ticketMediaId: 'T1' }, RAHUL, [file('T1')]);
  run({ type: 'record_condition', observedContaminationPct: observed, notes: 'Checked at loading', photoMediaIds: ['P1', 'P2'] }, RAHUL, [file('P1'), file('P2')]);
  return { s, txId };
}

describe('journey A 9–14, complete branch', () => {
  it('pays, schedules, checks and completes with notifications at each step', () => {
    const { s, txId } = upToChecked(6);
    const d = transactionDetail(s, txId, RAHUL, t(1))!;
    expect(d.tx.status).toBe('material_checked');
    expect(d.contamination).toMatchObject({ within: true, limit: 8 });
    expect(d.reconciliation).toEqual({ payable: 13_51_000, adjustment: 0, paid: 14_00_000, difference: -49_000 });
    expect(d.ticket?.id).toBe('T1');
    expect(d.liftingPhotos.map((m) => m.id)).toEqual(['P1', 'P2']);
    expect(d.can.complete).toBeNull();
    expect(d.yourTurn).toBe(true);

    const done = ok(runTxAction(s, txId, { type: 'complete' }, RAHUL, t(2)));
    expect(done.value).toMatchObject({ status: 'completed', finalQtyMt: 38.6, finalPayable: 13_51_000 });
    const kinds = done.state.notifications.filter((n) => n.href === `/transactions/${txId}`).map((n) => `${n.userId}:${n.kind}`);
    expect(kinds).toEqual(
      expect.arrayContaining(['U-SURESH:balance_paid', 'U-SURESH:lifting_proposed', 'U-RAHUL:lifting_confirmed', 'U-RAHUL:transaction_completed', 'U-SURESH:transaction_completed']),
    );
    expect(sellerTrackRecord('U-SURESH', done.state.transactions, done.state.claims).completedSales).toBe(7);
  });

  it('rejects a step out of order or by the wrong role without changing state', () => {
    const { s, txId } = wonLot0891();
    const r = runTxAction(s, txId, { type: 'confirm_lifting' }, RAHUL, t(1));
    expect(r.ok ? 'ok' : r.error.code).toBe('forbidden');
    expect(r.state).toBe(s);
    expect(runTxAction(s, 'TX-NOPE', { type: 'pay_balance' }, RAHUL, t(1)).ok).toBe(false);
  });
});

describe('journey A 13 claim branch → seller response → Ops (journey C)', () => {
  const input = {
    type: 'contamination' as const,
    observedValue: 14,
    mediaIds: [],
    expected: 'Up to 5%',
    observed: '14% slag',
    explanation: 'Slag under the top layer.',
    requestedRemedy: 'price_adjustment' as const,
  };

  it('eligible claim → seller accepts → remedy applied without Ops', () => {
    const { s, txId } = upToChecked(14);
    expect(transactionDetail(s, txId, RAHUL, t(1))?.remedies.priceAdjustment).toBe(81_060); // 6% × 38.6 × 35,000
    const c = ok(submitClaim(s, txId, input, RAHUL, t(1.5), [file('C1'), file('C2')]));
    expect(c.value).toMatchObject({ status: 'open', mediaIds: ['C1', 'C2'] });
    expect(c.state.notifications.at(-1)).toMatchObject({ userId: 'U-SURESH', kind: 'claim_submitted' });
    expect(submitClaim(c.state, txId, input, RAHUL, t(1.6), [file('C3'), file('C4')]).ok).toBe(false); // one open claim at a time

    const r = ok(sellerRespond(c.state, c.value.id, { decision: 'accept', explanation: '' }, SURESH, t(2)));
    expect(r.value.status).toBe('resolved');
    const tx = r.state.transactions.find((x) => x.id === txId)!;
    expect(tx).toMatchObject({ status: 'resolved', resolution: 'price_adjustment', adjustment: 81_060, finalPayable: 13_51_000 - 81_060 });
    expect(r.state.notifications.filter((n) => n.kind === 'claim_resolved').map((n) => n.userId).sort()).toEqual(['U-RAHUL', 'U-SURESH']);
  });

  it('dispute → Ops queue → reasoned decision, same state for buyer, seller and Ops', () => {
    const { s, txId } = upToChecked(14);
    const c = ok(submitClaim(s, txId, input, RAHUL, t(1.5), [file('C1'), file('C2')]));
    const d = ok(sellerRespond(c.state, c.value.id, { decision: 'dispute', explanation: 'Sweepings from the next bay.' }, SURESH, t(2), [file('S1')]));
    expect(d.state.notifications.some((n) => n.userId === 'U-DEVENDRA' && n.href === `/ops/claims/${c.value.id}`)).toBe(true);

    const queue = opsOverview(d.state, t(2)).queue;
    expect(queue.map((q) => q.claimId)).toEqual(expect.arrayContaining([c.value.id, 'CLM-1042-01']));
    const review = claimReview(d.state, c.value.id, OPS, t(3))!;
    expect(review.outcomes).toEqual({ approve_adjustment: 81_060, approve_exit: 14_00_000, reject: 13_51_000 });
    expect(review.sellerEvidence.map((m) => m.id)).toEqual(['S1']);
    expect(claimReview(d.state, c.value.id, RAHUL, t(3))).toBeNull();

    const decided = ok(opsDecide(d.state, c.value.id, { outcome: 'approve_exit', reason: 'Photos show debris throughout the lower layers.' }, OPS, t(4)));
    expect(decided.value.opsDecision).toMatchObject({ outcome: 'approve_exit', decidedBy: 'U-DEVENDRA', amount: 14_00_000 });
    expect(decided.state.emds.find((e) => e.lotId === 'LOT-2025-0891' && e.buyerId === 'U-RAHUL')?.status).toBe('refunded');

    const views = [RAHUL, SURESH, OPS].map((v) => transactionDetail(decided.state, txId, v, t(4))!);
    expect(new Set(views.map((v) => `${v.tx.status}|${v.tx.resolution}|${v.claim?.status}`)).size).toBe(1);
    expect(views.map((v) => v.as)).toEqual(['buyer', 'seller', 'ops']);
    expect(views[0]?.timeline.map((e) => e.label)).toEqual(
      expect.arrayContaining(['Demo auction closed by Operations', 'Balance paid (simulated)', 'Seller disputed the claim', 'Operations approved exit and refund']),
    );
    expect(buyerDashboard(decided.state, 'U-RAHUL', t(4))?.completed.some((x) => x.id === txId)).toBe(true);
  });

  it('decides the seeded CLM-1042-01 (journey C)', () => {
    const s = createSeed(NOW);
    const r = ok(opsDecide(s, 'CLM-1042-01', { outcome: 'approve_adjustment', reason: 'Lifting photos support slag below the top layer.' }, OPS, NOW));
    expect(r.value.opsDecision?.amount).toBe(83_376);
    expect(r.state.transactions.find((x) => x.id === 'TX-1042')).toMatchObject({ status: 'resolved', finalPayable: 13_89_600 - 83_376 });
    const labels = timeline(r.state, ['CLM-1042-01', 'TX-1042']).map((e) => e.label);
    expect(labels.filter((l) => l === 'Assurance claim opened')).toHaveLength(1);
    expect(timeline(r.state, ['CLM-1042-01']).at(-1)).toMatchObject({ label: 'Operations approved a price adjustment', actor: 'Devendra Nath, Operations' });
    expect(opsOverview(r.state, NOW).stats.openClaims).toBe(0);
    expect(opsOverview(r.state, NOW).decided[0]?.claimId).toBe('CLM-1042-01');
  });

  it.each([
    [() => submitClaim(createSeed(NOW), 'TX-NOPE', input, RAHUL, NOW), 'not_found'],
    [() => submitClaim(createSeed(NOW), 'TX-1038', input, RAHUL, NOW), 'not_eligible'],
    [() => sellerRespond(createSeed(NOW), 'CLM-NOPE', { decision: 'accept', explanation: '' }, SURESH, NOW), 'not_found'],
    [() => sellerRespond(createSeed(NOW), 'CLM-1042-01', { decision: 'accept', explanation: '' }, SURESH, NOW), 'invalid_state'],
    [() => opsDecide(createSeed(NOW), 'CLM-NOPE', { outcome: 'reject', reason: 'x'.repeat(20) }, OPS, NOW), 'not_found'],
    [() => opsDecide(createSeed(NOW), 'CLM-1042-01', { outcome: 'reject', reason: 'x'.repeat(20) }, SURESH, NOW), 'forbidden'],
  ])('rejection %#', (fn, code) => {
    const r = fn();
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });
});

describe('default (Ops, after deadline)', () => {
  it('TX-1035: Ops marks defaulted; EMD forfeited; both parties notified', () => {
    const s = createSeed(NOW);
    const d = transactionDetail(s, 'TX-1035', OPS, NOW)!;
    expect(d.deadlinePassed).toBe(true);
    expect(d.can.mark_defaulted).toBeNull();
    const r = ok(runTxAction(s, 'TX-1035', { type: 'mark_defaulted', reason: 'Balance not paid within 72 hours.' }, OPS, NOW));
    expect(r.value.status).toBe('defaulted');
    expect(r.state.emds.find((e) => e.lotId === 'LOT-2025-0855' && e.buyerId === 'U-MEERA')?.status).toBe('forfeited');
    expect(r.state.notifications.filter((n) => n.kind === 'transaction_defaulted')).toHaveLength(2);
    expect(opsOverview(r.state, NOW).metrics.find((m) => m.label === 'Defaults')?.value).toBe('1');
  });
});

describe('views', () => {
  const s = createSeed(NOW);
  it('transaction detail is visible only to its parties and Ops', () => {
    expect(transactionDetail(s, 'TX-1042', { id: 'U-ANITA', role: 'buyer' }, NOW)).toBeNull();
    expect(transactionDetail(s, 'TX-1042', { id: null, role: 'guest' }, NOW)).toBeNull();
    expect(transactionDetail(s, 'TX-NOPE', OPS, NOW)).toBeNull();
    const d = transactionDetail(s, 'TX-1042', SURESH, NOW)!;
    expect(d).toMatchObject({ as: 'seller', buyer: 'Vardhan Infra Projects Pvt Ltd', seller: 'Shree Balaji Steels' });
    expect(d.claim?.id).toBe('CLM-1042-01');
    expect(d.claimMedia.buyer).toHaveLength(3);
    expect(d.claimMedia.seller).toHaveLength(1);
    expect(d.contamination).toMatchObject({ within: false, excess: 6 });
  });

  it('ops overview: stats, simulated metrics, baseline and queue for the seed', () => {
    const o = opsOverview(s, NOW);
    expect(o.stats).toEqual({ live: 3, closed: expect.any(Number), awaitingAction: 4, openClaims: 1, completed: 9 });
    expect(o.metrics.every((m) => m.caption.includes('simulated') || m.caption.includes('Sample'))).toBe(true);
    expect(o.baseline.caption).toMatch(/case study, not platform data/);
    expect(o.queue[0]).toMatchObject({ claimId: 'CLM-1042-01', sellerResponse: 'Disputed', evidenceCount: 3, requestedRemedy: 'Price adjustment' });
    expect(o.transactions[0]).toMatchObject({ id: 'TX-1035', overdue: true });
    expect(o.auctions[0]?.status).toBe('live');
    expect(o.recent).toHaveLength(10);
  });

  it('formats remedy outcomes', () => {
    expect(formatRemedyOutcome('approve_adjustment', 83_376)).toMatch(/Deduct ₹83,376/);
    expect(formatRemedyOutcome('approve_exit', 1)).toMatch(/Return/);
    expect(formatRemedyOutcome('reject', 1)).toMatch(/Original terms/);
  });
});
