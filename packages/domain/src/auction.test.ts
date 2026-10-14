import { describe, expect, it } from 'vitest';
import {
  buyerBidStatus,
  canCloseEarly,
  closeAuction,
  deriveAuctionStatus,
  hasEmd,
  highestBid,
  minNextBid,
  validateBid,
  type BidAttempt,
} from './auction';
import { at, bid, emd, lot, T0 } from './fixtures';

const buyer = { id: 'U-BUYER', role: 'buyer' as const };

function attempt(over: Partial<BidAttempt> = {}): BidAttempt {
  return {
    lot: lot(),
    bids: [bid(34_500, 'U-OTHER', -10)],
    emds: [emd()],
    actor: buyer,
    amountPerMt: 35_000,
    clientRequestId: 'req-new',
    seenHighestPerMt: 34_500,
    now: T0,
    ...over,
  };
}

describe('deriveAuctionStatus', () => {
  const l = lot({ startAt: at(0), endAt: at(60) });
  it.each([
    [at(-1), 'scheduled'],
    [at(0), 'live'],
    [at(59), 'live'],
    [at(60), 'ended'],
    [at(500), 'ended'],
  ])('at %s → %s', (now, expected) => {
    expect(deriveAuctionStatus(l, now)).toBe(expected);
  });

  it.each(['draft', 'closed_reserve_met', 'closed_unsold', 'awarded'] as const)('stored %s is returned as-is', (s) => {
    expect(deriveAuctionStatus(lot({ status: s }), T0)).toBe(s);
  });
});

describe('highestBid / minNextBid', () => {
  it('no bids → null, minimum = reserve + increment', () => {
    expect(highestBid([])).toBeNull();
    expect(minNextBid(lot(), [])).toBe(32_500);
  });

  it('minimum = highest + increment (LOT-0891: ₹34,500 → ₹35,000)', () => {
    expect(minNextBid(lot(), [bid(34_000), bid(34_500, 'U-B2')])).toBe(35_000);
  });

  it('tie goes to the earliest bid', () => {
    const early = bid(35_000, 'U-EARLY', 1, 'A');
    const late = bid(35_000, 'U-LATE', 2, 'B');
    expect(highestBid([late, early])?.bidderId).toBe('U-EARLY');
  });
});

describe('hasEmd', () => {
  it('needs a succeeded record for that buyer and lot', () => {
    expect(hasEmd([emd()], 'LOT-1', 'U-BUYER')).toBe(true);
    expect(hasEmd([emd('U-BUYER', 'failed')], 'LOT-1', 'U-BUYER')).toBe(false);
    expect(hasEmd([emd()], 'LOT-2', 'U-BUYER')).toBe(false);
  });
});

