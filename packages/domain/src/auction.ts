import type { Actor } from './context';
import { ms } from './context';
import { formatINR } from './format';
import type { AuctionStatus, Bid, EmdRecord, Iso, Lot, Rejection, Result, Rupees } from './types';
import { fail, ok } from './types';

/**
 * Derived status, or `ended`: the end time has passed but the close has not been processed yet.
 * Data sources must run `closeAuction` when they see `ended` (close on first access, PHASES 2.3).
 */
export type DerivedStatus = AuctionStatus | 'ended';

export function deriveAuctionStatus(lot: Pick<Lot, 'status' | 'startAt' | 'endAt'>, now: Iso): DerivedStatus {
  if (lot.status !== 'scheduled') return lot.status;
  const t = ms(now);
  if (t < ms(lot.startAt)) return 'scheduled';
  if (t < ms(lot.endAt)) return 'live';
  return 'ended';
}

/** Highest bid; on equal amounts the earliest wins. */
export function highestBid(bids: readonly Bid[]): Bid | null {
  let best: Bid | null = null;
  for (const b of bids) {
    if (
      !best ||
      b.amountPerMt > best.amountPerMt ||
      (b.amountPerMt === best.amountPerMt && ms(b.placedAt) < ms(best.placedAt))
    ) {
      best = b;
    }
  }
  return best;
}

/** CLAUDE.md: minimum next bid = current highest (or reserve if none) + configured increment. */
export function minNextBid(lot: Pick<Lot, 'reservePerMt' | 'bidIncrement'>, bids: readonly Bid[]): Rupees {
  const base = highestBid(bids)?.amountPerMt ?? lot.reservePerMt;
  return base + lot.bidIncrement;
}

export function hasEmd(emds: readonly EmdRecord[], lotId: string, buyerId: string): boolean {
  return emds.some((e) => e.lotId === lotId && e.buyerId === buyerId && e.status === 'succeeded');
}

export type BidRejectionCode =
  | 'not_buyer'
  | 'duplicate'
  | 'invalid_amount'
  | 'auction_not_started'
  | 'auction_closed'
  | 'not_published'
  | 'own_lot'
  | 'emd_required'
  | 'outbid'
  | 'below_minimum';

export interface BidAttempt {
  lot: Lot;
  bids: readonly Bid[];
  emds: readonly EmdRecord[];
  actor: Actor;
  amountPerMt: unknown;
  clientRequestId: string;
  /** The highest bid the buyer saw when they opened the dialog — detects stale submissions. */
  seenHighestPerMt: Rupees | null;
  now: Iso;
}

export function validateBid(a: BidAttempt): Result<{ amountPerMt: Rupees; minNext: Rupees }, BidRejectionCode> {
  const { lot, bids, actor, now } = a;

  if (actor.role !== 'buyer') {
    return fail('not_buyer', 'Only buyer accounts can place bids.', 'Switch to a buyer account to bid.');
  }
  if (bids.some((b) => b.clientRequestId === a.clientRequestId)) {
    return fail(
      'duplicate',
      'This bid was already submitted.',
      'Nothing more to do — check the bid history for its status.',
    );
  }
  const amount = a.amountPerMt;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return fail(
      'invalid_amount',
      'The bid amount is missing or not a whole number of rupees.',
      'Enter your bid per MT in rupees, for example 35000.',
    );
  }

  const status = deriveAuctionStatus(lot, now);
  if (status === 'draft') {
    return fail('not_published', 'This lot is not published yet.', 'Browse live auctions instead.');
  }
  if (status === 'scheduled') {
    return fail(
      'auction_not_started',
      'Bidding has not opened for this lot yet.',
      `Come back when the auction opens at ${new Date(lot.startAt).toLocaleString('en-IN')}.`,
    );
  }
  if (status !== 'live') {
    return fail(
      'auction_closed',
      'This auction has closed, so it no longer accepts bids.',
      'See the result on the lot page or browse other live auctions.',
    );
  }
  if (lot.sellerId === actor.id) {
    return fail('own_lot', 'Sellers cannot bid on their own lots.', 'Use a buyer account for other lots.');
  }
  if (!hasEmd(a.emds, lot.id, actor.id)) {
    return fail(
      'emd_required',
      `An EMD of ${formatINR(lot.emdAmount)} is needed before you can bid on this lot.`,
      'Pay the EMD (simulated in this demo), then place your bid.',
    );
  }

  const minNext = minNextBid(lot, bids);
  if (amount < minNext) {
    const current = highestBid(bids)?.amountPerMt ?? null;
    const stale = current !== null && (a.seenHighestPerMt === null || current > a.seenHighestPerMt);
    if (stale) {
      return fail(
        'outbid',
        `Another bidder placed ${formatINR(current, { perMt: true })} while you were bidding.`,
        `Your bid was not placed. The new minimum is ${formatINR(minNext, { perMt: true })}.`,
      );
    }
    return fail(
      'below_minimum',
      `Your bid is below the minimum of ${formatINR(minNext, { perMt: true })}.`,
      `Bid ${formatINR(minNext, { perMt: true })} or more.`,
    );
  }
  return ok({ amountPerMt: amount, minNext });
}

export interface CloseResult {
  status: 'closed_reserve_met' | 'closed_unsold';
  winningBid: Bid | null;
}

/** Winner = highest stored bid that meets the reserve, otherwise Unsold. Never hard-coded. */
export function closeAuction(lot: Pick<Lot, 'reservePerMt'>, bids: readonly Bid[]): CloseResult {
  const top = highestBid(bids);
  if (top && top.amountPerMt >= lot.reservePerMt) return { status: 'closed_reserve_met', winningBid: top };
  return { status: 'closed_unsold', winningBid: null };
}

/** Operations may end a live demo auction early; nobody else can. */
export function canCloseEarly(lot: Lot, actor: Actor, now: Iso): Rejection | null {
  if (actor.role !== 'ops') {
    return {
      code: 'forbidden',
      what: 'Only Operations can close a demo auction early.',
      next: 'Auctions close automatically at their end time.',
    };
  }
  const status = deriveAuctionStatus(lot, now);
  if (status !== 'live' && status !== 'ended') {
    return {
      code: 'not_live',
      what: `This auction is ${status.replace(/_/g, ' ')}, so it cannot be closed.`,
      next: 'Only live auctions can be closed.',
    };
  }
  return null;
}

/** Buyer-facing bid status on a lot (§11). */
export type BuyerBidStatus = 'leading' | 'outbid' | 'won' | 'closed_not_won' | 'none';

export function buyerBidStatus(lot: Lot, bids: readonly Bid[], buyerId: string, now: Iso): BuyerBidStatus {
  const mine = bids.filter((b) => b.bidderId === buyerId);
  if (mine.length === 0) return 'none';
  const status = deriveAuctionStatus(lot, now);
  const top = highestBid(bids);
  const leading = top?.bidderId === buyerId;
  if (status === 'live') return leading ? 'leading' : 'outbid';
  if (status === 'closed_reserve_met' || status === 'awarded') {
    return lot.winningBidId && mine.some((b) => b.id === lot.winningBidId) ? 'won' : 'closed_not_won';
  }
  return 'closed_not_won';
}
