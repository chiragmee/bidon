import type { Claim, Transaction } from './types';

export interface TrackRecord {
  completedSales: number;
  claimsRaised: number;
  claimsResolved: number;
  /** Claims decided in the buyer's favour (adjustment or exit), by acceptance or Ops. */
  claimsUpheld: number;
  /** Fewer than 3 completed sales: show "New seller" rather than a thin record. */
  hasHistory: boolean;
}

/** Recomputed from records after every completion and claim resolution — never stored by hand. */
export function sellerTrackRecord(
  sellerId: string,
  transactions: readonly Transaction[],
  claims: readonly Claim[],
): TrackRecord {
  const mine = transactions.filter((t) => t.sellerId === sellerId);
  const completedSales = mine.filter(
    (t) => t.status === 'completed' || (t.status === 'resolved' && t.resolution !== 'exit_refund'),
  ).length;
  const myClaims = claims.filter((c) => c.sellerId === sellerId);
  const closed = myClaims.filter((c) => c.status === 'resolved' || c.status === 'rejected');
  return {
    completedSales,
    claimsRaised: myClaims.length,
    claimsResolved: closed.length,
    claimsUpheld: closed.filter((c) => c.status === 'resolved').length,
    hasHistory: completedSales >= 3,
  };
}

export function describeTrackRecord(r: TrackRecord): string {
  if (!r.hasHistory) return 'New seller — not enough completed sales for a track record yet';
  const claims = r.claimsResolved === 0 ? 'no claims' : `${r.claimsResolved} resolved claim${r.claimsResolved === 1 ? '' : 's'}`;
  return `${r.completedSales} completed sales · ${claims}`;
}
