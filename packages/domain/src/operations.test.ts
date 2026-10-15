import { describe, expect, it } from 'vitest';
import { hasEmd } from './auction';
import { closeDemoAuction, markNotificationsRead, placeBid, processDueClosures, registerBuyer, validateEmail, type BuyerRegistration } from './operations';
import { confirmedEmd, payment } from './fixtures';
import { decideEmd, recordEmdRefund, submitEmd } from './payments';
import { createSeed } from './seed';
import { buyerDashboard, listLots, lotDetail, transactionSummary } from './views';

const NOW = '2026-10-15T06:30:00.000Z';
const later = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();
const RAHUL = { id: 'U-RAHUL', role: 'buyer' as const };
const OPS = { id: 'U-DEVENDRA', role: 'ops' as const };
const SURESH = { id: 'U-SURESH', role: 'seller' as const };
const seed = () => createSeed(NOW);

function must<T>(r: { ok: true; value: T; state: ReturnType<typeof seed> } | { ok: false; error: { what: string } }) {
  if (!r.ok) throw new Error(r.error.what);
  return r;
}

describe('journey A in operations: EMD → bid → close → transaction', () => {
  it('runs end to end with consistent views for every role', () => {
    let s = seed();
    expect(lotDetail(s, 'LOT-2025-0891', RAHUL, NOW)?.viewer.emdPaid).toBe(false);

    const emd = must(submitEmd(s, 'LOT-2025-0891', payment(100_000, NOW), RAHUL, NOW));
    expect(emd.value).toMatchObject({ id: 'EMD-2000', status: 'submitted', mode: 'manual', amount: 100_000 });
    expect(hasEmd(emd.state.emds, 'LOT-2025-0891', 'U-RAHUL')).toBe(false);
    s = must(decideEmd(emd.state, 'EMD-2000', { decision: 'confirmed', reason: '' }, SURESH, NOW)).state;
    expect(hasEmd(s.emds, 'LOT-2025-0891', 'U-RAHUL')).toBe(true);

    const bid = must(placeBid(s, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'r1', seenHighestPerMt: 34_500 }, RAHUL, NOW));
    s = bid.state;
    expect(bid.value).toMatchObject({ minNext: 35_500, leading: true });
    expect(bid.value.bid.id).toBe('BID-2000');
    expect(s.notifications.some((n) => n.userId === 'U-ANITA' && n.kind === 'outbid')).toBe(true);
    expect(lotDetail(s, 'LOT-2025-0891', RAHUL, NOW)?.viewer.bidStatus).toBe('leading');

    const closed = must(closeDemoAuction(s, 'LOT-2025-0891', OPS, later(0.1)));
    s = closed.state;
    expect(closed.value.status).toBe('awarded');
    const txId = closed.value.transactionId!;
    expect(txId).toBe('TX-2000');
    const tx = s.transactions.find((t) => t.id === txId)!;
    expect(tx).toMatchObject({ buyerId: 'U-RAHUL', pricePerMt: 35_000, status: 'won_awaiting_balance', sellerId: 'U-SURESH' });

    // Losing bidders' EMDs are owed back until the seller records each refund; the winner's counts toward the price.
    expect(s.emds.filter((e) => e.lotId === 'LOT-2025-0891' && e.buyerId !== 'U-RAHUL').every((e) => e.status === 'refund_due')).toBe(true);
    expect(s.emds.find((e) => e.lotId === 'LOT-2025-0891' && e.buyerId === 'U-RAHUL')?.status).toBe('confirmed');
    expect(s.notifications.findLast((n) => n.userId === 'U-RAHUL' && n.kind === 'auction_won')?.href).toBe(`/transactions/${txId}`);

    // Same state across roles.
    const forBuyer = lotDetail(s, 'LOT-2025-0891', RAHUL, later(0.1))!;
    expect(forBuyer.result).toEqual({ outcome: 'sold', winningBidPerMt: 35_000, wonByViewer: true });
    expect(forBuyer.viewer.transactionId).toBe(txId);
    expect(lotDetail(s, 'LOT-2025-0891', SURESH, later(0.1))?.viewer.transactionId).toBe(txId);
    expect(lotDetail(s, 'LOT-2025-0891', { id: 'U-ANITA', role: 'buyer' }, later(0.1))?.viewer).toMatchObject({ transactionId: null, bidStatus: 'closed_not_won' });
    expect(buyerDashboard(s, 'U-RAHUL', later(0.1))?.transactions.find((t) => t.id === txId)?.yourTurn).toBe(true);
    expect(transactionSummary(s, txId, SURESH)?.counterparty).toBe('Vardhan Infra Projects Pvt Ltd');
    expect(transactionSummary(s, txId, { id: 'U-ANITA', role: 'buyer' })).toBeNull();
  });
});

