import type {
  BuyerDashboardView,
  BuyerRegistration,
  Claim,
  ClaimInput,
  ClaimReviewView,
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
  Role,
  TransactionCardView,
  User,
  Viewer,
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
  payEmd(lotId: string, outcome: 'success' | 'failure', viewer: Viewer): Promise<DsResult<EmdRecord>>;
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

  /** Validate and store one evidence file; it is attached when the action using it succeeds. */
  uploadMedia(file: File, stage: LotMedia['stage']): Promise<DsResult<LotMedia>>;

  registerBuyer(input: BuyerRegistration): Promise<DsResult<{ user: User; company: Company }>>;
  getUser(id: string): Promise<DsResult<{ user: User; company: Company | null } | null>>;
  emailExists(email: string): Promise<DsResult<boolean>>;

  notifications(viewer: Viewer): Promise<DsResult<Notification[]>>;
  markNotificationsRead(viewer: Viewer): Promise<DsResult<null>>;

  /** Restore the seed with fresh relative times. */
  reset(): Promise<DsResult<null>>;
  /** Called whenever data may have changed (this tab or another). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export const ROLE_LABEL: Record<Role, string> = { guest: 'Guest', buyer: 'Buyer', seller: 'Seller', ops: 'Operations' };
