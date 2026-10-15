import type {
  BuyerDashboardView,
  BuyerRegistration,
  Claim,
  ClaimInput,
  ClaimReviewView,
  ListingDraft,
  Lot,
  SellerDashboardView,
  SellerLotView,
  SellerRegistration,
  LotMedia,
  OpsDecision,
  OpsOverviewView,
  SellerResponse,
  Transaction,
  TxAction,
  TxDetailView,
  Company,
  EmdRecord,
  LotDetailView,
  LotFilters,
  LotListResult,
  Notification,
  Rejection,
  TransactionCardView,
  User,
  Viewer,
  AccountView,
  DocumentKind,
  DocumentView,
  Eligibility,
  EligibilityInput,
  EligibilityQueueRow,
  EligibilityReview,
  EligibilityReviewView,
  PaymentInput,
  RefundInput,
  Region,
  TeamView,
} from '@auctionit/domain';

/**
 * The only way pages read or change data (CLAUDE.md). Two implementations share
 * packages/domain: DemoDataSource (browser, localStorage) and HttpDataSource (apps/api, Phase 2).
 */
export type DsError = Rejection & { kind: 'rule' | 'network' };
export type DsResult<T> = { ok: true; data: T } | { ok: false; error: DsError };

export interface PlaceBidInput {
  lotId: string;
  amountPerMt: number | null;
  clientRequestId: string;
  seenHighestPerMt: number | null;
}

export interface DataSource {
  readonly kind: 'demo' | 'http';

  listLots(filters: LotFilters): Promise<DsResult<LotListResult>>;
  getLot(id: string, viewer: Viewer): Promise<DsResult<LotDetailView | null>>;
  /** Buyer reports an EMD paid outside AuctionIT; it allows bidding only once the lot's seller confirms it. */
  submitEmd(lotId: string, input: PaymentInput, viewer: Viewer): Promise<DsResult<EmdRecord>>;
  /** The lot's seller confirms receiving a reported EMD, or rejects it with a reason. */
  decideEmd(emdId: string, decision: { decision: 'confirmed' | 'rejected'; reason: string }, viewer: Viewer): Promise<DsResult<EmdRecord>>;
  /** The seller records an EMD refund made outside AuctionIT. */
  recordEmdRefund(emdId: string, refund: RefundInput, viewer: Viewer): Promise<DsResult<EmdRecord>>;
  placeBid(input: PlaceBidInput, viewer: Viewer): Promise<DsResult<{ amountPerMt: number; minNext: number }>>;
  closeDemoAuction(lotId: string, viewer: Viewer): Promise<DsResult<{ status: string; transactionId: string | null }>>;

  buyerDashboard(viewer: Viewer): Promise<DsResult<BuyerDashboardView | null>>;
  transactionSummary(id: string, viewer: Viewer): Promise<DsResult<TransactionCardView | null>>;

  transactionDetail(id: string, viewer: Viewer): Promise<DsResult<TxDetailView | null>>;
  /** One transaction step; `media` are files uploaded for it (weighbridge ticket, lifting photos). */
  txAction(id: string, action: TxAction, viewer: Viewer, media?: LotMedia[]): Promise<DsResult<Transaction>>;
  submitClaim(txId: string, input: ClaimInput, viewer: Viewer, media: LotMedia[]): Promise<DsResult<Claim>>;
  respondClaim(claimId: string, response: Pick<SellerResponse, 'decision' | 'explanation'>, viewer: Viewer, media: LotMedia[]): Promise<DsResult<Claim>>;
  decideClaim(claimId: string, decision: { outcome: OpsDecision['outcome']; reason: string }, viewer: Viewer): Promise<DsResult<Claim>>;
  claimReview(claimId: string, viewer: Viewer): Promise<DsResult<ClaimReviewView | null>>;
  opsOverview(viewer: Viewer): Promise<DsResult<OpsOverviewView | null>>;

