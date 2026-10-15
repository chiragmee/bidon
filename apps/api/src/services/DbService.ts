import {
  accountView,
  addDocument,
  canViewDocument,
  decideEmd,
  docView,
  eligibilityQueue,
  eligibilityReview,
  appointReviewer,
  removeReviewer,
  setApplicationState,
  setReviewerRegions,
  teamView,
  type AppointInput,
  type User,
  recordEmdRefund,
  removeDocument,
  reviewEligibility,
  saveEligibility,
  submitEligibility,
  submitEmd,
  withoutSamples,
  type AccountDocument,
  type DocumentView,
  bidRejection,
  bidNotifications,
  buyerDashboard,
  claimReview,
  closeDemoAuction,
  deleteDraft,
  listLots,
  lotDetail,
  markNotificationsRead,
  opsDecide,
  opsOverview,
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
  type BidRejectionCode,
  type DemoState,
  type OpResult,
  type Viewer,
} from '@auctionit/domain';
import type { DataSource, DsResult } from '@auctionit/client';
import type { Sql } from '../db/client';
import { closeDueAuctions, closeLot, insertNotifications, loadState, reseed, withWrite } from '../db/repo';

/** A private file already in storage, to be recorded on the uploader's company. */
export type StoredDocument = Omit<AccountDocument, 'id' | 'companyId' | 'uploadedAt' | 'uploadedBy'>;

/** The DataSource operations the API serves (uploads and change events are HTTP concerns). */
export type Service = Omit<DataSource, 'kind' | 'subscribe' | 'uploadMedia' | 'uploadDocument' | 'appointReviewer'> & {
  /** Record a file the route already put in private storage. */
  addDocument(doc: StoredDocument, viewer: Viewer): Promise<DsResult<DocumentView>>;
  /** Appoint a reviewer (D-102). `dryRun` checks the rules without writing — the route checks before it sends the invitation. */
  appointReviewer(input: AppointInput, viewer: Viewer, opts?: { dryRun?: boolean }): Promise<DsResult<User>>;
};

/** Unique-index names → the refusal the domain would give, for writes that race past its checks. */
const UNIQUE: Record<string, { code: string; what: string; next: string }> = {
  profiles_email_key: { code: 'duplicate_account', what: 'An AuctionIT account already uses this email, mobile number or sign-in.', next: 'Each person and business holds one account, as a buyer or a seller. Sign in to your existing account, or contact AuctionIT support.' },
  profiles_phone_key: { code: 'duplicate_account', what: 'An AuctionIT account already uses this email, mobile number or sign-in.', next: 'Each person and business holds one account, as a buyer or a seller. Sign in to your existing account, or contact AuctionIT support.' },
  profiles_auth_user_key: { code: 'duplicate_account', what: 'An AuctionIT account already uses this email, mobile number or sign-in.', next: 'Each person and business holds one account, as a buyer or a seller. Sign in to your existing account, or contact AuctionIT support.' },
  companies_pan_key: { code: 'duplicate_identity', what: 'These business details are already registered with AuctionIT.', next: 'Each business can hold one account, as a buyer or a seller. If this is your business, sign in to that account; otherwise contact AuctionIT support.' },
  companies_gstin_key: { code: 'duplicate_identity', what: 'These business details are already registered with AuctionIT.', next: 'Each business can hold one account, as a buyer or a seller. If this is your business, sign in to that account; otherwise contact AuctionIT support.' },
};

const actor = (v: Viewer) => ({ id: v.id ?? 'guest', role: v.role });
const now = () => new Date().toISOString();

/**
 * Postgres-backed service. Same packages/domain operations as demo mode, applied to a snapshot and
 * written back as a row diff; bids and auction closes go through the place_bid / close_auction
 * functions for row-locked atomicity.
 */
export class DbService implements Service {
  /** What every operation sees: on the live site, the marketplace without seeded sample records. */
  private readonly view: (s: DemoState) => DemoState;
  constructor(
    private readonly sql: Sql,
    opts: { hideSamples?: boolean } = {},
  ) {
    this.view = opts.hideSamples ? withoutSamples : (s) => s;
  }

  private async state(): Promise<DemoState> {
    return this.view(await loadState(this.sql));
  }