describe('EMD: buyer reports, seller confirms (offline payment)', () => {
  const ANITA = { id: 'U-ANITA', role: 'buyer' as const };

  it('a reported payment does not allow bidding until the seller confirms it', () => {
    const r = must(submitEmd(seed(), 'LOT-2025-0891', payment(100_000, NOW), RAHUL, NOW));
    expect(r.state.notifications.at(-1)).toMatchObject({ userId: 'U-SURESH', kind: 'emd_submitted' });
    expect(lotDetail(r.state, 'LOT-2025-0891', RAHUL, NOW)?.viewer).toMatchObject({ emdPaid: false, emd: { status: 'submitted', payment: { reference: 'UTR000123456' } } });
    const bid = placeBid(r.state, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'x', seenHighestPerMt: 34_500 }, RAHUL, NOW);
    expect(bid.ok ? 'ok' : bid.error.code).toBe('emd_required');
    const again = submitEmd(r.state, 'LOT-2025-0891', payment(100_000, NOW), RAHUL, NOW);
    expect(again.ok ? 'ok' : again.error.code).toBe('already_submitted');
  });

  it('rejection needs a reason; the buyer corrects and resubmits, keeping the history', () => {
    let s = must(submitEmd(seed(), 'LOT-2025-0891', payment(100_000, NOW, 'UTR-WRONG'), RAHUL, NOW)).state;
    const noReason = decideEmd(s, 'EMD-2000', { decision: 'rejected', reason: '' }, SURESH, NOW);
    expect(noReason.ok ? 'ok' : noReason.error.code).toBe('reason_required');
    s = must(decideEmd(s, 'EMD-2000', { decision: 'rejected', reason: 'No credit with this UTR' }, SURESH, NOW)).state;
    expect(lotDetail(s, 'LOT-2025-0891', RAHUL, NOW)?.viewer.emd).toMatchObject({ status: 'rejected', decision: { reason: 'No credit with this UTR', decidedBy: 'U-SURESH' } });
    s = must(submitEmd(s, 'LOT-2025-0891', payment(100_000, NOW, 'UTR-RIGHT'), RAHUL, NOW)).state;
    const e = s.emds.find((x) => x.id === 'EMD-2000')!;
    expect(e).toMatchObject({ status: 'submitted', reference: 'UTR-RIGHT' });
    expect(e.history?.map((h) => h.type)).toEqual(['submitted', 'decided', 'submitted']);
    expect(s.audit.filter((a) => a.entityId === 'EMD-2000').map((a) => a.action)).toEqual(['submit_emd', 'reject_emd', 'resubmit_emd']);
  });

  it('only the lot’s seller confirms, and only a waiting payment', () => {
    const s = must(submitEmd(seed(), 'LOT-2025-0891', payment(100_000, NOW), RAHUL, NOW)).state;
    for (const actor of [RAHUL, OPS, { id: 'U-IMRAN', role: 'seller' as const }]) {
      const r = decideEmd(s, 'EMD-2000', { decision: 'confirmed', reason: '' }, actor, NOW);
      expect(r.ok ? 'ok' : r.error.code).toBe('forbidden');
    }
    const confirmed = must(decideEmd(s, 'EMD-2000', { decision: 'confirmed', reason: '' }, SURESH, NOW)).state;
    const twice = decideEmd(confirmed, 'EMD-2000', { decision: 'rejected', reason: 'changed my mind' }, SURESH, NOW);
    expect(twice.ok ? 'ok' : twice.error.code).toBe('not_pending');
  });

  it.each([
    [{ amount: 90_000 }, 'amount_mismatch'],
    [{ reference: '' }, 'invalid_payment'],
    [{ payerName: '' }, 'invalid_payment'],
    [{ paidOn: '2099-01-01' }, 'invalid_payment'],
    [{ method: 'cash' }, 'invalid_payment'],
    [{ receiptDocumentId: 'DOC-NOT-MINE' }, 'invalid_receipt'],
  ] as const)('reported payment %o → %s', (patch, code) => {
    const r = submitEmd(seed(), 'LOT-2025-0891', { ...payment(100_000, NOW), ...patch } as never, RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });

  it.each([
    ['LOT-NOPE', RAHUL, 'not_found'],
    ['LOT-2025-0891', SURESH, 'not_buyer'],
    ['LOT-2025-0866', RAHUL, 'auction_closed'],
    ['LOT-2025-0899', RAHUL, 'already_paid'],
  ] as const)('%s by %o → %s', (lotId, actor, code) => {
    const r = submitEmd(seed(), lotId, payment(seed().lots.find((l) => l.id === lotId)?.emdAmount ?? 1, NOW), actor, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });

  it('a buyer account cannot pay EMD on a lot it sells', () => {
    const s = seed();
    s.lots.find((l) => l.id === 'LOT-2025-0891')!.sellerId = 'U-RAHUL';
    const r = submitEmd(s, 'LOT-2025-0891', payment(100_000, NOW), RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe('own_lot');
  });

  it('only approved buyers report an EMD; the reason depends on their status', () => {
    const s = seed();
    s.companies.find((c) => c.id === 'C-VARDHAN')!.verification = 'pending_review';
    const r = submitEmd(s, 'LOT-2025-0891', payment(100_000, NOW), RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error).toMatchObject({ code: 'not_eligible', next: expect.stringMatching(/under review/) });
    expect(lotDetail(s, 'LOT-2025-0891', RAHUL, NOW)?.viewer).toMatchObject({ eligible: false, paymentInstructions: null });
  });

  it('can be reported before an auction opens', () => {
    expect(submitEmd(seed(), 'LOT-2025-0910', payment(seed().lots.find((l) => l.id === 'LOT-2025-0910')!.emdAmount, NOW), RAHUL, NOW).ok).toBe(true);
  });

  it('losing and unsold EMDs are owed back; the seller records each refund in full', () => {
    let s = confirmedEmd(seed(), 'LOT-2025-0891', RAHUL, NOW);
    s = must(closeDemoAuction(s, 'LOT-2025-0891', OPS, later(0.1))).state;
    const due = s.emds.filter((e) => e.lotId === 'LOT-2025-0891' && e.status === 'refund_due');
    expect(due.length).toBeGreaterThan(0);
    const id = due[0]!.id;
    const partial = recordEmdRefund(s, id, { amount: 1, refundedOn: NOW.slice(0, 10), reference: 'UTR-REF-1', note: '' }, SURESH, later(0.2));
    expect(partial.ok ? 'ok' : partial.error.code).toBe('invalid_refund');
    const byBuyer = recordEmdRefund(s, id, { amount: due[0]!.amount, refundedOn: NOW.slice(0, 10), reference: 'UTR-REF-1', note: '' }, ANITA, later(0.2));
    expect(byBuyer.ok ? 'ok' : byBuyer.error.code).toBe('forbidden');
    const r = must(recordEmdRefund(s, id, { amount: due[0]!.amount, refundedOn: NOW.slice(0, 10), reference: 'UTR-REF-1', note: 'Refunded to source account' }, SURESH, later(0.2)));
    expect(r.value).toMatchObject({ status: 'refunded', refund: { reference: 'UTR-REF-1', recordedBy: 'U-SURESH' } });
    expect(r.state.notifications.at(-1)).toMatchObject({ userId: due[0]!.buyerId, kind: 'refund_recorded' });
  });
});

describe('placeBid', () => {
  it('rejects without changing state, and dedupes by request id', () => {
    const s = seed();
    const r = placeBid(s, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'x', seenHighestPerMt: 34_500 }, RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe('emd_required');
    expect(r.state).toBe(s);

    let st = confirmedEmd(s, 'LOT-2025-0891', RAHUL, NOW);
    st = must(placeBid(st, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'same', seenHighestPerMt: 34_500 }, RAHUL, NOW)).state;
    const dup = placeBid(st, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'same', seenHighestPerMt: 34_500 }, RAHUL, NOW);
    expect(dup.ok ? 'ok' : dup.error.code).toBe('duplicate');
    expect(placeBid(st, { lotId: 'NOPE', amountPerMt: 1, clientRequestId: 'z', seenHighestPerMt: null }, RAHUL, NOW).ok).toBe(false);
  });

  it('stale bid after someone else outbids → outbid with the new minimum', () => {
    let s = confirmedEmd(seed(), 'LOT-2025-0894', { id: 'U-ANITA', role: 'buyer' }, NOW);
    s = must(placeBid(s, { lotId: 'LOT-2025-0894', amountPerMt: 1_92_000, clientRequestId: 'a', seenHighestPerMt: 1_90_000 }, { id: 'U-ANITA', role: 'buyer' }, NOW)).state;
    const r = placeBid(s, { lotId: 'LOT-2025-0894', amountPerMt: 1_92_000, clientRequestId: 'b', seenHighestPerMt: 1_90_000 }, RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error).toMatchObject({ code: 'outbid', next: expect.stringContaining('₹1,94,000/MT') });
  });
});

