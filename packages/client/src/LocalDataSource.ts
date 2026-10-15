import {
  buyerDashboard,
  claimReview,
  closeDemoAuction,
  deleteDraft,
  kindOf,
  listLots,
  lotDetail,
  markNotificationsRead,
  opsDecide,
  opsOverview,
  payEmd,
  placeBid,
  processDueClosures,
  publishLot,
  registerBuyer,
  registerSeller,
  runTxAction,
  saveDraft,
  sellerDashboard,
  sellerLot,
  sellerRespond,
  submitClaim,
  transactionDetail,
  transactionSummary,
  validateUpload,
  type DemoState,
  type ListingDraft,
  type LotMedia,
  type OpResult,
  type Viewer,
} from '@auctionit/domain';
import type { DataSource, DsResult } from './DataSource';
import type { StateStore } from './store';

export interface LocalOptions {
  /** Simulated latency so loading states are visible (browser demo). */
  latencyMs?: [min: number, max: number];
  /** Return true to fail this operation with a simulated network error. */
  shouldFail?: (op: string) => boolean;
  /** Turn an uploaded file into a URL to keep (browser: small JPEG data URL). */
  preview?: (file: File) => Promise<string>;
  clock?: () => string;
}

const NETWORK: DsResult<never> = {
  ok: false,
  error: { kind: 'network', code: 'network', what: 'We couldn’t reach the server.', next: 'Check your connection and try again. Nothing was changed.' },
};

const actor = (v: Viewer) => ({ id: v.id ?? 'guest', role: v.role });

/** Same answer the API gives when the session's user no longer exists (e.g. after a data reset). */
export const INVALID_SESSION: DsResult<never> = {
  ok: false,
  error: { kind: 'rule', code: 'invalid_session', what: 'Your demo session isn’t valid any more.', next: 'Choose a demo account again — the data may have been reset.' },
};

/**
 * The DataSource that runs packages/domain directly against a state snapshot — demo mode in the
 * browser, and the reference implementation the contract tests compare the API against.
 */
export class LocalDataSource implements DataSource {
  readonly kind = 'demo' as const;
  constructor(
    private readonly store: StateStore,
    private readonly opts: LocalOptions = {},
  ) {}

  private now = () => (this.opts.clock ? this.opts.clock() : new Date().toISOString());

  private delay() {
    const [min, max] = this.opts.latencyMs ?? [0, 0];
    return max > 0 ? new Promise((r) => setTimeout(r, min + Math.random() * (max - min))) : Promise.resolve();
  }

  /** Current state, closing any auctions whose end time has passed (close on read). */
  private current(): DemoState {
    const state = this.store.load();
    const r = processDueClosures(state, this.now());
    if (r.closed.length) this.store.save(r.state);
    return r.state;
  }

  /** A signed-in viewer must still exist with that role (parity with the API's session check). */
  private valid(viewer: Viewer): boolean {
    if (!viewer.id) return true;
    const u = this.store.load().users.find((x) => x.id === viewer.id);
    return !!u && u.role === viewer.role;
  }

  private as<T>(viewer: Viewer, run: () => Promise<DsResult<T>>): Promise<DsResult<T>> {
    return this.valid(viewer) ? run() : this.delay().then(() => INVALID_SESSION);
  }

  private read<T>(op: string, fn: (s: DemoState) => T): Promise<DsResult<T>> {
    return this.delay().then(() => (this.opts.shouldFail?.(op) ? NETWORK : { ok: true, data: fn(this.current()) }));
  }

  private write<T>(op: string, fn: (s: DemoState) => OpResult<T>): Promise<DsResult<T>> {
    return this.delay().then(() => {
      if (this.opts.shouldFail?.(op)) return NETWORK;
      const before = this.current();
      const r = fn(before);
      // Some rejections still record something (a failed simulated EMD payment), so persist any change.
      if (r.state !== before) this.store.save(r.state);
      return r.ok ? { ok: true, data: r.value } : { ok: false, error: { ...r.error, kind: 'rule' } };
    });
  }

  listLots: DataSource['listLots'] = (filters) => this.read('listLots', (s) => listLots(s, filters, this.now()));
  getLot: DataSource['getLot'] = (id, viewer) => this.as(viewer, () => this.read('getLot', (s) => lotDetail(s, id, viewer, this.now())));
  payEmd: DataSource['payEmd'] = (lotId, outcome, viewer) => this.as(viewer, () => this.write('payEmd', (s) => payEmd(s, { lotId, outcome }, actor(viewer), this.now())));
  placeBid: DataSource['placeBid'] = (input, viewer) =>
    this.as(viewer, () => this.write('placeBid', (s) => {
      const r = placeBid(s, input, actor(viewer), this.now());
      return r.ok ? { ...r, value: { amountPerMt: r.value.bid.amountPerMt, minNext: r.value.minNext } } : r;
    }));
  closeDemoAuction: DataSource['closeDemoAuction'] = (lotId, viewer) => this.as(viewer, () => this.write('closeDemoAuction', (s) => closeDemoAuction(s, lotId, actor(viewer), this.now())));

