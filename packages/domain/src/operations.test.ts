import { describe, expect, it } from 'vitest';
import { hasEmd } from './auction';
import { closeDemoAuction, markNotificationsRead, payEmd, placeBid, processDueClosures, registerBuyer, validateEmail, type BuyerRegistration } from './operations';
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

    const emd = must(payEmd(s, { lotId: 'LOT-2025-0891', outcome: 'success' }, RAHUL, NOW));
    s = emd.state;
    expect(emd.value).toMatchObject({ id: 'EMD-2000', status: 'succeeded', mode: 'simulated', amount: 100_000 });
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

    // Losing bidders' EMDs refunded (simulated); everyone notified.
    expect(s.emds.filter((e) => e.lotId === 'LOT-2025-0891' && e.buyerId !== 'U-RAHUL').every((e) => e.status === 'refunded')).toBe(true);
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

describe('payEmd', () => {
  it('failure records a failed simulated payment and does not enable bidding', () => {
    const r = payEmd(seed(), { lotId: 'LOT-2025-0891', outcome: 'failure' }, RAHUL, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('payment_failed');
    expect(r.state.emds.at(-1)).toMatchObject({ status: 'failed', buyerId: 'U-RAHUL' });
    expect(hasEmd(r.state.emds, 'LOT-2025-0891', 'U-RAHUL')).toBe(false);
    expect(lotDetail(r.state, 'LOT-2025-0891', RAHUL, NOW)?.viewer.emdFailed).toBe(true);
    // Retry succeeds.
    expect(payEmd(r.state, { lotId: 'LOT-2025-0891', outcome: 'success' }, RAHUL, NOW).ok).toBe(true);
  });

  it.each([
    ['LOT-NOPE', RAHUL, 'not_found'],
    ['LOT-2025-0891', SURESH, 'not_buyer'],
    ['LOT-2025-0866', RAHUL, 'auction_closed'],
    ['LOT-2025-0899', RAHUL, 'already_paid'],
  ] as const)('%s by %o → %s', (lotId, actor, code) => {
    const r = payEmd(seed(), { lotId, outcome: 'success' }, actor, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });

  it('a buyer account cannot pay EMD on a lot it sells', () => {
    const s = seed();
    s.lots.find((l) => l.id === 'LOT-2025-0891')!.sellerId = 'U-RAHUL';
    const r = payEmd(s, { lotId: 'LOT-2025-0891', outcome: 'success' }, RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe('own_lot');
  });

  it('can be paid before an auction opens', () => {
    expect(payEmd(seed(), { lotId: 'LOT-2025-0910', outcome: 'success' }, RAHUL, NOW).ok).toBe(true);
  });
});

describe('placeBid', () => {
  it('rejects without changing state, and dedupes by request id', () => {
    const s = seed();
    const r = placeBid(s, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'x', seenHighestPerMt: 34_500 }, RAHUL, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe('emd_required');
    expect(r.state).toBe(s);

    let st = must(payEmd(s, { lotId: 'LOT-2025-0891', outcome: 'success' }, RAHUL, NOW)).state;
    st = must(placeBid(st, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'same', seenHighestPerMt: 34_500 }, RAHUL, NOW)).state;
    const dup = placeBid(st, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'same', seenHighestPerMt: 34_500 }, RAHUL, NOW);
    expect(dup.ok ? 'ok' : dup.error.code).toBe('duplicate');
    expect(placeBid(st, { lotId: 'NOPE', amountPerMt: 1, clientRequestId: 'z', seenHighestPerMt: null }, RAHUL, NOW).ok).toBe(false);
  });

  it('stale bid after someone else outbids → outbid with the new minimum', () => {
    let s = must(payEmd(seed(), { lotId: 'LOT-2025-0894', outcome: 'success' }, { id: 'U-ANITA', role: 'buyer' }, NOW)).state;
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
    companyName: 'NewCo Metals',
    businessType: 'Scrap trader / stockist',
    city: 'Nagpur',
    state: 'Maharashtra',
    industry: 'Steel re-rolling',
    materials: ['Ferrous / HMS'],
  };

  it('creates a real (non-sample) buyer, active without document checks', () => {
    const r = must(registerBuyer(seed(), good, NOW));
    expect(r.value.user).toMatchObject({ id: 'U-2000', role: 'buyer', email: 'asha@newco.example' });
    expect(r.value.company).toMatchObject({ verification: 'demo_approved', sample: false, kind: 'buyer' });
    expect(buyerDashboard(r.state, 'U-2000', NOW)?.stats.activeBids).toBe(0);
  });

  it.each([
    [{ name: '', materials: [] }, 'incomplete_profile', /your name.*materials of interest/],
    [{ email: 'rahul@tata..com' }, 'invalid_email', /two dots/],
    [{ email: 'not-an-email' }, 'invalid_email', /isn't a valid email/],
    [{ email: 'Rahul.Sharma@vardhan.example' }, 'duplicate_email', /already exists/],
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
    expect(d.transactions[0]).toMatchObject({ yourTurn: true, next: { action: 'pay_balance' }, balanceDue: 8_45_000 });
    expect(d.transactions.find((t) => t.id === 'TX-1045')).toMatchObject({ yourTurn: false, next: { role: 'seller' } });
    expect(buyerDashboard(s, 'U-SURESH', NOW)).toBeNull();
  });

  it('marks notifications read', () => {
    const r = markNotificationsRead(s, 'U-RAHUL');
    expect(r.notifications.filter((n) => n.userId === 'U-RAHUL').every((n) => n.read)).toBe(true);
    expect(r.notifications.some((n) => n.userId !== 'U-RAHUL' && !n.read)).toBe(true);
  });
});
