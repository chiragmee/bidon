import { describe, expect, it } from 'vitest';
import { deriveAuctionStatus } from './auction';
import { confirmedEmd, payment } from './fixtures';
import { addLotMedia, withdrawLot } from './listings';
import { placeBid, processDueClosures } from './operations';
import { decideEmd, submitEmd } from './payments';
import { createSeed, type DemoState } from './seed';
import type { LotMedia } from './types';
import { lotDetail } from './views';

const NOW = '2026-10-16T06:30:00.000Z';
const LOT = 'LOT-2025-0891'; // live in the seed, seller Suresh
const SURESH = { id: 'U-SURESH', role: 'seller' as const };
const IMRAN = { id: 'U-IMRAN', role: 'seller' as const };
const RAHUL = { id: 'U-RAHUL', role: 'buyer' as const }; // the one sample buyer without an EMD on this lot
const later = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

function ok<T>(r: { ok: true; state: DemoState; value: T } | { ok: false; error: { code: string; what: string } }) {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.what}`);
  return r;
}
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

describe('seller takes a live auction down (D-104)', () => {
  it('needs a reason, keeps bids on record with no winner, owes back every EMD and tells bidders why', () => {
    let s = createSeed(NOW);
    expect(deriveAuctionStatus(s.lots.find((l) => l.id === LOT)!, NOW)).toBe('live');
    s = confirmedEmd(s, LOT, RAHUL, NOW);
    const min = lotDetail(s, LOT, RAHUL, NOW)!.minNextBidPerMt;
    s = ok(placeBid(s, { lotId: LOT, amountPerMt: min, clientRequestId: 'w1', seenHighestPerMt: lotDetail(s, LOT, RAHUL, NOW)!.highestBidPerMt }, RAHUL, NOW)).state;
    const bidsBefore = s.bids.filter((b) => b.lotId === LOT).length;

    expect(code(withdrawLot(s, LOT, { reason: 'short' }, SURESH, NOW))).toBe('reason_required');
    expect(code(withdrawLot(s, LOT, { reason: 'Material sold privately to a plant' }, IMRAN, NOW))).toBe('not_found');

    const r = ok(withdrawLot(s, LOT, { reason: 'Material is needed back at our own plant.' }, SURESH, NOW));
    const lot = r.state.lots.find((l) => l.id === LOT)!;
    expect(lot).toMatchObject({ status: 'withdrawn', closedAt: NOW, winningBidId: null, withdrawal: { reason: 'Material is needed back at our own plant.', by: 'U-SURESH', bidsAtWithdrawal: bidsBefore } });
    expect(r.state.bids.filter((b) => b.lotId === LOT)).toHaveLength(bidsBefore);
    expect(r.state.emds.filter((e) => e.lotId === LOT && e.status === 'confirmed')).toHaveLength(0);
    expect(r.state.emds.find((e) => e.lotId === LOT && e.buyerId === 'U-RAHUL')?.status).toBe('refund_due');
    const told = r.state.notifications.filter((n) => n.kind === 'lot_withdrawn').map((n) => n.userId);
    expect(told).toContain('U-RAHUL');
    expect(r.state.notifications.find((n) => n.kind === 'lot_withdrawn')?.body).toContain('needed back at our own plant');
    expect(lotDetail(r.state, LOT, RAHUL, NOW)?.result).toMatchObject({ outcome: 'withdrawn', withdrawalReason: 'Material is needed back at our own plant.' });

    // No more bids, no second withdrawal, and the end time doesn't turn it into a sale.
    const bid = placeBid(r.state, { lotId: LOT, amountPerMt: min + 10_000, clientRequestId: 'w2', seenHighestPerMt: null }, RAHUL, NOW);
    expect(code(bid)).toBe('auction_closed');
    expect(code(withdrawLot(r.state, LOT, { reason: 'Trying again for no reason' }, SURESH, NOW))).toBe('already_closed');
    expect(processDueClosures(r.state, later(500)).closed).not.toContain(LOT);
  });

  it('an EMD still awaiting confirmation becomes owed back once the seller confirms it', () => {
    let s = createSeed(NOW);
    const lot = s.lots.find((l) => l.id === LOT)!;
    const sub = ok(submitEmd(s, LOT, payment(lot.emdAmount, NOW), RAHUL, NOW));
    s = ok(withdrawLot(sub.state, LOT, { reason: 'Material is needed back at our own plant.' }, SURESH, NOW)).state;
    const d = ok(decideEmd(s, sub.value.id, { decision: 'confirmed', reason: '' }, SURESH, NOW));
    expect(d.value.status).toBe('refund_due');
  });

  it('an ended auction can’t be taken down', () => {
    const s = createSeed(NOW);
    const closed = processDueClosures(s, later(500)).state;
    expect(code(withdrawLot(closed, LOT, { reason: 'Too late to take it down now' }, SURESH, later(500)))).toBe('already_closed');
  });
});

describe('seller adds photos to a published lot (D-104)', () => {
  const photo = (id: string): LotMedia => ({ id, kind: 'photo', url: `https://example.test/${id}.jpg`, caption: id, stage: 'listing', uploadedAt: NOW });

  it('adds photos while live, without changing anything else, and tells interested buyers', () => {
    let s = createSeed(NOW);
    s = confirmedEmd(s, LOT, RAHUL, NOW);
    const before = s.lots.find((l) => l.id === LOT)!;
    const r = ok(addLotMedia(s, LOT, [photo('new-1'), photo('new-2')], SURESH, NOW));
    const after = r.state.lots.find((l) => l.id === LOT)!;
    expect(after.media).toHaveLength(before.media.length + 2);
    expect({ ...after, media: before.media }).toEqual(before);
    expect(lotDetail(r.state, LOT, RAHUL, NOW)?.photos.map((p) => p.id)).toContain('new-2');
    expect(r.state.notifications.some((n) => n.kind === 'lot_photos_added' && n.userId === 'U-RAHUL')).toBe(true);
  });

  it('only the seller, only photos or videos, and only until the auction ends', () => {
    const s = createSeed(NOW);
    expect(code(addLotMedia(s, LOT, [photo('x')], IMRAN, NOW))).toBe('not_found');
    expect(code(addLotMedia(s, LOT, [{ ...photo('d'), kind: 'document' }], SURESH, NOW))).toBe('invalid_input');
    const ended = processDueClosures(s, later(500)).state;
    expect(code(addLotMedia(ended, LOT, [photo('late')], SURESH, later(500)))).toBe('already_closed');
  });
});
