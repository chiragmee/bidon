/**
 * Read models built from a state snapshot. Both data sources return exactly these shapes, so
 * pages never depend on whether data came from the browser demo store or the API.
 */
import type { BuyerBidStatus, DerivedStatus } from './auction';
import { buyerBidStatus, deriveAuctionStatus, hasEmd, highestBid, minNextBid } from './auction';
import { ms } from './context';
import { isEligible } from './eligibilityPolicy';
import type { EmdView } from './payments';
import { emdView, paymentInstructions } from './payments';
import type { CategoryPolicy } from './policy';
import { policyFor } from './policy';
import type { DemoState } from './seed';
import type { TrackRecord } from './trackRecord';
import { describeTrackRecord, sellerTrackRecord } from './trackRecord';
import type { NextStep } from './transaction';
import { balanceDue, nextStep, STATUS_LABEL, stepperState } from './transaction';
import type { CategoryId, Company, Iso, Lot, LotMedia, Role, Transaction } from './types';

export interface Viewer {
  id: string | null;
  role: Role;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export type StatusFilter = 'live' | 'upcoming' | 'closed';
export type LotSort = 'closing' | 'newest' | 'bid';

export interface LotFilters {
  q?: string;
  categories?: CategoryId[];
  city?: string;
  assured?: boolean;
  /** Default (none given): live and upcoming. */
  statuses?: StatusFilter[];
  /** Live lots closing within 24 hours. */
  endingSoon?: boolean;
  sort?: LotSort;
}

export const DEFAULT_STATUSES: StatusFilter[] = ['live', 'upcoming'];

export interface LotCardData {
  id: string;
  href: string;
  title: string;
  category: CategoryId;
  grade: string;
  city: string;
  state: string;
  estimatedQtyMt: number;
  status: DerivedStatus;
  startAt: string;
  endAt: string;
  highestBidPerMt: number | null;
  /** null when the seller keeps the reserve hidden. */
  reservePerMt: number | null;
  bidCount: number;
  assured: boolean;
  sellerName: string;
  /** e.g. "6 completed sales · 1 resolved claim"; null when there is not enough history. */
  trackRecord: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  closedAt: string | null;
}

export interface LotListResult {
  items: LotCardData[];
  /** Public lots before filters (drafts excluded). */
  total: number;
  facets: {
    categories: { id: CategoryId; label: string; count: number }[];
    cities: { city: string; count: number }[];
    statuses: Record<StatusFilter, number>;
  };
}

function statusGroup(s: DerivedStatus): StatusFilter | null {
  if (s === 'live') return 'live';
  if (s === 'scheduled') return 'upcoming';
  if (s === 'draft') return null;
  return 'closed';
}

function companyOf(state: DemoState, id: string): Company | undefined {
  return state.companies.find((c) => c.id === id);
}

export function toLotCard(state: DemoState, lot: Lot, now: Iso): LotCardData {
  const bids = state.bids.filter((b) => b.lotId === lot.id);
  const record = sellerTrackRecord(lot.sellerId, state.transactions, state.claims);
  return {
    id: lot.id,
    href: `/auctions/${lot.id}`,
    title: lot.title,
    category: lot.category,
    grade: lot.grade,
    city: lot.location.city,
    state: lot.location.state,
    estimatedQtyMt: lot.estimatedQtyMt,
    status: deriveAuctionStatus(lot, now),
    startAt: lot.startAt,
    endAt: lot.endAt,
    highestBidPerMt: highestBid(bids)?.amountPerMt ?? null,
    reservePerMt: lot.reserveVisible ? lot.reservePerMt : null,
    bidCount: bids.length,
    assured: lot.assurance.enabled,
    sellerName: companyOf(state, lot.sellerCompanyId)?.name ?? 'Seller',
    trackRecord: record.hasHistory ? describeTrackRecord(record) : null,
    imageUrl: lot.media.find((m) => m.kind === 'photo')?.url ?? null,
    publishedAt: lot.publishedAt,
    closedAt: lot.closedAt,
  };
}

export function listLots(state: DemoState, filters: LotFilters, now: Iso): LotListResult {
  const cards = state.lots.filter((l) => l.status !== 'draft').map((l) => toLotCard(state, l, now));
  const statuses = filters.statuses?.length ? filters.statuses : DEFAULT_STATUSES;
  const q = filters.q?.trim().toLowerCase();

  const matchesExceptStatus = (c: LotCardData) =>
    (!q || [c.title, c.grade, c.id, c.city, c.state, c.sellerName, policyFor(c.category).label].some((s) => s.toLowerCase().includes(q))) &&
    (!filters.categories?.length || filters.categories.includes(c.category)) &&
    (!filters.city || c.city === filters.city) &&
    (!filters.assured || c.assured) &&
    (!filters.endingSoon || (c.status === 'live' && ms(c.endAt) - ms(now) <= 24 * 3_600_000));

  const items = cards.filter((c) => {
    const g = statusGroup(c.status);
    return g !== null && statuses.includes(g) && matchesExceptStatus(c);
  });

  const order: Record<StatusFilter, number> = { live: 0, upcoming: 1, closed: 2 };
  const sort = filters.sort ?? 'closing';
  items.sort((a, b) => {
    if (sort === 'newest') return ms(b.publishedAt ?? b.startAt) - ms(a.publishedAt ?? a.startAt);
    if (sort === 'bid') return (b.highestBidPerMt ?? -1) - (a.highestBidPerMt ?? -1);
    const ga = order[statusGroup(a.status) ?? 'closed'];
    const gb = order[statusGroup(b.status) ?? 'closed'];
    if (ga !== gb) return ga - gb;
    if (ga === 0) return ms(a.endAt) - ms(b.endAt);
    if (ga === 1) return ms(a.startAt) - ms(b.startAt);
    return ms(b.closedAt ?? b.endAt) - ms(a.closedAt ?? a.endAt);
  });

  // Facets count lots in the selected statuses so the numbers match what a click would show.
  const inStatus = cards.filter((c) => {
    const g = statusGroup(c.status);
    return g !== null && statuses.includes(g);
  });
  const catCounts = new Map<CategoryId, number>();
  const cityCounts = new Map<string, number>();
  for (const c of inStatus) {
    catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
    cityCounts.set(c.city, (cityCounts.get(c.city) ?? 0) + 1);
  }
  const statusCounts: Record<StatusFilter, number> = { live: 0, upcoming: 0, closed: 0 };
  for (const c of cards) {
    const g = statusGroup(c.status);
    if (g) statusCounts[g] += 1;
  }

  return {
    items,
    total: cards.length,
    facets: {
      categories: (['ferrous_hms', 'mixed_steel', 'non_ferrous', 'e_waste', 'machinery'] as const).map((id) => ({
        id,
        label: policyFor(id).label,
        count: catCounts.get(id) ?? 0,
      })),
      cities: [...cityCounts.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => a.city.localeCompare(b.city)),
      statuses: statusCounts,
    },
  };
}

// ── Lot detail ───────────────────────────────────────────────────────────────

export interface BidRow {
  id: string;
  /** "You" for the viewer; other bidders are anonymised as "Bidder 1", "Bidder 2"… */
  label: string;
  mine: boolean;
  amountPerMt: number;
  placedAt: string;
}

export interface LotDetailView {
  lot: Lot;
  status: DerivedStatus;
  policy: CategoryPolicy;
  seller: { name: string; city: string; state: string; verification: Company['verification']; sample: boolean };
  trackRecord: TrackRecord;
  trackRecordText: string;
  highestBidPerMt: number | null;
  minNextBidPerMt: number;
  /** Whether the highest bid meets the reserve (shown even when the reserve figure is hidden). */
  reserveMet: boolean;
  bidCount: number;
  bidderCount: number;
  bids: BidRow[];
  photos: LotMedia[];
  videos: LotMedia[];
  documents: LotMedia[];
  viewer: {
    role: Role;
    isOwnLot: boolean;
    /** The seller has confirmed receiving this buyer's EMD (bidding allowed). */
    emdPaid: boolean;
    /** This buyer's EMD record for the lot, if any — the same record the seller sees. */
    emd: EmdView | null;
    /** Buyer accounts: eligibility status (only approved buyers report an EMD or bid). */
    verification: Company['verification'] | null;
    eligible: boolean;
    /** Where to pay the EMD — shown only to approved buyers. */
    paymentInstructions: ReturnType<typeof paymentInstructions>;
    bidStatus: BuyerBidStatus;
    myHighestPerMt: number | null;
    /** Set when the viewer is a party to this lot's transaction. */
    transactionId: string | null;
  };
  result: { outcome: 'sold' | 'unsold' | 'withdrawn'; winningBidPerMt: number | null; wonByViewer: boolean; withdrawalReason?: string } | null;
}

export function lotDetail(state: DemoState, lotId: string, viewer: Viewer, now: Iso): LotDetailView | null {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) return null;
  // Drafts are visible only to their seller.
  if (lot.status === 'draft' && viewer.id !== lot.sellerId) return null;

