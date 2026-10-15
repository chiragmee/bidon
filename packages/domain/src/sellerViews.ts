/** Seller dashboard and lot management read models (SPEC §12.2, §14). */
import type { DerivedStatus } from './auction';
import { deriveAuctionStatus, highestBid } from './auction';
import { ms } from './context';
import { draftFromLot, publishBlockers, canSellerEdit, type WizardStep } from './listing';
import type { DemoState } from './seed';
import type { TrackRecord } from './trackRecord';
import { describeTrackRecord, sellerTrackRecord } from './trackRecord';
import type { CategoryId, Company, Iso, Rejection } from './types';
import type { TransactionCardView } from './views';
import { transactionCard } from './views';
import { isEligible } from './eligibilityPolicy';
import type { EmdView } from './payments';
import { emdView } from './payments';

export type SellerTab = 'drafts' | 'scheduled' | 'live' | 'closed';

export interface SellerLotRow {
  id: string;
  title: string;
  yard: string;
  status: DerivedStatus;
  tab: SellerTab;
  assured: boolean;
  highestBidPerMt: number | null;
  reservePerMt: number;
  bidCount: number;
  bidderCount: number;
  startAt: Iso;
  endAt: Iso;
  transactionId: string | null;
  /** Drafts: how many publish blockers remain. */
  blockers: number;
  imageUrl: string | null;
  category: CategoryId;
}

export interface SellerDashboardView {
  company: Company;
  sellerName: string;
  trackRecord: TrackRecord;
  trackRecordText: string;
  stats: { live: number; upcoming: number; drafts: number; closed: number; awaitingBuyer: number; completed: number; claimsToAnswer: number };
  lots: SellerLotRow[];
  tabs: Record<SellerTab, number>;
  /** Transactions where the seller has a step to take, then the rest still open. */
  transactions: TransactionCardView[];
  claimsToAnswer: { claimId: string; txId: string; lotTitle: string; observed: string; buyer: string }[];
  /** Approved to publish (eligibility review). */
  eligible: boolean;
  /** Buyers' reported EMD payments waiting for this seller to check and confirm. */
  emdsToConfirm: EmdView[];
  /** EMDs this seller owes back (losing bidders, unsold lots, exits) — record each refund once made. */
  emdRefundsDue: EmdView[];
}

function tabOf(s: DerivedStatus): SellerTab {
  if (s === 'draft') return 'drafts';
  if (s === 'scheduled') return 'scheduled';
  if (s === 'live') return 'live';
  return 'closed';
}