  buyerDashboard: DataSource['buyerDashboard'] = (viewer) => this.as(viewer, () => this.read('buyerDashboard', (s) => (viewer.id ? buyerDashboard(s, viewer.id, this.now()) : null)));
  transactionSummary: DataSource['transactionSummary'] = (id, viewer) => this.as(viewer, () => this.read('transactionSummary', (s) => transactionSummary(s, id, viewer)));
  transactionDetail: DataSource['transactionDetail'] = (id, viewer) => this.as(viewer, () => this.read('transactionDetail', (s) => transactionDetail(s, id, viewer, this.now())));
  txAction: DataSource['txAction'] = (id, action, viewer, media = []) => this.as(viewer, () => this.write('txAction', (s) => runTxAction(s, id, action, actor(viewer), this.now(), media)));
  submitClaim: DataSource['submitClaim'] = (txId, input, viewer, media) => this.as(viewer, () => this.write('submitClaim', (s) => submitClaim(s, txId, input, actor(viewer), this.now(), media)));
  respondClaim: DataSource['respondClaim'] = (claimId, response, viewer, media) => this.as(viewer, () => this.write('respondClaim', (s) => sellerRespond(s, claimId, response, actor(viewer), this.now(), media)));
  decideClaim: DataSource['decideClaim'] = (claimId, decision, viewer) => this.as(viewer, () => this.write('decideClaim', (s) => opsDecide(s, claimId, decision, actor(viewer), this.now())));
  claimReview: DataSource['claimReview'] = (claimId, viewer) => this.as(viewer, () => this.read('claimReview', (s) => claimReview(s, claimId, viewer, this.now())));
  opsOverview: DataSource['opsOverview'] = (viewer) => this.as(viewer, () => this.read('opsOverview', (s) => (viewer.role === 'ops' ? opsOverview(s, this.now()) : null)));

  sellerDashboard: DataSource['sellerDashboard'] = (viewer) => this.as(viewer, () => this.read('sellerDashboard', (s) => (viewer.id && viewer.role === 'seller' ? sellerDashboard(s, viewer.id, this.now()) : null)));
  sellerLot: DataSource['sellerLot'] = (lotId, viewer) => this.as(viewer, () => this.read('sellerLot', (s) => (viewer.id ? sellerLot(s, lotId, viewer.id, this.now()) : null)));
  saveDraft: DataSource['saveDraft'] = (lotId, draft: ListingDraft, viewer) => this.as(viewer, () => this.write('saveDraft', (s) => saveDraft(s, { lotId, draft }, actor(viewer), this.now())));
  publishLot: DataSource['publishLot'] = (lotId, viewer) => this.as(viewer, () => this.write('publishLot', (s) => publishLot(s, lotId, actor(viewer), this.now())));
  deleteDraft: DataSource['deleteDraft'] = (lotId, viewer) => this.as(viewer, () => this.write('deleteDraft', (s) => deleteDraft(s, lotId, actor(viewer), this.now())));
  registerSeller: DataSource['registerSeller'] = (input) => this.write('registerSeller', (s) => registerSeller(s, input, this.now()));
  registerBuyer: DataSource['registerBuyer'] = (input) => this.write('registerBuyer', (s) => registerBuyer(s, input, this.now()));

  getUser: DataSource['getUser'] = (id) =>
    this.read('getUser', (s) => {
      const user = s.users.find((u) => u.id === id);
      return user ? { user, company: s.companies.find((c) => c.id === user.companyId) ?? null } : null;
    });
  emailExists: DataSource['emailExists'] = (email) => this.read('emailExists', (s) => s.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()));
  notifications: DataSource['notifications'] = (viewer) =>
    this.as(viewer, () => this.read('notifications', (s) => s.notifications.filter((n) => n.userId === viewer.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))));
  markNotificationsRead: DataSource['markNotificationsRead'] = (viewer) =>
    this.as(viewer, () =>
      this.delay().then(() => {
        if (viewer.id) this.store.save(markNotificationsRead(this.current(), viewer.id));
        return { ok: true as const, data: null };
      }),
    );

  uploadMedia: DataSource['uploadMedia'] = async (file, stage) => {
    await this.delay();
    if (this.opts.shouldFail?.('uploadMedia')) {
      return { ok: false, error: { kind: 'network', code: 'network', what: `The upload of ${file.name} was interrupted.`, next: 'Retry the upload. Nothing else was changed.' } };
    }
    const problem = validateUpload(file);
    if (problem) return { ok: false, error: { kind: 'rule', code: 'invalid_file', what: problem, next: 'Choose a different file.' } };
    const media: LotMedia = {
      id: `M-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: kindOf(file.type) ?? 'document',
      url: this.opts.preview ? await this.opts.preview(file) : '',
      caption: file.name,
      stage,
      uploadedAt: this.now(),
    };
    return { ok: true, data: media };
  };

  reset: DataSource['reset'] = () =>
    this.delay().then(() => {
      this.store.reset();
      return { ok: true as const, data: null };
    });

  subscribe: DataSource['subscribe'] = (listener) => this.store.subscribe(listener);
}