  private async read<T>(fn: (s: DemoState, at: string) => T): Promise<DsResult<T>> {
    const at = now();
    await closeDueAuctions(this.sql, at);
    return { ok: true, data: fn(await this.state(), at) };
  }

  private async write<T>(fn: (s: DemoState, at: string) => OpResult<T>): Promise<DsResult<T>> {
    const at = now();
    await closeDueAuctions(this.sql, at);
    try {
      const r = await withWrite(
        this.sql,
        (_tx, s) => {
          const out = fn(s, at);
          return { state: out.state, result: out };
        },
        this.view,
      );
      return r.ok ? { ok: true, data: r.value } : { ok: false, error: { ...r.error, kind: 'rule' } };
    } catch (e) {
      const unique = (e as { code?: string; constraint_name?: string }).code === '23505' ? UNIQUE[(e as { constraint_name?: string }).constraint_name ?? ''] : undefined;
      if (unique) return { ok: false, error: { ...unique, kind: 'rule' } };
      throw e;
    }
  }

  listLots: Service['listLots'] = (filters) => this.read((s, at) => listLots(s, filters, at));
  getLot: Service['getLot'] = (id, viewer) => this.read((s, at) => lotDetail(s, id, viewer, at));
  submitEmd: Service['submitEmd'] = (lotId, input, viewer) => this.write((s, at) => submitEmd(s, lotId, input, actor(viewer), at));
  decideEmd: Service['decideEmd'] = (emdId, decision, viewer) => this.write((s, at) => decideEmd(s, emdId, decision, actor(viewer), at));
  recordEmdRefund: Service['recordEmdRefund'] = (emdId, refund, viewer) => this.write((s, at) => recordEmdRefund(s, emdId, refund, actor(viewer), at));

  /** place_bid (Postgres) re-checks every rule under a row lock; messages come from the domain. */
  placeBid: Service['placeBid'] = async (input, viewer) => {
    const at = now();
    await closeDueAuctions(this.sql, at);
    const amount = typeof input.amountPerMt === 'number' && Number.isInteger(input.amountPerMt) ? input.amountPerMt : null;
    return this.sql.begin(async (tx) => {
      const [{ r }] = (await tx`select place_bid(${input.lotId}, ${viewer.id ?? ''}, ${amount}, ${input.clientRequestId}, ${input.seenHighestPerMt}, null) as r`) as unknown as [
        { r: { ok: boolean; code?: string; bid_id?: string; min_next?: number; previous_leader_id?: string | null; highest?: number | null } },
      ];
      if (!r.ok) {
        if (r.code === 'not_found') return { ok: false as const, error: { kind: 'rule' as const, code: 'not_found', what: 'That lot does not exist.', next: 'Go back to the auctions list.' } };
        const [lot] = await tx`select start_at, emd_amount from lots where id = ${input.lotId}`;
        const rej = bidRejection(r.code as BidRejectionCode, {
          lot: { startAt: lot?.start_at instanceof Date ? lot.start_at.toISOString() : String(lot?.start_at ?? ''), emdAmount: Number(lot?.emd_amount ?? 0) },
          minNext: r.min_next === undefined ? undefined : Number(r.min_next),
          highest: r.highest === undefined || r.highest === null ? null : Number(r.highest),
        });
        return { ok: false as const, error: { ...rej, kind: 'rule' as const } };
      }
      await insertNotifications(tx, bidNotifications(input.lotId, viewer.id ?? '', amount ?? 0, r.previous_leader_id ?? null), at);
      return { ok: true as const, data: { amountPerMt: amount ?? 0, minNext: Number(r.min_next) } };
    });
  };

  /** Domain decides whether it's allowed (and the wording); close_auction does the close. */
  closeDemoAuction: Service['closeDemoAuction'] = async (lotId, viewer) => {
    const at = now();
    await closeDueAuctions(this.sql, at);
    const check = closeDemoAuction(await this.state(), lotId, actor(viewer), at);
    if (!check.ok) return { ok: false, error: { ...check.error, kind: 'rule' } };
    const r = await this.sql.begin((tx) => closeLot(tx, lotId, actor(viewer), true, at));
    if (!r.ok) return { ok: false, error: { kind: 'rule', code: r.code ?? 'not_live', what: 'This auction is no longer live, so it cannot be closed.', next: 'Only live auctions can be closed.' } };
    return { ok: true, data: { status: r.status ?? 'closed_unsold', transactionId: r.transaction_id ?? null } };
  };

