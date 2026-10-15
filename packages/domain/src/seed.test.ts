import { describe, expect, it } from 'vitest';
import { claimEligibility, priceAdjustment } from './assurance';
import { closeAuction, deriveAuctionStatus, hasEmd, highestBid, minNextBid } from './auction';
import { draftFromLot, validateListingStep } from './listing';
import { createSeed, DEMO_ACCOUNTS, NEW_ID_START } from './seed';
import { sellerTrackRecord } from './trackRecord';
import { reconcile } from './transaction';

const NOW = '2026-10-15T06:30:00.000Z';
const s = createSeed(NOW);
const lot = (id: string) => s.lots.find((l) => l.id === id)!;
const tx = (id: string) => s.transactions.find((t) => t.id === id)!;
const status = (id: string) => deriveAuctionStatus(lot(id), NOW);
const bidsOf = (id: string) => s.bids.filter((b) => b.lotId === id);

describe('seed shape', () => {
  it('ids are unique and below the new-id range', () => {
    for (const list of [s.lots, s.bids, s.emds, s.transactions, s.claims, s.audit, s.notifications]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const t of s.transactions) expect(Number(t.id.slice(3))).toBeLessThan(NEW_ID_START);
  });

  it('media ids are unique across lots and transactions (they share one table in Postgres)', () => {
    const ids = [...s.lots.flatMap((l) => l.media), ...s.transactions.flatMap((t) => t.media)].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every company is labelled sample data', () => {
    expect(s.companies.every((c) => c.sample)).toBe(true);
  });

  it('demo accounts exist with the right roles', () => {
    for (const [role, id] of Object.entries(DEMO_ACCOUNTS)) expect(s.users.find((u) => u.id === id)?.role).toBe(role);
  });

  it('does not use real-company names from the Stitch mock-ups (D-026)', () => {
    const text = JSON.stringify(s);
    for (const name of ['Tata', 'Jindal', 'Om Logistics']) expect(text).not.toContain(name);
  });

  it('is deterministic for a given reset time and moves with it', () => {
    expect(createSeed(NOW)).toEqual(s);
    const later = createSeed('2027-03-01T00:00:00.000Z');
    expect(deriveAuctionStatus(later.lots.find((l) => l.id === 'LOT-2025-0891')!, '2027-03-01T00:00:00.000Z')).toBe('live');
  });
});

describe('dates are relative to reset (CLAUDE.md Demo data)', () => {
  it('live, ending-soon, upcoming and draft lots are where PLAN §4 says', () => {
    expect(status('LOT-2025-0891')).toBe('live');
    expect(Date.parse(lot('LOT-2025-0891').endAt) - Date.parse(NOW)).toBe(3 * 3_600_000);
    expect(status('LOT-2025-0894')).toBe('live');
    expect(Date.parse(lot('LOT-2025-0894').endAt) - Date.parse(NOW)).toBe(40 * 60_000);
    expect(status('LOT-2025-0899')).toBe('live');
    expect(status('LOT-2025-0910')).toBe('scheduled');
    expect(Date.parse(lot('LOT-2025-0910').startAt) - Date.parse(NOW)).toBe(24 * 3_600_000);
    expect(status('LOT-2025-0905')).toBe('scheduled');
    expect(status('LOT-2025-0920')).toBe('draft');
    expect(status('LOT-2025-0866')).toBe('closed_unsold');
  });
});

describe('bids, EMDs and results obey the domain rules', () => {
  it('every bid was placed while its auction was open, with EMD, by a buyer who is not the seller', () => {
    for (const b of s.bids) {
      const l = lot(b.lotId);
      expect(Date.parse(b.placedAt)).toBeGreaterThanOrEqual(Date.parse(l.startAt));
      expect(Date.parse(b.placedAt)).toBeLessThan(Date.parse(l.endAt));
      expect(hasEmd(s.emds, l.id, b.bidderId)).toBe(true);
      expect(s.users.find((u) => u.id === b.bidderId)?.role).toBe('buyer');
      expect(b.bidderId).not.toBe(l.sellerId);
    }
  });

  it('each bid met the minimum at the time it was placed', () => {
    for (const l of s.lots) {
      const ordered = bidsOf(l.id).sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
      ordered.forEach((b, i) => expect(b.amountPerMt).toBeGreaterThanOrEqual(minNextBid(l, ordered.slice(0, i))));
    }
  });

  it('every awarded lot’s winner is what closeAuction picks from stored bids', () => {
    for (const l of s.lots.filter((x) => x.status === 'awarded')) {
      const r = closeAuction(l, bidsOf(l.id));
      expect(r.status).toBe('closed_reserve_met');
      expect(l.winningBidId).toBe(r.winningBid?.id);
      const t = s.transactions.find((x) => x.lotId === l.id)!;
      expect(t.winningBidId).toBe(l.winningBidId);
      expect(t.pricePerMt).toBe(r.winningBid?.amountPerMt);
      expect(t.buyerId).toBe(r.winningBid?.bidderId);
      expect(t.sellerId).toBe(l.sellerId);
      expect(t.emdAmount).toBe(l.emdAmount);
    }
  });

  it('unsold lot has no bid meeting reserve', () => {
    expect(closeAuction(lot('LOT-2025-0866'), bidsOf('LOT-2025-0866')).status).toBe('closed_unsold');
  });

  it('published lots pass listing validation at their start time', () => {
    for (const l of s.lots.filter((x) => x.status !== 'draft')) {
      for (const step of [1, 2, 3, 4] as const) {
        expect(validateListingStep(step, draftFromLot(l), l.startAt), `${l.id} step ${step}`).toEqual({});
      }
    }
  });

  it('the draft is incomplete on purpose', () => {
    expect(validateListingStep(4, draftFromLot(lot('LOT-2025-0920')), NOW)).toHaveProperty('reservePerMt');
  });
});

