/**
 * Core types. Money is integer rupees (no paise needed for MT-level scrap pricing);
 * quantities are metric tonnes (MT) as decimals; times are ISO-8601 strings.
 */

export type Role = 'guest' | 'buyer' | 'seller' | 'ops';
export type Iso = string;
export type Rupees = number;

export type CategoryId = 'ferrous_hms' | 'mixed_steel' | 'non_ferrous' | 'e_waste' | 'machinery';

export interface Company {
  id: string;
  name: string;
  kind: 'buyer' | 'seller';
  city: string;
  state: string;
  businessType: string;
  /** Sellers: main yard or operating location (prefills new lots). */
  yard?: string;
  /** true for seeded (fictional) companies — the UI labels them "Sample data"; false for real registrations. */
  sample: boolean;
  /** Onboarding status. `demo_approved` = active without any document check (no KYC provider yet); never a KYC result. */
  verification: 'demo_approved' | 'pending';
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, 'guest'>;
  companyId: string | null;
  title: string;
}

// ── Lots and auctions ────────────────────────────────────────────────────────

/** Stored status. `scheduled → live → closed` is derived from time (deriveAuctionStatus). */
export type StoredLotStatus =
  | 'draft'
  | 'scheduled'
  | 'closed_reserve_met'
  | 'closed_unsold'
  | 'awarded';

export type AuctionStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'closed_reserve_met'
  | 'closed_unsold'
  | 'awarded';

export type MediaKind = 'photo' | 'video' | 'document';

export interface LotMedia {
  id: string;
  kind: MediaKind;
  url: string;
  caption: string;
  /** Who supplied it and at which stage. */
  stage: 'listing' | 'lifting' | 'claim' | 'claim_response';
  uploadedAt: Iso;
}

export interface SellerDeclaration {
  /** Seller-declared contamination as a percentage (0–100). */
  contaminationPct: number | null;
  grade: string;
  form: string;
  notes: string;
}

export interface LotAssurance {
  enabled: boolean;
  /** Seller ticked the agreement in wizard step 4. */
  agreedAt: Iso | null;
}

export interface Lot {
  id: string;
  sellerId: string;
  sellerCompanyId: string;
  title: string;
  category: CategoryId;
  grade: string;
  description: string;
  location: { yard: string; city: string; state: string };
  estimatedQtyMt: number;
  declaration: SellerDeclaration;
  attributes: Record<string, string>;
  reservePerMt: Rupees;
  /** Show reserve figure to buyers (§8.1 "where configured to be visible"). */
  reserveVisible: boolean;
  emdAmount: Rupees;
  bidIncrement: Rupees;
  startAt: Iso;
  endAt: Iso;
  status: StoredLotStatus;
  assurance: LotAssurance;
  media: LotMedia[];
  measurementBasis: string;
  createdAt: Iso;
  publishedAt: Iso | null;
  /** Set when the auction closes (by time or Ops). */
  closedAt: Iso | null;
  winningBidId: string | null;
}

export interface Bid {
  id: string;
  lotId: string;
  bidderId: string;
  amountPerMt: Rupees;
  placedAt: Iso;
  clientRequestId: string;
}

export interface EmdRecord {
  id: string;
  lotId: string;
  buyerId: string;
  amount: Rupees;
  status: 'succeeded' | 'failed' | 'refunded' | 'forfeited';
  reference: string;
  mode: 'simulated';
  createdAt: Iso;
}

// ── Transactions ─────────────────────────────────────────────────────────────

export type TransactionStatus =
  | 'won_awaiting_balance'
  | 'balance_paid'
  | 'lifting_proposed'
  | 'lifting_scheduled'
  | 'material_checked'
  | 'completed'
  | 'claim_opened'
  | 'under_review'
  | 'resolved'
  | 'defaulted';

export interface WeighbridgeMeasurement {
  ticketRef: string;
  weighbridge: string;
  grossMt: number | null;
  tareMt: number | null;
  measuredMt: number;
  ticketMediaId: string | null;
  measuredAt: Iso;
  recordedBy: string;
}