describe('closing', () => {
  it('processDueClosures closes ended lots on read and is a no-op otherwise', () => {
    const s = seed();
    expect(processDueClosures(s, NOW)).toEqual({ state: s, closed: [] });
    const r = processDueClosures(s, later(1)); // LOT-0894 ended at +40 min
    expect(r.closed).toEqual(['LOT-2025-0894']);
    const tx = r.state.transactions.find((t) => t.lotId === 'LOT-2025-0894')!;
    expect(tx).toMatchObject({ buyerId: 'U-MEERA', pricePerMt: 1_90_000 });
    expect(r.state.notifications.some((n) => n.userId === 'U-RAHUL' && n.kind === 'auction_lost')).toBe(true);
    expect(buyerDashboard(r.state, 'U-RAHUL', later(1))?.closedBids.map((b) => b.lotId)).toContain('LOT-2025-0894');
  });

  it('unsold when no bids: closing an auction with no bids', () => {
    const s = seed();
    const lot = s.lots.find((l) => l.id === 'LOT-2025-0910')!;
    lot.startAt = NOW;
    const r = must(closeDemoAuction(s, lot.id, OPS, later(0.5)));
    expect(r.value).toEqual({ status: 'closed_unsold', transactionId: null });
    expect(r.state.audit.at(-1)).toMatchObject({ action: 'close_demo_auction', to: 'closed_unsold', actorId: 'U-DEVENDRA' });
  });

  it.each([
    ['LOT-2025-0891', SURESH, 'forbidden'],
    ['LOT-2025-0891', RAHUL, 'forbidden'],
    ['LOT-2025-0910', OPS, 'not_live'],
    ['LOT-2025-0866', OPS, 'not_live'],
    ['NOPE', OPS, 'not_found'],
  ] as const)('close %s by %o → %s', (lotId, actor, code) => {
    const r = closeDemoAuction(seed(), lotId, actor, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });
});

describe('registerBuyer (§9)', () => {
  const good: BuyerRegistration = {
    name: 'Asha Menon',
    email: 'asha@newco.example',
    phone: '98765 43210',
    companyName: 'NewCo Metals',
    businessType: 'Scrap trader / stockist',
    city: 'Nagpur',
    state: 'Maharashtra',
    industry: 'Steel re-rolling',
    materials: ['Ferrous / HMS'],
  };

  it('creates a real (non-sample) buyer that must apply for approval before bidding', () => {
    const r = must(registerBuyer(seed(), { ...good, authUserId: 'auth-asha' }, NOW));
    expect(r.value.user).toMatchObject({ id: 'U-2000', role: 'buyer', email: 'asha@newco.example', phone: '+919876543210', authUserId: 'auth-asha' });
    expect(r.value.company).toMatchObject({ verification: 'incomplete', sample: false, kind: 'buyer' });
    const emd = submitEmd(r.state, 'LOT-2025-0891', payment(100_000, NOW), { id: 'U-2000', role: 'buyer' }, NOW);
    expect(emd.ok ? 'ok' : emd.error.code).toBe('not_eligible');
    expect(buyerDashboard(r.state, 'U-2000', NOW)?.stats.activeBids).toBe(0);
  });

  it.each([
    [{ name: '', materials: [] }, 'incomplete_profile', /your name.*materials of interest/],
    [{ email: 'rahul@tata..com' }, 'invalid_email', /two dots/],
    [{ email: 'not-an-email' }, 'invalid_email', /isn't a valid email/],
    [{ email: 'Rahul.Sharma@vardhan.example' }, 'duplicate_account', /already uses this email, mobile number or sign-in/],
    [{ phone: '12345' }, 'invalid_phone', /10-digit/],
  ] as const)('%o → %s', (patch, code, msg) => {
    const r = registerBuyer(seed(), { ...good, ...patch } as BuyerRegistration, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
    if (!r.ok) expect(r.error.what).toMatch(msg);
  });

  it('validateEmail', () => {
    expect(validateEmail('')).toMatch(/Enter/);
    expect(validateEmail('a@b.co')).toBeNull();
  });
});

describe('views', () => {
  const s = seed();

  it('catalogue defaults to live + upcoming, ordered closing soonest first', () => {
    const r = listLots(s, {}, NOW);
    expect(r.items.map((i) => i.id)).toEqual(['LOT-2025-0894', 'LOT-2025-0891', 'LOT-2025-0899', 'LOT-2025-0910', 'LOT-2025-0905']);
    expect(r.facets.statuses).toEqual({ live: 3, upcoming: 2, closed: expect.any(Number) });
    expect(r.items.every((i) => i.status !== 'draft')).toBe(true);
  });

  it('filters: keyword, category, city, assured, ending soon, closed', () => {
    const ids = (f: Parameters<typeof listLots>[1]) => listLots(s, f, NOW).items.map((i) => i.id);
    expect(ids({ q: 'copper' })).toEqual(['LOT-2025-0899']);
    expect(ids({ q: 'shree balaji' })).toEqual(['LOT-2025-0891', 'LOT-2025-0905']);
    expect(ids({ categories: ['mixed_steel'] })).toEqual(['LOT-2025-0905']);
    expect(ids({ city: 'Pune' })).toEqual(['LOT-2025-0894']);
    expect(ids({ assured: true })).toEqual(['LOT-2025-0891', 'LOT-2025-0905']);
    expect(ids({ endingSoon: true })).toEqual(['LOT-2025-0894', 'LOT-2025-0891', 'LOT-2025-0899']);
    expect(ids({ statuses: ['closed'] })).toContain('LOT-2025-0866');
    expect(ids({ q: 'nothing matches this' })).toEqual([]);
  });

  it('sorts by newest and by bid', () => {
    expect(listLots(s, { sort: 'bid' }, NOW).items[0]?.id).toBe('LOT-2025-0899');
    const newest = listLots(s, { sort: 'newest' }, NOW).items.map((i) => i.id);
    expect(newest[0]).toBe('LOT-2025-0905');
    const closedSorted = listLots(s, { statuses: ['closed'] }, NOW).items;
    expect(Date.parse(closedSorted[0]!.closedAt!)).toBeGreaterThanOrEqual(Date.parse(closedSorted[1]!.closedAt!));
  });

  it('lot detail anonymises other bidders and hides drafts from non-owners', () => {
    const d = lotDetail(s, 'LOT-2025-0899', RAHUL, NOW)!;
    expect(d.bids.map((b) => b.label)).toEqual(['You', 'Bidder 2', 'Bidder 1']);
    expect(d.viewer).toMatchObject({ bidStatus: 'leading', emdPaid: true, myHighestPerMt: 6_10_000 });
    expect(lotDetail(s, 'LOT-2025-0920', RAHUL, NOW)).toBeNull();
    expect(lotDetail(s, 'LOT-2025-0920', SURESH, NOW)?.status).toBe('draft');
    expect(lotDetail(s, 'NOPE', RAHUL, NOW)).toBeNull();
    expect(lotDetail(s, 'LOT-2025-0866', RAHUL, NOW)?.result).toEqual({ outcome: 'unsold', winningBidPerMt: null, wonByViewer: false });
    expect(lotDetail(s, 'LOT-2025-0891', { id: null, role: 'guest' }, NOW)?.viewer).toMatchObject({ emdPaid: false, bidStatus: 'none' });
  });

  it('buyer dashboard for Rahul matches the seed', () => {
    const d = buyerDashboard(s, 'U-RAHUL', NOW)!;
    expect(d.stats).toMatchObject({ activeBids: 2, leading: 1, outbid: 1, closingSoon: 1, wonNextStep: 1, inProgress: 2, completed: 1 });
    expect(d.transactions.map((t) => t.id)).toEqual(['TX-1038', 'TX-1045', 'TX-1042']);
    expect(d.transactions[0]).toMatchObject({ yourTurn: true, next: { action: 'submit_balance_payment' }, balanceDue: 8_45_000 });
    expect(d.transactions.find((t) => t.id === 'TX-1045')).toMatchObject({ yourTurn: false, next: { role: 'seller' } });
    expect(buyerDashboard(s, 'U-SURESH', NOW)).toBeNull();
  });

  it('marks notifications read', () => {
    const r = markNotificationsRead(s, 'U-RAHUL');
    expect(r.notifications.filter((n) => n.userId === 'U-RAHUL').every((n) => n.read)).toBe(true);
    expect(r.notifications.some((n) => n.userId !== 'U-RAHUL' && !n.read)).toBe(true);
  });
});