  const status = deriveAuctionStatus(lot, now);
  const bids = state.bids.filter((b) => b.lotId === lot.id);
  const top = highestBid(bids);
  const company = companyOf(state, lot.sellerCompanyId);
  const record = sellerTrackRecord(lot.sellerId, state.transactions, state.claims);

  const firstSeen = new Map<string, number>();
  // Same-millisecond bids fall back to id order (ids are issued in placement order).
  const chrono = (a: { placedAt: string; id: string }, c: { placedAt: string; id: string }) => ms(a.placedAt) - ms(c.placedAt) || a.id.localeCompare(c.id, 'en', { numeric: true });
  for (const b of [...bids].sort(chrono)) {
    if (!firstSeen.has(b.bidderId)) firstSeen.set(b.bidderId, firstSeen.size + 1);
  }
  const rows: BidRow[] = [...bids]
    .sort((a, b) => chrono(b, a))
    .map((b) => {
      const mine = b.bidderId === viewer.id;
      return { id: b.id, label: mine ? 'You' : `Bidder ${firstSeen.get(b.bidderId)}`, mine, amountPerMt: b.amountPerMt, placedAt: b.placedAt };
    });

  const mine = viewer.id ? bids.filter((b) => b.bidderId === viewer.id) : [];
  const tx = state.transactions.find((t) => t.lotId === lot.id);
  const isParty = !!tx && !!viewer.id && (tx.buyerId === viewer.id || tx.sellerId === viewer.id || viewer.role === 'ops');
  const closed = status === 'closed_reserve_met' || status === 'closed_unsold' || status === 'awarded' || status === 'withdrawn';
  const winning = lot.winningBidId ? bids.find((b) => b.id === lot.winningBidId) : undefined;
  const emds = viewer.id ? state.emds.filter((e) => e.lotId === lot.id && e.buyerId === viewer.id) : [];
  const viewerCompany = viewer.id ? companyOf(state, state.users.find((u) => u.id === viewer.id)?.companyId ?? '') : undefined;