  buyerDashboard: Service['buyerDashboard'] = (viewer) => this.read((s, at) => (viewer.id ? buyerDashboard(s, viewer.id, at) : null));
  transactionSummary: Service['transactionSummary'] = (id, viewer) => this.read((s) => transactionSummary(s, id, viewer));
  transactionDetail: Service['transactionDetail'] = (id, viewer) => this.read((s, at) => transactionDetail(s, id, viewer, at));
  txAction: Service['txAction'] = (id, action, viewer, media = []) => this.write((s, at) => runTxAction(s, id, action, actor(viewer), at, media));
  submitClaim: Service['submitClaim'] = (txId, input, viewer, media) => this.write((s, at) => submitClaim(s, txId, input, actor(viewer), at, media));
  respondClaim: Service['respondClaim'] = (claimId, response, viewer, media) => this.write((s, at) => sellerRespond(s, claimId, response, actor(viewer), at, media));
  decideClaim: Service['decideClaim'] = (claimId, decision, viewer) => this.write((s, at) => opsDecide(s, claimId, decision, actor(viewer), at));
  claimReview: Service['claimReview'] = (claimId, viewer) => this.read((s, at) => claimReview(s, claimId, viewer, at));
  opsOverview: Service['opsOverview'] = (viewer) => this.read((s, at) => (viewer.role === 'ops' ? opsOverview(s, at) : null));

  sellerDashboard: Service['sellerDashboard'] = (viewer) => this.read((s, at) => (viewer.id && viewer.role === 'seller' ? sellerDashboard(s, viewer.id, at) : null));
  sellerLot: Service['sellerLot'] = (lotId, viewer) => this.read((s, at) => (viewer.id ? sellerLot(s, lotId, viewer.id, at) : null));
  saveDraft: Service['saveDraft'] = (lotId, draft, viewer) => this.write((s, at) => saveDraft(s, { lotId, draft }, actor(viewer), at));
  publishLot: Service['publishLot'] = (lotId, viewer) => this.write((s, at) => publishLot(s, lotId, actor(viewer), at));
  deleteDraft: Service['deleteDraft'] = (lotId, viewer) => this.write((s, at) => deleteDraft(s, lotId, actor(viewer), at));
  registerBuyer: Service['registerBuyer'] = (input) => this.write((s, at) => registerBuyer(s, input, at));
  registerSeller: Service['registerSeller'] = (input) => this.write((s, at) => registerSeller(s, input, at));

  me: Service['me'] = (viewer) => (viewer.id ? this.getUser(viewer.id) : Promise.resolve({ ok: true as const, data: null }));

  accountView: Service['accountView'] = (viewer) => this.read((s) => (viewer.id ? accountView(s, viewer.id) : null));
  saveEligibility: Service['saveEligibility'] = (input, viewer) => this.write((s, at) => saveEligibility(s, input, actor(viewer), at));
  submitEligibility: Service['submitEligibility'] = (viewer) => this.write((s, at) => submitEligibility(s, actor(viewer), at));
  addDocument: Service['addDocument'] = (doc, viewer) =>
    this.write((s, at) => {
      const r = addDocument(s, doc, actor(viewer), at);
      return r.ok ? { ...r, value: docView(r.value) } : r;
    });
  removeDocument: Service['removeDocument'] = (id, viewer) => this.write((s, at) => removeDocument(s, id, actor(viewer), at));
  /** Returns the document's private storage path; the route turns it into a short-lived signed link. */
  documentUrl: Service['documentUrl'] = async (id, viewer) => {
    const s = await this.state();
    if (!canViewDocument(s, id, viewer)) return { ok: false, error: { kind: 'rule', code: 'forbidden', what: 'You can’t open this document.', next: 'Only its owner, a reviewer, or the seller a receipt was sent to can open it.' } };
    return { ok: true, data: { url: s.documents.find((d) => d.id === id)?.path || null } };
  };
  eligibilityQueue: Service['eligibilityQueue'] = (viewer) => this.read((s) => (viewer.role === 'ops' ? eligibilityQueue(s, viewer.id) : null));
  eligibilityReview: Service['eligibilityReview'] = (companyId, viewer) => this.read((s) => (viewer.role === 'ops' ? eligibilityReview(s, companyId, viewer.id) : null));
  reviewEligibility: Service['reviewEligibility'] = (companyId, decision, viewer) => this.write((s, at) => reviewEligibility(s, companyId, decision, actor(viewer), at));