describe('journey A setup — LOT-2025-0891', () => {
  const l = lot('LOT-2025-0891');
  it('matches PLAN §4: assured, reserve ₹32,000, high ₹34,500, min next ₹35,000, EMD ₹1,00,000', () => {
    expect(l.assurance.enabled).toBe(true);
    expect(l.reservePerMt).toBe(32_000);
    expect(highestBid(bidsOf(l.id))?.amountPerMt).toBe(34_500);
    expect(minNextBid(l, bidsOf(l.id))).toBe(35_000);
    expect(l.emdAmount).toBe(100_000);
    expect(l.media.filter((m) => m.kind === 'photo')).toHaveLength(6);
    expect(l.media.filter((m) => m.kind === 'video')).toHaveLength(1);
  });
  it('the demo buyer has no EMD yet, so the EMD step runs live', () => {
    expect(hasEmd(s.emds, l.id, DEMO_ACCOUNTS.buyer)).toBe(false);
  });
});

describe('journey C setup — TX-1042 / CLM-1042-01', () => {
  const t = tx('TX-1042');
  const c = s.claims.find((x) => x.id === 'CLM-1042-01')!;
  const l = lot(t.lotId);

  it('has the PLAN §4 numbers', () => {
    expect(l.id).toBe('LOT-2025-0873');
    expect(t).toMatchObject({ pricePerMt: 36_000, emdAmount: 100_000, balancePaid: 13_40_000, status: 'under_review' });
    expect(reconcile(t)).toMatchObject({ payable: 13_89_600, difference: -50_400 });
    expect(c).toMatchObject({ status: 'under_review', observedValue: 14, requestedRemedy: 'price_adjustment' });
    expect(c.sellerResponse?.decision).toBe('dispute');
    expect(priceAdjustment(l, t, 'contamination', 14)).toBe(83_376);
  });

  it('the claim was eligible when it was opened', () => {
    const atOpen = { ...t, status: 'material_checked' as const };
    expect(claimEligibility(l, atOpen, c).eligible).toBe(true);
  });

  it('the claim has been open for about 2 days', () => {
    expect((Date.parse(NOW) - Date.parse(c.openedAt)) / 3_600_000).toBe(52);
  });

  it('has an audit history and an Ops notification', () => {
    expect(s.audit.filter((a) => a.entityId === 'TX-1042').length).toBeGreaterThanOrEqual(5);
    expect(s.notifications.some((n) => n.userId === DEMO_ACCOUNTS.ops && n.href === '/ops/claims/CLM-1042-01')).toBe(true);
  });
});

describe('other journeys and states', () => {
  it('TX-1038: demo buyer won, awaiting balance, deadline in the future', () => {
    const t = tx('TX-1038');
    expect(t).toMatchObject({ status: 'won_awaiting_balance', buyerId: DEMO_ACCOUNTS.buyer });
    expect(Date.parse(t.paymentDeadline)).toBeGreaterThan(Date.parse(NOW));
  });
  it('TX-1035: deadline passed, so Ops can mark it defaulted', () => {
    const t = tx('TX-1035');
    expect(t.status).toBe('won_awaiting_balance');
    expect(Date.parse(t.paymentDeadline)).toBeLessThan(Date.parse(NOW));
  });
  it('TX-1045: lifting proposed, waiting for the demo seller', () => {
    expect(tx('TX-1045')).toMatchObject({ status: 'lifting_proposed', sellerId: DEMO_ACCOUNTS.seller });
  });
  it('TX-1031: completed standard sale', () => {
    expect(tx('TX-1031')).toMatchObject({ status: 'completed', finalQtyMt: 9.8 });
  });
  it('demo buyer has a leading bid and an outbid one', () => {
    const top = (id: string) => highestBid(bidsOf(id))?.bidderId;
    expect(top('LOT-2025-0899')).toBe(DEMO_ACCOUNTS.buyer);
    expect(top('LOT-2025-0894')).not.toBe(DEMO_ACCOUNTS.buyer);
    expect(bidsOf('LOT-2025-0894').some((b) => b.bidderId === DEMO_ACCOUNTS.buyer)).toBe(true);
  });
});

describe('track records', () => {
  it('Shree Balaji: 6 completed sales and 1 resolved claim (CLM-1042-01 still open)', () => {
    expect(sellerTrackRecord('U-SURESH', s.transactions, s.claims)).toMatchObject({
      completedSales: 6,
      claimsResolved: 1,
      hasHistory: true,
    });
  });
  it('National Smelters: 3 completed', () => {
    expect(sellerTrackRecord('U-IMRAN', s.transactions, s.claims).completedSales).toBe(3);
  });
  it('Mahalaxmi Metals: new seller, no history', () => {
    expect(sellerTrackRecord('U-PRIYA', s.transactions, s.claims)).toMatchObject({ completedSales: 0, hasHistory: false });
  });
});