  return {
    lot,
    status,
    policy: policyFor(lot.category),
    seller: {
      name: company?.name ?? 'Seller',
      city: company?.city ?? '',
      state: company?.state ?? '',
      verification: company?.verification ?? 'pending',
      sample: company?.sample ?? false,
    },
    trackRecord: record,
    trackRecordText: describeTrackRecord(record),
    highestBidPerMt: top?.amountPerMt ?? null,
    minNextBidPerMt: minNextBid(lot, bids),
    reserveMet: !!top && top.amountPerMt >= lot.reservePerMt,
    bidCount: bids.length,
    bidderCount: firstSeen.size,
    bids: rows,
    photos: lot.media.filter((m) => m.kind === 'photo' && m.stage === 'listing'),
    videos: lot.media.filter((m) => m.kind === 'video' && m.stage === 'listing'),
    documents: lot.media.filter((m) => m.kind === 'document' && m.stage === 'listing'),
    viewer: {
      role: viewer.role,
      isOwnLot: viewer.id === lot.sellerId,
      emdPaid: !!viewer.id && hasEmd(state.emds, lot.id, viewer.id),
      emd: emds[0] ? emdView(state, emds[0]) : null,
      verification: viewerCompany?.verification ?? null,
      eligible: viewer.role === 'buyer' && isEligible(viewerCompany),
      paymentInstructions: viewer.role === 'buyer' && isEligible(viewerCompany) && viewer.id !== lot.sellerId ? paymentInstructions(state, lot.sellerId) : null,
      bidStatus: viewer.id ? buyerBidStatus(lot, bids, viewer.id, now) : 'none',
      myHighestPerMt: mine.length ? Math.max(...mine.map((b) => b.amountPerMt)) : null,
      transactionId: isParty && tx ? tx.id : null,
    },
    result: closed
      ? {
          outcome: status === 'withdrawn' ? 'withdrawn' : status === 'closed_unsold' ? 'unsold' : 'sold',
          ...(lot.withdrawal ? { withdrawalReason: lot.withdrawal.reason } : {}),
          winningBidPerMt: winning?.amountPerMt ?? null,
          wonByViewer: !!winning && winning.bidderId === viewer.id,
        }
      : null,
  };
}

// ── Buyer dashboard ──────────────────────────────────────────────────────────

export interface BuyerBidRow {
  lotId: string;
  title: string;
  status: DerivedStatus;
  bidStatus: BuyerBidStatus;
  highestBidPerMt: number;
  myBidPerMt: number;
  endAt: string;
}

export interface TransactionCardView {
  id: string;
  lotId: string;
  lotTitle: string;
  status: Transaction['status'];
  statusLabel: string;
  counterparty: string;
  pricePerMt: number;
  estimatedQtyMt: number;
  stepper: ReturnType<typeof stepperState>;
  next: NextStep | null;
  /** True when the next step belongs to this viewer. */
  yourTurn: boolean;
  balanceDue: number;
  paymentDeadline: string;
  updatedAt: string;
}

export interface BuyerDashboardView {
  buyer: { name: string; company: string; sample: boolean; verification: Company['verification'] };
  stats: { activeBids: number; leading: number; outbid: number; closingSoon: number; wonNextStep: number; inProgress: number; completed: number };
  activeBids: BuyerBidRow[];
  closedBids: BuyerBidRow[];
  /** EMDs reported, waiting, rejected or owed back — newest first. */
  emds: EmdView[];
  eligible: boolean;
  transactions: TransactionCardView[];
  completed: TransactionCardView[];
}