  sellerDashboard(viewer: Viewer): Promise<DsResult<SellerDashboardView | null>>;
  sellerLot(lotId: string, viewer: Viewer): Promise<DsResult<SellerLotView | null>>;
  /** Create (no lotId) or update a draft; returns the saved lot. */
  saveDraft(lotId: string | null, draft: ListingDraft, viewer: Viewer): Promise<DsResult<Lot>>;
  publishLot(lotId: string, viewer: Viewer): Promise<DsResult<Lot>>;
  deleteDraft(lotId: string, viewer: Viewer): Promise<DsResult<null>>;
  /** Take a published auction down before it ends, with a reason bidders see (D-104). */
  withdrawLot(lotId: string, reason: string, viewer: Viewer): Promise<DsResult<Lot>>;
  /** Add already-uploaded photos or videos to a published lot until it ends (D-104). */
  addLotMedia(lotId: string, media: LotMedia[], viewer: Viewer): Promise<DsResult<Lot>>;
  registerSeller(input: SellerRegistration): Promise<DsResult<{ user: User; company: Company }>>;

  /** Validate and store one evidence file; it is attached when the action using it succeeds. */
  uploadMedia(file: File, stage: LotMedia['stage'], viewer: Viewer): Promise<DsResult<LotMedia>>;

  registerBuyer(input: BuyerRegistration): Promise<DsResult<{ user: User; company: Company }>>;
  /** The signed-in account (API: resolved from the verified sign-in, never from a client-supplied id). */
  me(viewer: Viewer): Promise<DsResult<{ user: User; company: Company | null } | null>>;

  // ── Eligibility (docs/PHASE1_MVP.md) ──
  accountView(viewer: Viewer): Promise<DsResult<AccountView | null>>;
  saveEligibility(input: EligibilityInput, viewer: Viewer): Promise<DsResult<Eligibility>>;
  submitEligibility(viewer: Viewer): Promise<DsResult<Company>>;
  /** Store a private file (eligibility document or payment receipt). */
  uploadDocument(file: File, kind: DocumentKind, viewer: Viewer): Promise<DsResult<DocumentView>>;
  removeDocument(id: string, viewer: Viewer): Promise<DsResult<null>>;
  /** A short-lived link to a private file, for its owner, a reviewer or the seller a receipt was sent to. */
  documentUrl(id: string, viewer: Viewer): Promise<DsResult<{ url: string | null }>>;
  eligibilityQueue(viewer: Viewer): Promise<DsResult<{ waiting: EligibilityQueueRow[]; decided: EligibilityQueueRow[] } | null>>;
  eligibilityReview(companyId: string, viewer: Viewer): Promise<DsResult<EligibilityReviewView | null>>;
  reviewEligibility(companyId: string, decision: { decision: EligibilityReview['decision']; reason: string }, viewer: Viewer): Promise<DsResult<Company>>;
  // ── Staff and regions (D-102) — admin only, except the queue above, which is region-scoped ──
  team(viewer: Viewer): Promise<DsResult<TeamView | null>>;
  /** Invite someone as a reviewer for these regions (live: Supabase emails the invitation). */
  appointReviewer(input: { name: string; email: string; regions: Region[] }, viewer: Viewer): Promise<DsResult<User>>;
  setReviewerRegions(userId: string, regions: Region[], viewer: Viewer): Promise<DsResult<User>>;
  removeReviewer(userId: string, viewer: Viewer): Promise<DsResult<User>>;
  /** Record the state of an application that has none (registered before regions existed). */
  setApplicationState(companyId: string, state: string, viewer: Viewer): Promise<DsResult<Company>>;

  getUser(id: string): Promise<DsResult<{ user: User; company: Company | null } | null>>;
  emailExists(email: string): Promise<DsResult<boolean>>;

  notifications(viewer: Viewer): Promise<DsResult<Notification[]>>;
  markNotificationsRead(viewer: Viewer): Promise<DsResult<null>>;

  /** Restore the seed with fresh relative times. */
  reset(): Promise<DsResult<null>>;
  /** Called whenever data may have changed (this tab or another). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}