  getUser: Service['getUser'] = async (id) => {
    const s = await this.state();
    const user = s.users.find((x) => x.id === id) ?? null;
    return { ok: true, data: user ? { user, company: s.companies.find((c) => c.id === user.companyId) ?? null } : null };
  };
  emailExists: Service['emailExists'] = async (email) => {
    const [r] = await this.sql`select exists(select 1 from profiles where lower(email) = lower(${email.trim()})) as e`;
    return { ok: true, data: Boolean(r?.e) };
  };
  notifications: Service['notifications'] = async (viewer) => {
    const rows = await this.sql`select * from notifications where user_id = ${viewer.id ?? ''} order by at desc, id desc`;
    return {
      ok: true,
      data: rows.map((n) => ({ id: String(n.id), userId: String(n.user_id), kind: n.kind, title: String(n.title), body: String(n.body), href: String(n.href), read: Boolean(n.read), at: (n.at as Date).toISOString() })),
    };
  };
  markNotificationsRead: Service['markNotificationsRead'] = async (viewer) => {
    await withWrite(this.sql, (_tx, s) => ({ state: viewer.id ? markNotificationsRead(s, viewer.id) : s, result: null }));
    return { ok: true, data: null };
  };

  reset: Service['reset'] = async () => {
    await reseed(this.sql);
    return { ok: true, data: null };
  };

  /** Role check for the presenter session header: the user must exist with that role. */
  async verifySession(role: string, userId: string): Promise<boolean> {
    const [u] = await this.sql`select role from profiles where id = ${userId}`;
    return !!u && u.role === role;
  }

  /** The profile a verified Supabase Auth user owns — the only source of their id and role. */
  team: Service['team'] = (viewer) => this.read((s) => (viewer.role === 'ops' && viewer.id ? teamView(s, viewer.id) : null));
  appointReviewer: Service['appointReviewer'] = async (input, viewer, opts) => {
    if (!opts?.dryRun) return this.write((s, at) => appointReviewer(s, input, actor(viewer), at));
    const r = await this.read((s, at) => appointReviewer(s, input, actor(viewer), at));
    if (!r.ok) return r;
    return r.data.ok ? { ok: true, data: r.data.value } : { ok: false, error: { ...r.data.error, kind: 'rule' } };
  };
  setReviewerRegions: Service['setReviewerRegions'] = (userId, regions, viewer) => this.write((s, at) => setReviewerRegions(s, userId, regions, actor(viewer), at));
  removeReviewer: Service['removeReviewer'] = (userId, viewer) => this.write((s, at) => removeReviewer(s, userId, actor(viewer), at));
  setApplicationState: Service['setApplicationState'] = (companyId, code, viewer) => this.write((s, at) => setApplicationState(s, companyId, code, actor(viewer), at));

  /** The Supabase sign-in for an email, if one exists (to invite only people who haven't set a password). */
  async authUserByEmail(email: string): Promise<{ id: string; confirmed: boolean } | null> {
    const [u] = await this.sql`select id, email_confirmed_at from auth.users where lower(email) = ${email.trim().toLowerCase()}`;
    return u ? { id: String(u.id), confirmed: !!u.email_confirmed_at } : null;
  }

  /** Signed-in staff who were removed (D-102) resolve to no profile: no Operations access. */
  async profileForAuthUser(authUserId: string): Promise<{ id: string; role: 'buyer' | 'seller' | 'ops' } | null> {
    const [u] = await this.sql`select id, role from profiles where auth_user_id = ${authUserId} and staff_level is distinct from 'removed'`;
    return u ? { id: String(u.id), role: u.role as 'buyer' | 'seller' | 'ops' } : null;
  }
}