export function transactionCard(state: DemoState, tx: Transaction, viewer: Viewer): TransactionCardView {
  const lot = state.lots.find((l) => l.id === tx.lotId);
  const otherId = viewer.id === tx.buyerId ? lot?.sellerCompanyId : state.users.find((u) => u.id === tx.buyerId)?.companyId;
  const next = nextStep(tx, lot?.assurance.enabled ?? false);
  const lastAudit = state.audit.filter((a) => a.entityId === tx.id).sort((a, b) => ms(b.at) - ms(a.at))[0];
  return {
    id: tx.id,
    lotId: tx.lotId,
    lotTitle: lot?.title ?? tx.lotId,
    status: tx.status,
    statusLabel: STATUS_LABEL[tx.status],
    counterparty: (otherId && companyOf(state, otherId)?.name) || '—',
    pricePerMt: tx.pricePerMt,
    estimatedQtyMt: tx.estimatedQtyMt,
    stepper: stepperState(tx),
    next,
    yourTurn: !!next && next.role === viewer.role,
    balanceDue: balanceDue(tx),
    paymentDeadline: tx.paymentDeadline,
    updatedAt: lastAudit?.at ?? tx.createdAt,
  };
}

export function buyerDashboard(state: DemoState, buyerId: string, now: Iso): BuyerDashboardView | null {
  const user = state.users.find((u) => u.id === buyerId && u.role === 'buyer');
  if (!user) return null;
  const company = user.companyId ? companyOf(state, user.companyId) : undefined;
  const viewer: Viewer = { id: buyerId, role: 'buyer' };

  const myLotIds = [...new Set(state.bids.filter((b) => b.bidderId === buyerId).map((b) => b.lotId))];
  const rows: BuyerBidRow[] = myLotIds.flatMap((lotId) => {
    const lot = state.lots.find((l) => l.id === lotId);
    if (!lot) return [];
    const bids = state.bids.filter((b) => b.lotId === lotId);
    return [
      {
        lotId,
        title: lot.title,
        status: deriveAuctionStatus(lot, now),
        bidStatus: buyerBidStatus(lot, bids, buyerId, now),
        highestBidPerMt: highestBid(bids)?.amountPerMt ?? 0,
        myBidPerMt: Math.max(...bids.filter((b) => b.bidderId === buyerId).map((b) => b.amountPerMt)),
        endAt: lot.endAt,
      },
    ];
  });
  const activeBids = rows.filter((r) => r.status === 'live').sort((a, b) => ms(a.endAt) - ms(b.endAt));
  const closedBids = rows.filter((r) => r.bidStatus === 'closed_not_won').sort((a, b) => ms(b.endAt) - ms(a.endAt));

  const txs = state.transactions.filter((t) => t.buyerId === buyerId).map((t) => transactionCard(state, t, viewer));
  const done = (t: TransactionCardView) => t.status === 'completed' || t.status === 'resolved' || t.status === 'defaulted';
  const open = txs.filter((t) => !done(t)).sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn) || ms(b.updatedAt) - ms(a.updatedAt));
  const completed = txs.filter(done).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));

  return {
    buyer: { name: user.name, company: company?.name ?? '', sample: company?.sample ?? false, verification: company?.verification ?? 'pending' },
    stats: {
      activeBids: activeBids.length,
      leading: activeBids.filter((r) => r.bidStatus === 'leading').length,
      outbid: activeBids.filter((r) => r.bidStatus === 'outbid').length,
      closingSoon: activeBids.filter((r) => ms(r.endAt) - ms(now) <= 3 * 3_600_000).length,
      wonNextStep: open.filter((t) => t.status === 'won_awaiting_balance').length,
      inProgress: open.filter((t) => t.status !== 'won_awaiting_balance').length,
      completed: completed.filter((t) => t.status !== 'defaulted').length,
    },
    activeBids,
    closedBids,
    emds: state.emds
      .filter((e) => e.buyerId === buyerId && e.status !== 'confirmed' && e.status !== 'forfeited')
      .sort((a, b) => ms(b.payment?.submittedAt ?? b.createdAt) - ms(a.payment?.submittedAt ?? a.createdAt))
      .map((e) => emdView(state, e)),
    eligible: isEligible(company),
    transactions: open,
    completed,
  };
}

/** Lightweight transaction summary for pages that only need the card (Phase 3 placeholder). */
export function transactionSummary(state: DemoState, txId: string, viewer: Viewer): TransactionCardView | null {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return null;
  const party = viewer.role === 'ops' || viewer.id === tx.buyerId || viewer.id === tx.sellerId;
  return party ? transactionCard(state, tx, viewer) : null;
}