export interface ConditionCheck {
  observedContaminationPct: number;
  notes: string;
  photoMediaIds: string[];
  checkedAt: Iso;
  recordedBy: string;
}

export interface Transaction {
  id: string;
  lotId: string;
  buyerId: string;
  sellerId: string;
  winningBidId: string;
  pricePerMt: Rupees;
  estimatedQtyMt: number;
  emdAmount: Rupees;
  status: TransactionStatus;
  /** Simulated payments only. */
  balancePaid: Rupees;
  balancePaidAt: Iso | null;
  paymentDeadline: Iso;
  liftingProposedFor: Iso | null;
  liftingVehicle: string | null;
  liftingConfirmedAt: Iso | null;
  /** Loading complete closes the claim window (demo policy). */
  loadingCompletedAt: Iso | null;
  weighbridge: WeighbridgeMeasurement | null;
  condition: ConditionCheck | null;
  finalQtyMt: number | null;
  finalPayable: Rupees | null;
  /** Price adjustment applied by an accepted/decided claim. */
  adjustment: Rupees;
  resolution: 'completed' | 'price_adjustment' | 'exit_refund' | 'claim_rejected' | null;
  createdAt: Iso;
  completedAt: Iso | null;
  media: LotMedia[];
}

// ── Claims ───────────────────────────────────────────────────────────────────

export type ClaimType = 'quantity' | 'grade' | 'contamination' | 'condition';
export type RemedyKind = 'price_adjustment' | 'exit_refund';
export type ClaimStatus = 'open' | 'seller_responded' | 'under_review' | 'resolved' | 'rejected';

export interface SellerResponse {
  decision: 'accept' | 'dispute';
  explanation: string;
  mediaIds: string[];
  respondedAt: Iso;
  respondedBy: string;
}

export interface OpsDecision {
  outcome: 'approve_adjustment' | 'approve_exit' | 'reject';
  reason: string;
  amount: Rupees;
  decidedAt: Iso;
  decidedBy: string;
}

export interface Claim {
  id: string;
  transactionId: string;
  lotId: string;
  buyerId: string;
  sellerId: string;
  type: ClaimType;
  expected: string;
  /** Numeric observed value for tolerance checks (e.g. contamination %, measured MT). */
  observedValue: number;
  observed: string;
  explanation: string;
  requestedRemedy: RemedyKind;
  mediaIds: string[];
  status: ClaimStatus;
  sellerResponse: SellerResponse | null;
  opsDecision: OpsDecision | null;
  openedAt: Iso;
  resolvedAt: Iso | null;
}

// ── Audit and notifications ──────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  entity: 'lot' | 'transaction' | 'claim' | 'emd' | 'bid' | 'user';
  entityId: string;
  action: string;
  actorId: string;
  actorRole: Role;
  from: string | null;
  to: string | null;
  reason: string | null;
  at: Iso;
}

export type NotificationKind =
  | 'listing_published'
  | 'bid_accepted'
  | 'bid_rejected'
  | 'outbid'
  | 'auction_won'
  | 'auction_lost'
  | 'auction_closed'
  | 'balance_paid'
  | 'lifting_proposed'
  | 'lifting_confirmed'
  | 'claim_submitted'
  | 'seller_responded'
  | 'claim_resolved'
  | 'transaction_completed'
  | 'transaction_defaulted';

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  read: boolean;
  at: Iso;
}

// ── Results ──────────────────────────────────────────────────────────────────

/** A rejection always says what happened and what to do next (CLAUDE.md, SPEC §21). */
export interface Rejection<C extends string = string> {
  code: C;
  what: string;
  next: string;
}

export type Result<T, C extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: Rejection<C> };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const fail = <C extends string>(code: C, what: string, next: string) =>
  ({ ok: false, error: { code, what, next } }) as const;
