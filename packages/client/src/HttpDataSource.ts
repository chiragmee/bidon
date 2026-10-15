import type { DocumentView, LotFilters, LotMedia, Viewer } from '@auctionit/domain';
import type { DataSource, DsError, DsResult } from './DataSource';

export interface HttpOptions {
  baseUrl: string;
  /** Presenter-controls only: demo session sent as x-demo-session ("role:userId"). The API ignores it on the live site. */
  session?: () => string | null;
  /** Supabase Auth access token for the signed-in user (live site). The API derives identity and role from it. */
  accessToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
  /** Called after every successful write so open views refresh. */
  onChange?: () => void;
}

const NETWORK: DsError = { kind: 'network', code: 'network', what: 'We couldn’t reach the server.', next: 'Check your connection and try again. Nothing was changed.' };

function query(filters: LotFilters): string {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.categories?.length) p.set('cat', filters.categories.join(','));
  if (filters.city) p.set('city', filters.city);
  if (filters.assured) p.set('assured', '1');
  if (filters.statuses?.length) p.set('status', filters.statuses.join(','));
  if (filters.endingSoon) p.set('soon', '1');
  if (filters.sort) p.set('sort', filters.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * DataSource over the AuctionIT API (apps/api). The API answers with the same read models and
 * rejection codes as LocalDataSource, which the contract tests check.
 */
export class HttpDataSource implements DataSource {
  readonly kind = 'http' as const;
  private listeners = new Set<() => void>();
  constructor(private readonly opts: HttpOptions) {}

  private async call<T>(method: string, path: string, body?: unknown, viewer?: Viewer, isWrite = method !== 'GET'): Promise<DsResult<T>> {
    const headers: Record<string, string> = {};
    const token = this.opts.accessToken ? await this.opts.accessToken() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    else {
      const session = viewer?.id ? `${viewer.role}:${viewer.id}` : this.opts.session?.();
      if (session) headers['x-demo-session'] = session;
    }
    if (body !== undefined && !(body instanceof Blob)) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await (this.opts.fetch ?? fetch)(`${this.opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
        credentials: 'include',
      });
    } catch {
      return { ok: false, error: NETWORK };
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) {
      const e = (json as { error?: { code: string; what: string; next: string } } | null)?.error;
      return { ok: false, error: e ? { kind: res.status >= 500 ? 'network' : 'rule', code: e.code, what: e.what, next: e.next } : NETWORK };
    }
    if (isWrite) {
      this.opts.onChange?.();
      this.listeners.forEach((l) => l());
    }
    return { ok: true, data: (json as { data: T }).data };
  }

  listLots: DataSource['listLots'] = (filters) => this.call('GET', `/lots${query(filters)}`);
  getLot: DataSource['getLot'] = (id, viewer) => this.call('GET', `/lots/${encodeURIComponent(id)}`, undefined, viewer);
  submitEmd: DataSource['submitEmd'] = (lotId, input, viewer) => this.call('POST', `/lots/${encodeURIComponent(lotId)}/emd`, input, viewer);
  decideEmd: DataSource['decideEmd'] = (emdId, decision, viewer) => this.call('POST', `/emds/${encodeURIComponent(emdId)}/decision`, decision, viewer);
  recordEmdRefund: DataSource['recordEmdRefund'] = (emdId, refund, viewer) => this.call('POST', `/emds/${encodeURIComponent(emdId)}/refund`, refund, viewer);
  placeBid: DataSource['placeBid'] = (input, viewer) => this.call('POST', `/lots/${encodeURIComponent(input.lotId)}/bids`, input, viewer);
  closeDemoAuction: DataSource['closeDemoAuction'] = (lotId, viewer) => this.call('POST', `/lots/${encodeURIComponent(lotId)}/close`, {}, viewer);

  buyerDashboard: DataSource['buyerDashboard'] = (viewer) => this.call('GET', '/buyer/dashboard', undefined, viewer);
  transactionSummary: DataSource['transactionSummary'] = (id, viewer) => this.call('GET', `/transactions/${encodeURIComponent(id)}/summary`, undefined, viewer);
  transactionDetail: DataSource['transactionDetail'] = (id, viewer) => this.call('GET', `/transactions/${encodeURIComponent(id)}`, undefined, viewer);
  txAction: DataSource['txAction'] = (id, action, viewer, media = []) => this.call('POST', `/transactions/${encodeURIComponent(id)}/actions`, { action, media }, viewer);
  submitClaim: DataSource['submitClaim'] = (txId, input, viewer, media) => this.call('POST', `/transactions/${encodeURIComponent(txId)}/claims`, { input, media }, viewer);
  respondClaim: DataSource['respondClaim'] = (claimId, response, viewer, media) => this.call('POST', `/claims/${encodeURIComponent(claimId)}/response`, { response, media }, viewer);
  decideClaim: DataSource['decideClaim'] = (claimId, decision, viewer) => this.call('POST', `/claims/${encodeURIComponent(claimId)}/decision`, decision, viewer);
  claimReview: DataSource['claimReview'] = (claimId, viewer) => this.call('GET', `/claims/${encodeURIComponent(claimId)}`, undefined, viewer);
  opsOverview: DataSource['opsOverview'] = (viewer) => this.call('GET', '/ops/overview', undefined, viewer);

  sellerDashboard: DataSource['sellerDashboard'] = (viewer) => this.call('GET', '/seller/dashboard', undefined, viewer);
  sellerLot: DataSource['sellerLot'] = (lotId, viewer) => this.call('GET', `/seller/lots/${encodeURIComponent(lotId)}`, undefined, viewer);
  saveDraft: DataSource['saveDraft'] = (lotId, draft, viewer) =>
    lotId ? this.call('PUT', `/seller/lots/${encodeURIComponent(lotId)}`, draft, viewer) : this.call('POST', '/seller/lots', draft, viewer);
  publishLot: DataSource['publishLot'] = (lotId, viewer) => this.call('POST', `/seller/lots/${encodeURIComponent(lotId)}/publish`, {}, viewer);
  deleteDraft: DataSource['deleteDraft'] = (lotId, viewer) => this.call('DELETE', `/seller/lots/${encodeURIComponent(lotId)}`, undefined, viewer);
  withdrawLot: DataSource['withdrawLot'] = (lotId, reason, viewer) => this.call('POST', `/seller/lots/${encodeURIComponent(lotId)}/withdraw`, { reason }, viewer);
  addLotMedia: DataSource['addLotMedia'] = (lotId, media, viewer) => this.call('POST', `/seller/lots/${encodeURIComponent(lotId)}/media`, { media }, viewer);

  registerBuyer: DataSource['registerBuyer'] = (input) => this.call('POST', '/onboarding/buyer', input);
  registerSeller: DataSource['registerSeller'] = (input) => this.call('POST', '/onboarding/seller', input);
  getUser: DataSource['getUser'] = (id) => this.call('GET', `/users/${encodeURIComponent(id)}`);
  me: DataSource['me'] = (viewer) => this.call('GET', '/me', undefined, viewer);

  accountView: DataSource['accountView'] = (viewer) => this.call('GET', '/account', undefined, viewer);
  saveEligibility: DataSource['saveEligibility'] = (input, viewer) => this.call('PUT', '/account/eligibility', input, viewer);
  submitEligibility: DataSource['submitEligibility'] = (viewer) => this.call('POST', '/account/eligibility/submit', {}, viewer);
  uploadDocument: DataSource['uploadDocument'] = async (file, kind, viewer) => {
    const path = `/account/documents?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`;
    const r = await this.call<DocumentView>('POST', path, file, viewer);
    return r.ok || r.error.code !== 'network' ? r : { ok: false, error: { ...r.error, what: `The upload of ${file.name} was interrupted.`, next: 'Retry the upload. Nothing else was changed.' } };
  };
  removeDocument: DataSource['removeDocument'] = (id, viewer) => this.call('DELETE', `/account/documents/${encodeURIComponent(id)}`, undefined, viewer);
  documentUrl: DataSource['documentUrl'] = (id, viewer) => this.call('GET', `/documents/${encodeURIComponent(id)}/url`, undefined, viewer);
  eligibilityQueue: DataSource['eligibilityQueue'] = (viewer) => this.call('GET', '/ops/eligibility', undefined, viewer);
  eligibilityReview: DataSource['eligibilityReview'] = (companyId, viewer) => this.call('GET', `/ops/eligibility/${encodeURIComponent(companyId)}`, undefined, viewer);
  reviewEligibility: DataSource['reviewEligibility'] = (companyId, decision, viewer) => this.call('POST', `/ops/eligibility/${encodeURIComponent(companyId)}/decision`, decision, viewer);
  team: DataSource['team'] = (viewer) => this.call('GET', '/ops/team', undefined, viewer);
  appointReviewer: DataSource['appointReviewer'] = (input, viewer) => this.call('POST', '/ops/team/reviewers', input, viewer);
  setReviewerRegions: DataSource['setReviewerRegions'] = (userId, regions, viewer) => this.call('PUT', `/ops/team/reviewers/${encodeURIComponent(userId)}/regions`, { regions }, viewer);
  removeReviewer: DataSource['removeReviewer'] = (userId, viewer) => this.call('DELETE', `/ops/team/reviewers/${encodeURIComponent(userId)}`, undefined, viewer);
  setApplicationState: DataSource['setApplicationState'] = (companyId, state, viewer) => this.call('PUT', `/ops/eligibility/${encodeURIComponent(companyId)}/state`, { state }, viewer);
  emailExists: DataSource['emailExists'] = (email) => this.call('GET', `/users/exists?email=${encodeURIComponent(email)}`);
  notifications: DataSource['notifications'] = (viewer) => this.call('GET', '/notifications', undefined, viewer);
  markNotificationsRead: DataSource['markNotificationsRead'] = (viewer) => this.call('POST', '/notifications/read', {}, viewer);

  uploadMedia: DataSource['uploadMedia'] = async (file, stage, viewer) => {
    const path = `/media?stage=${encodeURIComponent(stage)}&name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`;
    const r = await this.call<LotMedia>('POST', path, file, viewer, false);
    return r.ok || r.error.code !== 'network' ? r : { ok: false, error: { ...r.error, what: `The upload of ${file.name} was interrupted.`, next: 'Retry the upload. Nothing else was changed.' } };
  };

  reset: DataSource['reset'] = () => this.call('POST', '/demo/reset', {});
  /** No push channel: views poll, and every successful write here notifies listeners. */
  subscribe: DataSource['subscribe'] = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Liveness check used to fall back to demo mode with a visible banner. */
  async health(): Promise<boolean> {
    try {
      // A sleeping free-tier API can take a minute to wake; don't hold the first screen hostage.
      const res = await (this.opts.fetch ?? fetch)(`${this.opts.baseUrl}/health`, { signal: AbortSignal.timeout(8000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
