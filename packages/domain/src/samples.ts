/**
 * The marketplace as real users see it on the live site: seeded sample companies and everything that belongs to
 * them are left out (docs/PHASE1_MVP.md). Nothing is deleted — the API applies this to each snapshot it reads, and
 * row diffs are computed against the same filtered snapshot, so hidden rows are never written or removed.
 */
import type { DemoState } from './seed';

/** Seeded staff account (no company) — sample like the seeded companies. */
const SAMPLE_STAFF_EMAIL = /@auctionit\.example$/;

export function withoutSamples(state: DemoState): DemoState {
  const companies = new Set(state.companies.filter((c) => c.sample).map((c) => c.id));
  if (companies.size === 0) return state;
  const users = new Set(state.users.filter((u) => (u.companyId && companies.has(u.companyId)) || (!u.companyId && SAMPLE_STAFF_EMAIL.test(u.email) && !u.authUserId)).map((u) => u.id));
  const lots = new Set(state.lots.filter((l) => companies.has(l.sellerCompanyId) || users.has(l.sellerId)).map((l) => l.id));
  const txs = new Set(state.transactions.filter((t) => lots.has(t.lotId) || users.has(t.buyerId) || users.has(t.sellerId)).map((t) => t.id));
  const claims = new Set(state.claims.filter((c) => txs.has(c.transactionId)).map((c) => c.id));
  const bids = new Set(state.bids.filter((b) => lots.has(b.lotId) || users.has(b.bidderId)).map((b) => b.id));
  const emds = new Set(state.emds.filter((e) => lots.has(e.lotId) || users.has(e.buyerId)).map((e) => e.id));
  const hidden = new Set([...companies, ...users, ...lots, ...txs, ...claims, ...bids, ...emds]);
  return {
    ...state,
    companies: state.companies.filter((c) => !companies.has(c.id)),
    users: state.users.filter((u) => !users.has(u.id)),
    lots: state.lots.filter((l) => !lots.has(l.id)),
    bids: state.bids.filter((b) => !bids.has(b.id)),
    emds: state.emds.filter((e) => !emds.has(e.id)),
    transactions: state.transactions.filter((t) => !txs.has(t.id)),
    claims: state.claims.filter((c) => !claims.has(c.id)),
    documents: state.documents.filter((d) => !companies.has(d.companyId)),
    notifications: state.notifications.filter((n) => !users.has(n.userId)),
    audit: state.audit.filter((a) => !hidden.has(a.entityId) && !users.has(a.actorId)),
  };
}
