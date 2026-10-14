/**
 * Read models for the post-win workflow and the Operations workspace. Same shapes from both
 * data sources, so buyer, seller and Ops pages always render the same underlying state.
 */
import type { EligibilityCheck, ToleranceCheck } from './assurance';
import { checkTolerance, claimEligibility, exitRefund, priceAdjustment } from './assurance';
import { deriveAuctionStatus, highestBid } from './auction';
import type { Ctx } from './context';
import { ms } from './context';
import { formatINR } from './format';
import type { CategoryPolicy } from './policy';
import { policyFor } from './policy';
import type { DemoState } from './seed';
import type { NextStep, Reconciliation, TxActionType } from './transaction';
import { balanceDue, canTransition, computePayable, nextStep, reconcile, STATUS_LABEL, stepperState, TX_RULES } from './transaction';
import type { AuditEntry, Claim, Iso, Lot, LotMedia, Rejection, Transaction } from './types';
import type { Viewer } from './views';

export interface TimelineEntry {
  id: string;
  at: Iso;
  label: string;
  actor: string;
  reason: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  close_auction: 'Auction closed',
  close_demo_auction: 'Demo auction closed by Operations',
  create: 'Transaction started',
  pay_balance: 'Balance paid (simulated)',
  propose_lifting: 'Lifting date proposed',
  confirm_lifting: 'Lifting date confirmed',
  record_weighbridge: 'Weighbridge measurement recorded',
  record_condition: 'Condition check recorded',
  complete: 'Transaction completed',
  mark_defaulted: 'Marked defaulted',
  open_claim: 'Assurance claim opened',
  seller_accept: 'Seller accepted the claim',
  seller_dispute: 'Seller disputed the claim',
  escalate_to_ops: 'Sent to Operations for review',
  resolve_by_acceptance: 'Claim resolved by acceptance',
  apply_remedy: 'Remedy applied',
  ops_approve_adjustment: 'Operations approved a price adjustment',
  ops_approve_exit: 'Operations approved exit and refund',
  ops_reject: 'Operations rejected the claim',
  apply_ops_decision: 'Operations decision applied',
};

function actorName(state: DemoState, id: string): string {
  if (id === 'system') return 'AuctionIT (automatic)';
  const u = state.users.find((x) => x.id === id);
  if (!u) return id;
  const c = state.companies.find((x) => x.id === u.companyId);
  return u.role === 'ops' ? `${u.name}, Operations` : `${u.name}${c ? `, ${c.name}` : ''}`;
}

/**
 * One action can audit two entities (the claim and its transaction); show it once. Entries with the
 * same label, actor and time collapse into one.
 */
