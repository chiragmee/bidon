/**
 * Core types. Money is integer rupees (no paise needed for MT-level scrap pricing);
 * quantities are metric tonnes (MT) as decimals; times are ISO-8601 strings.
 */

import type { Region } from './regions';

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
  /**
   * Eligibility (docs/PHASE1_MVP.md). `incomplete → pending_review → approved | needs_info | rejected`, decided by a
   * reviewer from the submitted application. `demo_approved` is the seeded sample companies' status (treated as
   * approved; sample records are hidden on the live site). `pending` is a legacy value, treated as incomplete.
   */
  verification: VerificationStatus;
  /** The eligibility application; absent for seeded sample companies. */
  eligibility?: Eligibility;
}

export type VerificationStatus = 'incomplete' | 'pending_review' | 'approved' | 'needs_info' | 'rejected' | 'demo_approved' | 'pending';

export type EntityType = 'proprietorship' | 'partnership' | 'llp' | 'private_limited' | 'public_limited';

export interface BankDetails {
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
}

export interface EligibilityReview {
  decision: 'approved' | 'needs_info' | 'rejected';
  reason: string;
  reviewedBy: string;
  reviewedAt: Iso;
}

export interface EligibilityEvent {
  action: 'saved' | 'submitted' | 'approved' | 'needs_info' | 'rejected';
  by: string;
  at: Iso;
  reason: string | null;
}

/** What the business tells AuctionIT; reviewed by a person. Nothing here is independently verified. */
export interface Eligibility {
  entityType: EntityType | null;
  legalName: string;
  pan: string;
  gstin: string;
  /** CIN (companies) or LLPIN (LLPs). */
  registrationNumber: string;
  registeredAddress: string;
  /** State of the registered address (regions.ts code, e.g. "MH"); decides the region and so the reviewers. '' = not set. */
  state: string;
  representative: { name: string; designation: string };
  /** Sellers: authority to sell the material, and bank details for receiving EMD and payments. */
  sellerDeclaration: { authorisedToSell: boolean; materialSource: string } | null;
  bankDetails: BankDetails | null;
  documentIds: string[];
  submittedAt: Iso | null;
  review: EligibilityReview | null;
  history: EligibilityEvent[];
}

export type DocumentKind =
  | 'pan_card'
  | 'gst_certificate'
  | 'constitution'
  | 'address_proof'
  | 'representative_id'
  | 'authorisation_letter'
  | 'premises_proof'
  | 'cancelled_cheque'
  | 'payment_receipt';

/** A private file (eligibility document or payment receipt). Only the owner, a reviewer or the counterparty sees it. */
export interface AccountDocument {
  id: string;
  companyId: string;
  kind: DocumentKind;
  fileName: string;
  contentType: string;
  size: number;
  /** Private storage path (API) or a data URL (browser demo mode). Never a public URL. */
  path: string;
  uploadedAt: Iso;
  uploadedBy: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, 'guest'>;
  companyId: string | null;
  title: string;
  /** Normalised +91XXXXXXXXXX; unique across accounts. Not verified by OTP (no SMS provider). */
  phone?: string | null;
  /** Supabase Auth user id; the API resolves the signed-in user through this, never through a client value. */
  authUserId?: string | null;
  /**
   * Operations staff only (D-102). admin: every region, appoints reviewers. reviewer: only `regions`.
   * removed: no staff access (kept for the history of their decisions). Missing = reviewer with no regions (fail closed).
   */
  staffLevel?: StaffLevel | null;
  regions?: Region[];
}

export type StaffLevel = 'admin' | 'reviewer' | 'removed';

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

export type PaymentMethod = 'neft' | 'rtgs' | 'imps' | 'upi' | 'cheque' | 'demand_draft';

/** A payment made outside AuctionIT, as reported by the payer. AuctionIT never collects or verifies money. */
export interface PaymentSubmission {
  amount: Rupees;
  method: PaymentMethod;
  paidOn: string;
  reference: string;
  payerName: string;
  receiptDocumentId: string | null;
  submittedAt: Iso;
  submittedBy: string;
}

/** The receiving party's answer after checking their own account. */
export interface PaymentDecision {
  decision: 'confirmed' | 'rejected';
  reason: string | null;
  decidedBy: string;
  decidedAt: Iso;
}

/** A refund arranged outside AuctionIT and recorded by the party who made it. */
export interface RefundRecord {
  amount: Rupees;
  refundedOn: string;
  reference: string;
  note: string;
  recordedBy: string;
  recordedAt: Iso;
}

export type PaymentEvent =
  | { type: 'submitted'; submission: PaymentSubmission }
  | { type: 'decided'; decision: PaymentDecision }
  | { type: 'refund_recorded'; refund: RefundRecord };

/**
 * EMD for one buyer and lot. `submitted` (buyer reported a payment) → `confirmed` by the lot's seller, or
 * `rejected` with a reason (the buyer corrects and resubmits). Losing bidders' confirmed EMDs become `refund_due`
 * at close; the seller records the refund (`refunded`). Seeded sample records use mode `simulated`.
 */
export interface EmdRecord {
  id: string;
  lotId: string;
  buyerId: string;
  amount: Rupees;
  status: 'submitted' | 'confirmed' | 'rejected' | 'refund_due' | 'refunded' | 'forfeited';
  reference: string;
  mode: 'simulated' | 'manual';
  createdAt: Iso;
  payment?: PaymentSubmission | null;
  decision?: PaymentDecision | null;
  refund?: RefundRecord | null;
  /** Every submission, decision and refund in order; earlier submissions are kept when corrected. */
  history?: PaymentEvent[];
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
  /** Balance the seller confirmed receiving (seeded sample records: simulated). */
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
  /** The buyer's latest reported balance payment and the seller's answer to it. */
  balancePayment?: { submission: PaymentSubmission; decision: PaymentDecision | null } | null;
  /** Every balance submission, decision and refund, in order. */
  paymentHistory?: PaymentEvent[];
  refunds?: RefundRecord[];
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
  entity: 'lot' | 'transaction' | 'claim' | 'emd' | 'bid' | 'user' | 'company' | 'document';
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
  | 'transaction_defaulted'
  | 'emd_submitted'
  | 'emd_confirmed'
  | 'emd_rejected'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'refund_recorded'
  | 'eligibility_submitted'
  | 'eligibility_decided';

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