describe('validateBid', () => {
  it('accepts a valid bid at the minimum', () => {
    const r = validateBid(attempt());
    expect(r).toEqual({ ok: true, value: { amountPerMt: 35_000, minNext: 35_000 } });
  });

  const code = (a: Partial<BidAttempt>) => {
    const r = validateBid(attempt(a));
    if (r.ok) throw new Error('expected rejection');
    expect(r.error.what).toBeTruthy();
    expect(r.error.next).toBeTruthy();
    return r.error.code;
  };

  it('rejects non-buyers', () => {
    expect(code({ actor: { id: 'U-SELLER', role: 'seller' } })).toBe('not_buyer');
    expect(code({ actor: { id: 'U-OPS', role: 'ops' } })).toBe('not_buyer');
  });
  it('rejects a duplicate client request id', () => {
    expect(code({ clientRequestId: 'req-BID-34500-U-OTHER' })).toBe('duplicate');
  });
  it.each([undefined, null, '35000', Number.NaN, -1, 0, 35_000.5, Infinity])('rejects invalid amount %s', (v) => {
    expect(code({ amountPerMt: v })).toBe('invalid_amount');
  });
  it('rejects draft lots', () => {
    expect(code({ lot: lot({ status: 'draft' }) })).toBe('not_published');
  });
  it('rejects before start', () => {
    expect(code({ lot: lot({ startAt: at(10) }) })).toBe('auction_not_started');
  });
  it('rejects after end and on closed lots', () => {
    expect(code({ now: at(500) })).toBe('auction_closed');
    expect(code({ lot: lot({ status: 'closed_unsold' }) })).toBe('auction_closed');
  });
  it('rejects a seller bidding on their own lot', () => {
    expect(code({ lot: lot({ sellerId: 'U-BUYER' }) })).toBe('own_lot');
  });
  it('rejects without EMD', () => {
    expect(code({ emds: [] })).toBe('emd_required');
    expect(code({ emds: [emd('U-BUYER', 'failed')] })).toBe('emd_required');
  });
  it('rejects below minimum when the buyer saw the current price', () => {
    expect(code({ amountPerMt: 34_900 })).toBe('below_minimum');
  });
  it('reports outbid (stale) when someone bid after the buyer looked', () => {
    expect(code({ amountPerMt: 35_000, seenHighestPerMt: 34_000, bids: [bid(35_000, 'U-OTHER')] })).toBe('outbid');
    expect(code({ amountPerMt: 32_000, seenHighestPerMt: null })).toBe('outbid');
  });
  it('first bid must be reserve + increment', () => {
    expect(code({ bids: [], amountPerMt: 32_000, seenHighestPerMt: null })).toBe('below_minimum');
    expect(validateBid(attempt({ bids: [], amountPerMt: 32_500, seenHighestPerMt: null })).ok).toBe(true);
  });
  it('a stale but still-high-enough bid is accepted', () => {
    expect(validateBid(attempt({ seenHighestPerMt: 30_000, amountPerMt: 36_000 })).ok).toBe(true);
  });
});

describe('closeAuction', () => {
  it('highest bid meeting reserve wins', () => {
    const r = closeAuction(lot(), [bid(33_000, 'A'), bid(34_500, 'B'), bid(34_000, 'C')]);
    expect(r.status).toBe('closed_reserve_met');
    expect(r.winningBid?.bidderId).toBe('B');
  });
  it('no bids → unsold', () => {
    expect(closeAuction(lot(), [])).toEqual({ status: 'closed_unsold', winningBid: null });
  });
  it('bids below reserve → unsold', () => {
    expect(closeAuction(lot({ reservePerMt: 40_000 }), [bid(34_500)]).status).toBe('closed_unsold');
  });
  it('bid exactly at reserve wins', () => {
    expect(closeAuction(lot(), [bid(32_000)]).status).toBe('closed_reserve_met');
  });
});

describe('canCloseEarly', () => {
  it('only Operations', () => {
    expect(canCloseEarly(lot(), { id: 'U-SELLER', role: 'seller' }, T0)?.code).toBe('forbidden');
    expect(canCloseEarly(lot(), { id: 'U-OPS', role: 'ops' }, T0)).toBeNull();
  });
  it('only live (or ended) lots', () => {
    const ops = { id: 'U-OPS', role: 'ops' as const };
    expect(canCloseEarly(lot({ startAt: at(10) }), ops, T0)?.code).toBe('not_live');
    expect(canCloseEarly(lot({ status: 'closed_unsold' }), ops, T0)?.what).toMatch(/closed unsold/);
    expect(canCloseEarly(lot(), ops, at(500))).toBeNull();
  });
});

describe('buyerBidStatus', () => {
  const bids = [bid(34_000, 'U-BUYER', 0, 'MINE'), bid(34_500, 'U-OTHER', 1, 'THEIRS')];
  it('none / outbid / leading while live', () => {
    expect(buyerBidStatus(lot(), bids, 'U-NOBODY', T0)).toBe('none');
    expect(buyerBidStatus(lot(), bids, 'U-BUYER', T0)).toBe('outbid');
    expect(buyerBidStatus(lot(), bids, 'U-OTHER', T0)).toBe('leading');
  });
  it('won / closed without winning after close', () => {
    const closed = lot({ status: 'awarded', winningBidId: 'THEIRS' });
    expect(buyerBidStatus(closed, bids, 'U-OTHER', T0)).toBe('won');
    expect(buyerBidStatus(closed, bids, 'U-BUYER', T0)).toBe('closed_not_won');
    expect(buyerBidStatus(lot({ status: 'closed_unsold' }), bids, 'U-BUYER', T0)).toBe('closed_not_won');
  });
});