function dedupe<T extends TimelineEntry>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const k = `${e.label}|${e.actor}|${e.at}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function timeline(state: DemoState, entityIds: string[]): TimelineEntry[] {
  return dedupe(
    state.audit
      .filter((a) => entityIds.includes(a.entityId))
      .sort((a, b) => ms(a.at) - ms(b.at))
      .map((a: AuditEntry) => ({
        id: a.id,
        at: a.at,
        label: ACTION_LABEL[a.action] ?? a.action.replace(/_/g, ' '),
        actor: actorName(state, a.actorId),
        reason: a.reason,
      })),
  );
}

function companyName(state: DemoState, userId: string): string {
  const u = state.users.find((x) => x.id === userId);
  return state.companies.find((c) => c.id === u?.companyId)?.name ?? u?.name ?? userId;
}

// ── Transaction detail ───────────────────────────────────────────────────────

export interface TxDetailView {
  tx: Transaction;
  lot: Lot;
  policy: CategoryPolicy;
  assured: boolean;
  buyer: string;
  seller: string;
  /** How the viewer relates to this transaction. */
  as: 'buyer' | 'seller' | 'ops';
  statusLabel: string;
  stepper: ReturnType<typeof stepperState>;
  captions: (string | undefined)[];
  next: NextStep | null;
  yourTurn: boolean;
  estimatedTotal: number;
  balanceDue: number;
  deadlinePassed: boolean;
  reconciliation: Reconciliation | null;
  contamination: ToleranceCheck | null;
  quantity: ToleranceCheck | null;
  listingPhotos: LotMedia[];
  ticket: LotMedia | null;
  liftingPhotos: LotMedia[];
  claim: Claim | null;
  claimMedia: { buyer: LotMedia[]; seller: LotMedia[] };
  /** Pre-claim eligibility of the current state (draft rules are checked on the claim form). */
  eligibility: { eligible: boolean; checks: EligibilityCheck[] };
  /** What each remedy would amount to now (contamination adjustment needs a condition check). */
  remedies: { priceAdjustment: number; exitRefund: number };
  emdStatus: string | null;
  /** For each action: null when the viewer may take it now, else the reason not. */
  can: Record<TxActionType, Rejection | null>;
  timeline: TimelineEntry[];
}

const day = (iso: Iso | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : undefined);

export function transactionDetail(state: DemoState, txId: string, viewer: Viewer, now: Iso): TxDetailView | null {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx || !viewer.id) return null;
  const as = viewer.role === 'ops' ? 'ops' : viewer.id === tx.buyerId ? 'buyer' : viewer.id === tx.sellerId ? 'seller' : null;
  if (!as) return null;
  const lot = state.lots.find((l) => l.id === tx.lotId);
  /* v8 ignore next */
  if (!lot) return null;

  const claim =
    state.claims
      .filter((c) => c.transactionId === tx.id)
      .sort((a, b) => ms(b.openedAt) - ms(a.openedAt))[0] ?? null;
  const byId = new Map(tx.media.map((m) => [m.id, m]));
  const ctx: Ctx = { now, actor: { id: viewer.id, role: viewer.role }, newId: () => 'preview' };
  const can = Object.fromEntries(
    (Object.keys(TX_RULES) as TxActionType[]).map((a) => [a, canTransition(tx, a, ctx)]),
  ) as Record<TxActionType, Rejection | null>;
  const emd = state.emds.find((e) => e.lotId === lot.id && e.buyerId === tx.buyerId && e.status !== 'failed');
  const next = nextStep(tx, lot.assurance.enabled);

  return {
    tx,
    lot,
    policy: policyFor(lot.category),
    assured: lot.assurance.enabled,
    buyer: companyName(state, tx.buyerId),
    seller: companyName(state, tx.sellerId),
    as,
    statusLabel: STATUS_LABEL[tx.status],
    stepper: stepperState(tx),
    captions: [day(tx.createdAt), day(tx.balancePaidAt), day(tx.liftingConfirmedAt), day(tx.condition?.checkedAt ?? tx.weighbridge?.measuredAt ?? null), day(tx.completedAt)],
    next,
    yourTurn: !!next && next.role === as,
    estimatedTotal: computePayable(tx.estimatedQtyMt, tx.pricePerMt),
    balanceDue: balanceDue(tx),
    deadlinePassed: ms(now) > ms(tx.paymentDeadline),
    reconciliation: reconcile(tx),
    contamination: tx.condition ? checkTolerance(lot, 'contamination', tx.condition.observedContaminationPct) : null,
    quantity: tx.weighbridge ? checkTolerance(lot, 'quantity', tx.weighbridge.measuredMt) : null,
    listingPhotos: lot.media.filter((m) => m.stage === 'listing' && m.kind === 'photo'),
    ticket: tx.weighbridge?.ticketMediaId ? (byId.get(tx.weighbridge.ticketMediaId) ?? null) : null,
    liftingPhotos: (tx.condition?.photoMediaIds ?? []).flatMap((id) => byId.get(id) ?? []),
    claim,
    claimMedia: {
      buyer: (claim?.mediaIds ?? []).flatMap((id) => byId.get(id) ?? []),
      seller: (claim?.sellerResponse?.mediaIds ?? []).flatMap((id) => byId.get(id) ?? []),
    },
    eligibility: claimEligibility(lot, tx, null),
    remedies: {
      priceAdjustment: tx.condition ? priceAdjustment(lot, tx, 'contamination', tx.condition.observedContaminationPct) : 0,
      exitRefund: exitRefund(tx),
    },
    emdStatus: emd ? emd.status : null,
    can,
    timeline: timeline(state, [lot.id, tx.id, ...(claim ? [claim.id] : [])]),
  };
}

// ── Claim review (Operations) ────────────────────────────────────────────────

export interface ClaimReviewView {
  claim: Claim;
  tx: Transaction;
  lot: Lot;
  policy: CategoryPolicy;
  buyer: string;
  seller: string;
  ageMs: number;
  tolerance: ToleranceCheck;
  listingEvidence: LotMedia[];
  buyerEvidence: LotMedia[];
  sellerEvidence: LotMedia[];
  ticket: LotMedia | null;
  outcomes: { approve_adjustment: number; approve_exit: number; reject: number };
  decidedBy: string | null;
  timeline: TimelineEntry[];
}

export function claimReview(state: DemoState, claimId: string, viewer: Viewer, now: Iso): ClaimReviewView | null {
  if (viewer.role !== 'ops') return null;
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return null;
  const tx = state.transactions.find((t) => t.id === claim.transactionId);
  const lot = state.lots.find((l) => l.id === claim.lotId);
  /* v8 ignore next */
  if (!tx || !lot) return null;
  const byId = new Map(tx.media.map((m) => [m.id, m]));
  const measured = tx.weighbridge?.measuredMt ?? tx.estimatedQtyMt;
  return {
    claim,
    tx,
    lot,
    policy: policyFor(lot.category),
    buyer: companyName(state, tx.buyerId),
    seller: companyName(state, tx.sellerId),
    ageMs: ms(now) - ms(claim.openedAt),
    tolerance: checkTolerance(lot, claim.type, claim.observedValue),
    listingEvidence: lot.media.filter((m) => m.stage === 'listing'),
    buyerEvidence: claim.mediaIds.flatMap((id) => byId.get(id) ?? []),
    sellerEvidence: (claim.sellerResponse?.mediaIds ?? []).flatMap((id) => byId.get(id) ?? []),
    ticket: tx.weighbridge?.ticketMediaId ? (byId.get(tx.weighbridge.ticketMediaId) ?? null) : null,
    outcomes: {
      approve_adjustment: priceAdjustment(lot, tx, claim.type, claim.observedValue),
      approve_exit: exitRefund(tx),
      reject: computePayable(measured, tx.pricePerMt),
    },
    decidedBy: claim.opsDecision ? actorName(state, claim.opsDecision.decidedBy) : null,
    timeline: timeline(state, [claim.id, tx.id]),
  };
}

// ── Operations overview ──────────────────────────────────────────────────────

export interface OpsQueueRow {
  claimId: string;
  txId: string;
  lotId: string;
  lotTitle: string;
  buyer: string;
  seller: string;
  discrepancy: string;
  tolerance: string;
  evidenceCount: number;
  requestedRemedy: string;
  sellerResponse: string;
  status: Claim['status'];
  ageMs: number;
}

export interface OpsAuctionRow {
  lotId: string;
  title: string;
  seller: string;
  status: ReturnType<typeof deriveAuctionStatus>;
  endAt: Iso;
  bidCount: number;
  highestBidPerMt: number | null;
  reservePerMt: number;
  reserveMet: boolean;
  transactionId: string | null;
}

export interface OpsTxRow {
  id: string;
  lotTitle: string;
  buyer: string;
  seller: string;
  statusLabel: string;
  waitingOn: string | null;
  overdue: boolean;
}

export interface Metric {
  label: string;
  value: string;
  caption: string;
}

export interface OpsOverviewView {
  stats: { live: number; closed: number; awaitingAction: number; openClaims: number; completed: number };
  metrics: Metric[];
  baseline: Metric;
  queue: OpsQueueRow[];
  decided: OpsQueueRow[];
  auctions: OpsAuctionRow[];
  transactions: OpsTxRow[];
  recent: (TimelineEntry & { entity: string })[];
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function queueRow(state: DemoState, c: Claim, now: Iso): OpsQueueRow {
  const lot = state.lots.find((l) => l.id === c.lotId);
  const tol = lot ? checkTolerance(lot, c.type, c.observedValue) : null;
  return {
    claimId: c.id,
    txId: c.transactionId,
    lotId: c.lotId,
    lotTitle: lot?.title ?? c.lotId,
    buyer: companyName(state, c.buyerId),
    seller: companyName(state, c.sellerId),
    discrepancy: `${c.type[0]?.toUpperCase()}${c.type.slice(1)}: ${c.observed}`,
    tolerance: tol?.limit !== null && tol?.limit !== undefined ? `Limit ${tol.limit}${tol.unit === '%' ? '%' : '% variance'} · declared ${c.expected}` : c.expected,
    evidenceCount: c.mediaIds.length,
    requestedRemedy: c.requestedRemedy === 'price_adjustment' ? 'Price adjustment' : 'Exit with refund',
    sellerResponse: c.sellerResponse ? (c.sellerResponse.decision === 'accept' ? 'Accepted' : 'Disputed') : 'Awaiting seller',
    status: c.status,
    ageMs: ms(now) - ms(c.openedAt),
  };
}

export function opsOverview(state: DemoState, now: Iso): OpsOverviewView {
  const published = state.lots.filter((l) => l.status !== 'draft');
  const statusOf = (l: Lot) => deriveAuctionStatus(l, now);
  const closedLots = published.filter((l) => ['closed_reserve_met', 'closed_unsold', 'awarded'].includes(statusOf(l)));
  const terminal = (t: Transaction) => t.status === 'completed' || t.status === 'resolved' || t.status === 'defaulted';
  const completedTx = state.transactions.filter((t) => t.status === 'completed' || (t.status === 'resolved' && t.resolution !== 'exit_refund'));
  const opsReviewed = state.claims.filter((c) => c.status === 'under_review' || c.opsDecision !== null);

  const assuredLots = published.filter((l) => l.assurance.enabled);
  const biddersPerAssured = assuredLots.length
    ? assuredLots.reduce((n, l) => n + new Set(state.bids.filter((b) => b.lotId === l.id).map((b) => b.bidderId)).size, 0) / assuredLots.length
    : 0;
  const sold = closedLots.filter((l) => l.winningBidId);
  const hammer = sold.length
    ? sold.reduce((n, l) => n + (state.bids.find((b) => b.id === l.winningBidId)?.amountPerMt ?? l.reservePerMt) / l.reservePerMt - 1, 0) / sold.length
    : 0;

  const caption = 'Sample data · simulated';
  return {
    stats: {
      live: published.filter((l) => statusOf(l) === 'live').length,
      closed: closedLots.length,
      awaitingAction: state.transactions.filter((t) => !terminal(t)).length,
      openClaims: state.claims.filter((c) => c.status === 'open' || c.status === 'under_review').length,
      completed: completedTx.length,
    },
    metrics: [
      { label: 'North Star: completed ÷ lots listed', value: pct(published.length ? completedTx.length / published.length : 0), caption: `${completedTx.length} of ${published.length} demo lots · ${caption}` },
      { label: 'Auction clear rate', value: pct(closedLots.length ? sold.length / closedLots.length : 0), caption: `${sold.length} of ${closedLots.length} closed lots met the reserve · ${caption}` },
      { label: 'Unique bidders per assured lot', value: biddersPerAssured.toFixed(1), caption },
      { label: 'Defaults', value: String(state.transactions.filter((t) => t.status === 'defaulted').length), caption: `Mismatch-related defaults aren’t separated in demo data · ${caption}` },
      { label: 'Ops reviews per 100 completions', value: (completedTx.length ? (opsReviewed.length / completedTx.length) * 100 : 0).toFixed(1), caption },
      { label: 'Hammer price vs reserve', value: `+${pct(hammer)}`, caption },
    ],
    baseline: {
      label: 'Case-study baseline',
      value: '41%',
      caption: '~205 completed of 500 lots/month (case study, not platform data)',
    },
    queue: state.claims
      .filter((c) => c.status === 'under_review' || c.status === 'open')
      .sort((a, b) => Number(b.status === 'under_review') - Number(a.status === 'under_review') || ms(a.openedAt) - ms(b.openedAt))
      .map((c) => queueRow(state, c, now)),
    decided: state.claims
      .filter((c) => c.status === 'resolved' || c.status === 'rejected')
      .sort((a, b) => ms(b.resolvedAt ?? b.openedAt) - ms(a.resolvedAt ?? a.openedAt))
      .map((c) => queueRow(state, c, now)),
    auctions: published
      .filter((l) => statusOf(l) !== 'scheduled')
      .map((l) => {
        const bids = state.bids.filter((b) => b.lotId === l.id);
        const top = highestBid(bids);
        return {
          lotId: l.id,
          title: l.title,
          seller: state.companies.find((c) => c.id === l.sellerCompanyId)?.name ?? '',
          status: statusOf(l),
          endAt: l.endAt,
          bidCount: bids.length,
          highestBidPerMt: top?.amountPerMt ?? null,
          reservePerMt: l.reservePerMt,
          reserveMet: !!top && top.amountPerMt >= l.reservePerMt,
          transactionId: state.transactions.find((t) => t.lotId === l.id)?.id ?? null,
        };
      })
      .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || ms(b.endAt) - ms(a.endAt)),
    transactions: state.transactions
      .filter((t) => !terminal(t))
      .map((t) => {
        const lot = state.lots.find((l) => l.id === t.lotId);
        const n = nextStep(t, lot?.assurance.enabled ?? false);
        return {
          id: t.id,
          lotTitle: lot?.title ?? t.lotId,
          buyer: companyName(state, t.buyerId),
          seller: companyName(state, t.sellerId),
          statusLabel: STATUS_LABEL[t.status],
          waitingOn: n ? `${n.role === 'ops' ? 'Operations' : n.role === 'buyer' ? 'Buyer' : 'Seller'}: ${n.label}` : null,
          overdue: t.status === 'won_awaiting_balance' && ms(now) > ms(t.paymentDeadline),
        };
      })
      .sort((a, b) => Number(b.overdue) - Number(a.overdue)),
    recent: dedupe(
      [...state.audit]
        .sort((a, b) => ms(b.at) - ms(a.at))
        .map((a) => ({ id: a.id, at: a.at, label: ACTION_LABEL[a.action] ?? a.action.replace(/_/g, ' '), actor: actorName(state, a.actorId), reason: a.reason, entity: a.entityId })),
    ).slice(0, 10),
  };
}

export function formatRemedyOutcome(outcome: keyof ClaimReviewView['outcomes'], amount: number): string {
  if (outcome === 'approve_adjustment') return `Deduct ${formatINR(amount)} from the price (simulated)`;
  if (outcome === 'approve_exit') return `Return ${formatINR(amount)} EMD and balance to the buyer (simulated)`;
  return `Original terms: payable ${formatINR(amount)} on the measured quantity`;
}
