import {
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
  payEmd,
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

/** The DataSource operations the API serves (uploads and change events are HTTP concerns). */
export type Service = Omit<DataSource, 'kind' | 'subscribe' | 'uploadMedia'>;

const actor = (v: Viewer) => ({ id: v.id ?? 'guest', role: v.role });
const now = () => new Date().toISOString();

/**
 * Postgres-backed service. Same packages/domain operations as demo mode, applied to a snapshot and
 * written back as a row diff; bids and auction closes go through the place_bid / close_auction
 * functions for row-locked atomicity.
 */
export class DbService implements Service {
  constructor(private readonly sql: Sql) {}

  private async read<T>(fn: (s: DemoState, at: string) => T): Promise<DsResult<T>> {
    const at = now();
    await closeDueAuctions(this.sql, at);
    return { ok: true, data: fn(await loadState(this.sql), at) };
  }

  private async write<T>(fn: (s: DemoState, at: string) => OpResult<T>): Promise<DsResult<T>> {
    const at = now();
    await closeDueAuctions(this.sql, at);
    const r = await withWrite(this.sql, (_tx, s) => {
      const out = fn(s, at);
      return { state: out.state, result: out };
    });
    return r.ok ? { ok: true, data: r.value } : { ok: false, error: { ...r.error, kind: 'rule' } };
  }

  listLots: Service['listLots'] = (filters) => this.read((s, at) => listLots(s, filters, at));
  getLot: Service['getLot'] = (id, viewer) => this.read((s, at) => lotDetail(s, id, viewer, at));
  payEmd: Service['payEmd'] = (lotId, outcome, viewer) => this.write((s, at) => payEmd(s, { lotId, outcome }, actor(viewer), at));

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
    const check = closeDemoAuction(await loadState(this.sql), lotId, actor(viewer), at);
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

  getUser: Service['getUser'] = async (id) => {
    const s = await loadState(this.sql);
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

  /** Role check for the session header: the user must exist with that role. */
  async verifySession(role: string, userId: string): Promise<boolean> {
    const [u] = await this.sql`select role from profiles where id = ${userId}`;
    return !!u && u.role === role;
  }
}