export function sellerDashboard(state: DemoState, sellerId: string, now: Iso): SellerDashboardView | null {
  const user = state.users.find((u) => u.id === sellerId && u.role === 'seller');
  const company = state.companies.find((c) => c.id === user?.companyId);
  if (!user || !company) return null;
  const viewer = { id: sellerId, role: 'seller' as const };

  const lots: SellerLotRow[] = state.lots
    .filter((l) => l.sellerId === sellerId)
    .map((l) => {
      const bids = state.bids.filter((b) => b.lotId === l.id);
      const status = deriveAuctionStatus(l, now);
      return {
        id: l.id,
        title: l.title || 'Untitled draft',
        yard: [l.location.yard, l.location.city].filter(Boolean).join(', '),
        status,
        tab: tabOf(status),
        assured: l.assurance.enabled,
        highestBidPerMt: highestBid(bids)?.amountPerMt ?? null,
        reservePerMt: l.reservePerMt,
        bidCount: bids.length,
        bidderCount: new Set(bids.map((b) => b.bidderId)).size,
        startAt: l.startAt,
        endAt: l.endAt,
        transactionId: state.transactions.find((t) => t.lotId === l.id)?.id ?? null,
        blockers: status === 'draft' ? publishBlockers(draftFromLot(l), now).length : 0,
        imageUrl: l.media.find((m) => m.kind === 'photo')?.url ?? null,
        category: l.category,
      };
    })
    .sort((a, b) => {
      const order: Record<SellerTab, number> = { live: 0, drafts: 1, scheduled: 2, closed: 3 };
      return order[a.tab] - order[b.tab] || (a.tab === 'closed' ? ms(b.endAt) - ms(a.endAt) : ms(a.endAt || a.startAt || now) - ms(b.endAt || b.startAt || now));
    });

  const txs = state.transactions.filter((t) => t.sellerId === sellerId);
  const open = txs.filter((t) => !['completed', 'resolved', 'defaulted'].includes(t.status)).map((t) => transactionCard(state, t, viewer));
  open.sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn) || ms(b.updatedAt) - ms(a.updatedAt));
  const claimsToAnswer = state.claims
    .filter((c) => c.sellerId === sellerId && c.status === 'open')
    .map((c) => ({
      claimId: c.id,
      txId: c.transactionId,
      lotTitle: state.lots.find((l) => l.id === c.lotId)?.title ?? c.lotId,
      observed: c.observed,
      buyer: state.companies.find((co) => co.id === state.users.find((u) => u.id === c.buyerId)?.companyId)?.name ?? '',
    }));
  const myLots = new Set(state.lots.filter((l) => l.sellerId === sellerId).map((l) => l.id));
  const sellerEmds = (status: EmdView['status']) =>
    state.emds
      .filter((e) => myLots.has(e.lotId) && e.status === status)
      .sort((a, b) => ms(a.payment?.submittedAt ?? a.createdAt) - ms(b.payment?.submittedAt ?? b.createdAt))
      .map((e) => emdView(state, e));
  const record = sellerTrackRecord(sellerId, state.transactions, state.claims);
  const tabs: Record<SellerTab, number> = { drafts: 0, scheduled: 0, live: 0, closed: 0 };
  for (const l of lots) tabs[l.tab] += 1;

  return {
    company,
    sellerName: user.name,
    trackRecord: record,
    trackRecordText: describeTrackRecord(record),
    stats: {
      live: tabs.live,
      upcoming: tabs.scheduled,
      drafts: tabs.drafts,
      closed: tabs.closed,
      awaitingBuyer: open.filter((t) => ['won_awaiting_balance', 'balance_paid', 'lifting_proposed', 'lifting_scheduled', 'material_checked'].includes(t.status)).length,
      completed: record.completedSales,
      claimsToAnswer: claimsToAnswer.length,
    },
    lots,
    tabs,
    transactions: open,
    claimsToAnswer,
    eligible: isEligible(company),
    emdsToConfirm: sellerEmds('submitted'),
    emdRefundsDue: sellerEmds('refund_due'),
  };
}

export interface SellerLotView {
  /** Why each kind of change is or isn't allowed right now (null = allowed). */
  edit: { details: Rejection | null; reserve: Rejection | null; bids: Rejection | null };
  blockers: { step: WizardStep; field: string; message: string }[];
  transactionId: string | null;
  /** Every buyer's EMD on this lot — reported, confirmed, rejected or refunded. */
  emds: EmdView[];
  /** Approved to publish (eligibility review). */
  eligible: boolean;
}

/** Extras for the seller's own lot page; the shared lotDetail supplies the rest. */
export function sellerLot(state: DemoState, lotId: string, sellerId: string, now: Iso): SellerLotView | null {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot || lot.sellerId !== sellerId) return null;
  const bids = state.bids.filter((b) => b.lotId === lotId);
  return {
    edit: {
      details: canSellerEdit(lot, bids, sellerId, 'details', now),
      reserve: canSellerEdit(lot, bids, sellerId, 'reserve', now),
      bids: canSellerEdit(lot, bids, sellerId, 'bids', now),
    },
    blockers: lot.status === 'draft' ? publishBlockers(draftFromLot(lot), now) : [],
    transactionId: state.transactions.find((t) => t.lotId === lotId)?.id ?? null,
    emds: state.emds.filter((e) => e.lotId === lotId).map((e) => emdView(state, e)),
    eligible: isEligible(state.companies.find((c) => c.id === lot.sellerCompanyId)),
  };
}
