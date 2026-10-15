/**
 * Contract tests (PHASES 2.7): one suite, run against every DataSource implementation, must give
 * identical outcomes. Targets:
 *   local       — LocalDataSource over an in-memory store (the reference; what demo mode runs)
 *   http+memory — HttpDataSource → API → in-memory service (checks the HTTP layer)
 *   http+pg     — HttpDataSource → API → Postgres (place_bid / close_auction, row diffs)
 * The Postgres target needs a database (local: `supabase start`); without one it is skipped and says so.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, HttpDataSource, LocalDataSource, type DataSource, type DsResult } from '@auctionit/client';
import type { Viewer } from '@auctionit/domain';
import { createApp } from './app';
import { createSql, type Sql } from './db/client';
import { loadEnv } from './env';
import { DbService } from './services/DbService';
import { MemoryService } from './services/MemoryService';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const RAHUL: Viewer = { id: 'U-RAHUL', role: 'buyer' };
const ANITA: Viewer = { id: 'U-ANITA', role: 'buyer' };
const SURESH: Viewer = { id: 'U-SURESH', role: 'seller' };
const OPS: Viewer = { id: 'U-DEVENDRA', role: 'ops' };
const IMRAN: Viewer = { id: 'U-IMRAN', role: 'seller' };
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

interface Target {
  ds: DataSource;
  /** Move a live auction's end time into the past (as if time passed). */
  expire(lotId: string): Promise<void>;
  /** Test back door: make a user the seller of a lot (to reach the own-lot rule no real role can). */
  setSeller(lotId: string, userId: string): Promise<void>;
  /** Test back door: mark a user's company approved (the review itself has its own test). */
  approve(userId: string): Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);
const pay = (amount: number, reference = 'UTR000123456') => ({ amount, method: 'neft' as const, paidOn: today(), reference, payerName: 'Test payer', receiptDocumentId: null });
const file = (name: string, type = 'application/pdf') => new File([PNG], name, { type });

function must<T>(r: DsResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.what}`);
  return r.data;
}
const code = (r: DsResult<unknown>) => (r.ok ? 'ok' : r.error.code);

async function listen(app: ReturnType<typeof createApp>): Promise<{ url: string; server: Server }> {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

async function dbAvailable(): Promise<boolean> {
  const sql = createSql(DB_URL, 1);
  try {
    await sql`select 1 from lots limit 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const env = loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000', DEMO_CONTROLS_ENABLED: 'true' });
const servers: Server[] = [];
let pgSql: Sql | null = null;
const hasDb = await dbAvailable();

const targets: [string, () => Promise<Target>][] = [
  [
    'local',
    async () => {
      const store = createMemoryStore();
      return {
        ds: new LocalDataSource(store),
        expire: async (lotId) =>
          store.mutate((s) => {
            const lot = s.lots.find((l) => l.id === lotId)!;
            lot.endAt = new Date(Date.now() - 60_000).toISOString();
          }),
        setSeller: async (lotId, userId) =>
          store.mutate((s) => {
            s.lots.find((l) => l.id === lotId)!.sellerId = userId;
          }),
        approve: async (userId) =>
          store.mutate((s) => {
            const c = s.companies.find((x) => x.id === s.users.find((u) => u.id === userId)?.companyId);
            if (c) c.verification = 'approved';
          }),
      };
    },
  ],
  [
    'http+memory',
    async () => {
      const svc = new MemoryService();
      const { url, server } = await listen(createApp(env, svc));
      servers.push(server);
      const mem = (svc as unknown as { mem: ReturnType<typeof createMemoryStore> }).mem;
      return {
        ds: new HttpDataSource({ baseUrl: url }),
        expire: async (lotId) =>
          mem.mutate((s) => {
            s.lots.find((l) => l.id === lotId)!.endAt = new Date(Date.now() - 60_000).toISOString();
          }),
        setSeller: async (lotId, userId) =>
          mem.mutate((s) => {
            s.lots.find((l) => l.id === lotId)!.sellerId = userId;
          }),
        approve: async (userId) =>
          mem.mutate((s) => {
            const c = s.companies.find((x) => x.id === s.users.find((u) => u.id === userId)?.companyId);
            if (c) c.verification = 'approved';
          }),
      };
    },
  ],
];
if (hasDb) {
  targets.push([
    'http+pg',
    async () => {
      pgSql = createSql(DB_URL, 10);
      const { url, server } = await listen(createApp(env, new DbService(pgSql)));
      servers.push(server);
      return {
        ds: new HttpDataSource({ baseUrl: url }),
        expire: async (lotId) => {
          await pgSql!`update lots set end_at = now() - interval '1 minute' where id = ${lotId}`;
        },
        setSeller: async (lotId, userId) => {
          await pgSql!`update lots set seller_id = ${userId} where id = ${lotId}`;
        },
        approve: async (userId) => {
          await pgSql!`update companies set verification = 'approved' where id = (select company_id from profiles where id = ${userId})`;
        },
      };
    },
  ]);
} else {
  console.warn(`[contract] Postgres not reachable at ${DB_URL} — the http+pg target is skipped. Run \`supabase start\` to include it.`);
}

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await pgSql?.end({ timeout: 2 });
});

describe.each(targets)('DataSource contract — %s', (_name, make) => {
  let t: Target;
  beforeAll(async () => {
    t = await make();
  });
  beforeEach(async () => {
    must(await t.ds.reset());
  });

  /** The buyer reports the EMD and the lot's seller confirms it. */
  async function confirmedEmd(lotId: string, v: Viewer) {
    const lot = must(await t.ds.getLot(lotId, v))!;
    const e = must(await t.ds.submitEmd(lotId, pay(lot.lot.emdAmount), v));
    must(await t.ds.decideEmd(e.id, { decision: 'confirmed', reason: '' }, { id: lot.lot.sellerId, role: 'seller' }));
  }

  it('catalogue and lot detail match the seed', async () => {
    const list = must(await t.ds.listLots({}));
    expect(list.items.map((i) => i.id)).toEqual(['LOT-2025-0894', 'LOT-2025-0891', 'LOT-2025-0899', 'LOT-2025-0910', 'LOT-2025-0905']);
    expect(must(await t.ds.listLots({ assured: true, statuses: ['live'] })).items.map((i) => i.id)).toEqual(['LOT-2025-0891']);
    const d = must(await t.ds.getLot('LOT-2025-0891', RAHUL))!;
    expect(d).toMatchObject({ highestBidPerMt: 34_500, minNextBidPerMt: 35_000, bidCount: 5, viewer: { emdPaid: false, bidStatus: 'none' } });
    expect(d.bids.map((b) => b.label)).toEqual(['Bidder 2', 'Bidder 1', 'Bidder 3', 'Bidder 2', 'Bidder 1']);
    expect(must(await t.ds.getLot('LOT-NOPE', RAHUL))).toBeNull();
    expect(must(await t.ds.getLot('LOT-2025-0920', RAHUL))).toBeNull(); // drafts are private
  });

  it('every bid rejection has the same code and words', async () => {
    const bid = (lotId: string, amount: unknown, seen: number | null, req = `r-${Math.random()}`, v = RAHUL) =>
      t.ds.placeBid({ lotId, amountPerMt: amount as number, clientRequestId: req, seenHighestPerMt: seen }, v);
    const noEmd = await bid('LOT-2025-0891', 35_000, 34_500);
    expect(noEmd.ok ? null : noEmd.error).toMatchObject({ code: 'emd_required', what: 'An EMD of ₹1,00,000, confirmed by the seller, is needed before you can bid on this lot.' });

    // Reported but not yet confirmed by the seller: still no bidding (domain and place_bid agree).
    const reported = must(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), RAHUL));
    expect(code(await bid('LOT-2025-0891', 35_000, 34_500))).toBe('emd_required');
    expect(code(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), RAHUL))).toBe('already_submitted');
    must(await t.ds.decideEmd(reported.id, { decision: 'confirmed', reason: '' }, SURESH));
    expect(code(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), RAHUL))).toBe('already_paid');

    const low = await bid('LOT-2025-0891', 34_900, 34_500);
    expect(low.ok ? null : low.error).toMatchObject({ code: 'below_minimum', what: 'Your bid is below the minimum of ₹35,000/MT.' });
    const stale = await bid('LOT-2025-0891', 34_900, 34_000);
    expect(stale.ok ? null : stale.error).toMatchObject({ code: 'outbid', next: 'Your bid was not placed. The new minimum is ₹35,000/MT.' });
    expect(code(await bid('LOT-2025-0891', 35_000.5, 34_500))).toBe('invalid_amount');
    expect(code(await bid('LOT-2025-0891', 'lots', 34_500))).toBe('invalid_amount');
    expect(code(await bid('LOT-2025-0910', 80_000, null))).toBe('auction_not_started');
    expect(code(await bid('LOT-2025-0866', 50_000, null))).toBe('auction_closed');
    expect(code(await bid('LOT-NOPE', 1, null))).toBe('not_found');

    must(await bid('LOT-2025-0891', 35_000, 34_500, 'same-request'));
    const dup = await bid('LOT-2025-0891', 35_500, 35_000, 'same-request');
    expect(code(dup)).toBe('duplicate');
  });

  it('a valid bid leads, and the previous leader is told they were outbid', async () => {
    await confirmedEmd('LOT-2025-0891', RAHUL);
    expect(must(await t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'a', seenHighestPerMt: 34_500 }, RAHUL))).toEqual({ amountPerMt: 35_000, minNext: 35_500 });
    expect(must(await t.ds.getLot('LOT-2025-0891', RAHUL))!.viewer).toMatchObject({ bidStatus: 'leading', emdPaid: true, myHighestPerMt: 35_000 });
    const notes = must(await t.ds.notifications(ANITA));
    expect(notes[0]).toMatchObject({ kind: 'outbid', title: 'You were outbid on LOT-2025-0891', body: 'Current highest bid is ₹35,000/MT.' });
  });

  it('20 buyers bidding at once: one consistent order, every accepted bid above the last, no duplicates', async () => {
    const buyers: Viewer[] = [];
    for (let i = 0; i < 20; i++) {
      const reg = must(
        await t.ds.registerBuyer({ name: `Bidder ${i}`, email: `b${i}@race.example`, phone: `90000 000${String(i).padStart(2, '0')}`, companyName: `Race ${i}`, businessType: 'Scrap trader / stockist', city: 'Raipur', state: 'Chhattisgarh', industry: 'Scrap', materials: ['Ferrous / HMS'] }),
      );
      const v: Viewer = { id: reg.user.id, role: 'buyer' };
      await t.approve(v.id!);
      await confirmedEmd('LOT-2025-0891', v);
      buyers.push(v);
    }
    // Everyone saw ₹34,500; amounts step up so several can legitimately succeed depending on order.
    const results = await Promise.all(
      buyers.map((v, i) => t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000 + (i % 7) * 500, clientRequestId: `race-${i}`, seenHighestPerMt: 34_500 }, v)),
    );
    const accepted = results.filter((r) => r.ok);
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    for (const r of results) if (!r.ok) expect(['outbid', 'below_minimum']).toContain(r.error.code);

    const d = must(await t.ds.getLot('LOT-2025-0891', OPS))!;
    expect(d.bidCount).toBe(5 + accepted.length);
    const chrono = [...d.bids].reverse(); // oldest first
    for (let i = 1; i < chrono.length; i++) {
      expect(chrono[i]!.amountPerMt).toBeGreaterThanOrEqual(chrono[i - 1]!.amountPerMt + 500);
    }
    expect(d.highestBidPerMt).toBe(Math.max(...accepted.map((r) => (r.ok ? r.data.amountPerMt : 0))));
    expect(new Set(d.bids.map((b) => b.id)).size).toBe(d.bids.length);
  });

  it('the same request sent five times at once places one bid', async () => {
    await confirmedEmd('LOT-2025-0891', RAHUL);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'retry-storm', seenHighestPerMt: 34_500 }, RAHUL)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map(code)).toEqual(Array(4).fill('duplicate'));
    expect(must(await t.ds.getLot('LOT-2025-0891', RAHUL))!.bidCount).toBe(6);
  });

  it('an auction past its end time is closed on the next read, with the winner from stored bids', async () => {
    await t.expire('LOT-2025-0899');
    const d = must(await t.ds.getLot('LOT-2025-0899', RAHUL))!;
    expect(d.status).toBe('awarded');
    expect(d.result).toEqual({ outcome: 'sold', winningBidPerMt: 6_10_000, wonByViewer: true });
    const tx = must(await t.ds.transactionSummary(d.viewer.transactionId!, RAHUL))!;
    expect(tx).toMatchObject({ status: 'won_awaiting_balance', pricePerMt: 6_10_000, counterparty: 'National Smelters' });
    expect(must(await t.ds.notifications(ANITA)).some((n) => n.kind === 'auction_lost' && n.title === 'LOT-2025-0899 closed')).toBe(true);
    // Closing again is impossible; nobody else can close it either.
    expect(code(await t.ds.closeDemoAuction('LOT-2025-0899', OPS))).toBe('not_live');
  });

  it('only Operations can close a demo auction; an unsold close creates no transaction', async () => {
    expect(code(await t.ds.closeDemoAuction('LOT-2025-0891', RAHUL))).toBe('forbidden');
    expect(code(await t.ds.closeDemoAuction('LOT-2025-0910', OPS))).toBe('not_live');
    const r = must(await t.ds.closeDemoAuction('LOT-2025-0891', OPS));
    expect(r.status).toBe('awarded');
    expect(must(await t.ds.transactionSummary(r.transactionId!, ANITA))).toMatchObject({ pricePerMt: 34_500, statusLabel: 'Won — awaiting balance payment' });
  });

  it('post-win flow and claims: same transitions, numbers and refusals', async () => {
    const tx = 'TX-1045'; // Rahul ↔ Shree Balaji, lifting proposed
    expect(code(await t.ds.txAction(tx, { type: 'confirm_lifting' }, RAHUL))).toBe('forbidden');
    must(await t.ds.txAction(tx, { type: 'confirm_lifting' }, SURESH));
    const ticket = must(await t.ds.uploadMedia(new File([PNG], 'ticket.png', { type: 'image/png' }), 'lifting', RAHUL));
    const photo = must(await t.ds.uploadMedia(new File([PNG], 'pile.png', { type: 'image/png' }), 'lifting', RAHUL));
    expect(code(await t.ds.uploadMedia(new File([PNG], 'x.gif', { type: 'image/gif' }), 'lifting', RAHUL))).toBe('invalid_file');
    must(
      await t.ds.txAction(
        tx,
        { type: 'record_weighbridge', ticketRef: 'WB-9', weighbridge: 'Raipur Gate #2', grossMt: 50, tareMt: 15.5, measuredMt: 34.5, ticketMediaId: ticket.id },
        RAHUL,
        [ticket],
      ),
    );
    must(await t.ds.txAction(tx, { type: 'record_condition', observedContaminationPct: 15, notes: 'Debris', photoMediaIds: [photo.id] }, RAHUL, [photo]));
    const detail = must(await t.ds.transactionDetail(tx, RAHUL))!;
    expect(detail).toMatchObject({ statusLabel: 'Material checked', contamination: { within: false, limit: 10, excess: 5 } });
    expect(detail.reconciliation).toEqual({ payable: 10_17_750, adjustment: 0, paid: 10_32_500, difference: -14_750 });

    const claim = must(
      await t.ds.submitClaim(tx, { type: 'contamination', observedValue: 15, mediaIds: [ticket.id, photo.id], expected: 'Up to 6%', observed: '15% debris', explanation: 'Debris below the top.', requestedRemedy: 'price_adjustment' }, RAHUL, []),
    );
    expect(code(await t.ds.decideClaim(claim.id, { outcome: 'reject', reason: 'Too early for Operations.' }, OPS))).toBe('invalid_state');
    must(await t.ds.respondClaim(claim.id, { decision: 'dispute', explanation: 'Mixed in at loading.' }, SURESH, []));
    expect(code(await t.ds.decideClaim(claim.id, { outcome: 'approve_adjustment', reason: 'short' }, OPS))).toBe('reason_required');
    const decided = must(await t.ds.decideClaim(claim.id, { outcome: 'approve_adjustment', reason: 'Photos show debris throughout the lower layers.' }, OPS));
    expect(decided.opsDecision).toMatchObject({ outcome: 'approve_adjustment', amount: 50_888, decidedBy: 'U-DEVENDRA' });
    const after = must(await t.ds.transactionDetail(tx, SURESH))!;
    expect(after.tx).toMatchObject({ status: 'resolved', resolution: 'price_adjustment', finalPayable: 10_17_750 - 50_888 });
    expect(after.timeline.map((e) => e.label)).toEqual(expect.arrayContaining(['Seller disputed the claim', 'Operations approved a price adjustment']));
    expect(must(await t.ds.transactionDetail(tx, ANITA))).toBeNull();
  });

  it('seller drafts, refusals and publishing', async () => {
    const draft = must(await t.ds.saveDraft(null, { title: 'MS plate cuttings yard lot', category: 'ferrous_hms' }, SURESH));
    expect(draft).toMatchObject({ status: 'draft', id: expect.stringMatching(/^LOT-20\d\d$/) });
    expect(code(await t.ds.publishLot(draft.id, SURESH))).toBe('cannot_publish');
    const start = new Date(Date.now() + 3_600_000).toISOString();
    const end = new Date(Date.now() + 30 * 3_600_000).toISOString();
    must(
      await t.ds.saveDraft(
        draft.id,
        { title: 'MS plate cuttings yard lot', category: 'ferrous_hms', grade: 'MS plate', description: 'Offcuts.', yard: 'Yard 4', city: 'Raipur', state: 'Chhattisgarh', estimatedQtyMt: 18, contaminationPct: 2, attributes: { form: 'Offcuts', thickness: '8 mm' }, reservePerMt: 33_000, startAt: start, endAt: end },
        SURESH,
      ),
    );
    const pub = must(await t.ds.publishLot(draft.id, SURESH));
    expect(pub).toMatchObject({ status: 'scheduled', emdAmount: 50_000 });
    expect(must(await t.ds.listLots({ statuses: ['upcoming'] })).items.map((i) => i.id)).toContain(draft.id);
    expect(code(await t.ds.publishLot(draft.id, SURESH))).toBe('already_published');
    expect(code(await t.ds.saveDraft('LOT-2025-0891', { title: 'x' }, SURESH))).toBe('not_editable');
    expect(must(await t.ds.sellerDashboard(SURESH))!.tabs).toMatchObject({ scheduled: 2 });
  });

  it('dashboards and Operations views agree', async () => {
    expect(must(await t.ds.buyerDashboard(RAHUL))!.stats).toMatchObject({ activeBids: 2, leading: 1, outbid: 1, wonNextStep: 1, inProgress: 2, completed: 1 });
    expect(must(await t.ds.opsOverview(OPS))!.stats).toMatchObject({ live: 3, awaitingAction: 4, openClaims: 1, completed: 9 });
    expect(must(await t.ds.claimReview('CLM-1042-01', OPS))!.outcomes).toEqual({ approve_adjustment: 83_376, approve_exit: 14_40_000, reject: 13_89_600 });
    expect(must(await t.ds.emailExists('Rahul.Sharma@vardhan.example'))).toBe(true);
    expect(code(await t.ds.registerBuyer({ name: 'X', email: 'rahul.sharma@vardhan.example', phone: '90000 11111', companyName: 'X', businessType: 'X', city: 'X', state: 'X', industry: 'X', materials: ['X'] }))).toBe('duplicate_account');
  });
  it('a real registration is stored as real, not sample data; seeded companies stay sample', async () => {
    const r = must(await t.ds.registerBuyer({ name: 'Asha Menon', email: 'asha@newco.example', phone: '98765 43210', companyName: 'NewCo Metals', businessType: 'Scrap trader / stockist', city: 'Nagpur', state: 'Maharashtra', industry: 'Steel', materials: ['Ferrous / HMS'] }));
    expect(r.company.sample).toBe(false);
    // Read back through the store (Postgres on the pg target) — not just the write's echo.
    expect(must(await t.ds.buyerDashboard({ id: r.user.id, role: 'buyer' }))!.buyer.sample).toBe(false);
    expect(must(await t.ds.buyerDashboard(RAHUL))!.buyer.sample).toBe(true);
  });
  it('a seller can never bid on their own lot (domain and place_bid agree)', async () => {
    await t.setSeller('LOT-2025-0891', 'U-RAHUL');
    expect(code(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), RAHUL))).toBe('own_lot');
    const r = await t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'own', seenHighestPerMt: 34_500 }, RAHUL);
    expect(r.ok ? null : r.error).toMatchObject({ code: 'own_lot', what: 'Sellers cannot bid on their own lots.' });
  });

  it('listings publish only when complete and valid, with the specific reason', async () => {
    const base = { title: 'Plate offcuts for test', category: 'ferrous_hms' as const, grade: 'MS', description: 'Offcuts.', yard: 'Y', city: 'Raipur', state: 'Chhattisgarh', estimatedQtyMt: 10, contaminationPct: 2, attributes: { form: 'Offcuts', thickness: '8 mm' } };
    const start = new Date(Date.now() + 3_600_000).toISOString();
    const why = async (patch: object) => {
      const d = must(await t.ds.saveDraft(null, { ...base, ...patch }, SURESH));
      const r = await t.ds.publishLot(d.id, SURESH);
      return r.ok ? 'published' : r.error.what;
    };
    expect(await why({ reservePerMt: 0, startAt: start, endAt: start })).toMatch(/reserve price per MT greater than ₹0.*closing time must be after the opening time/);
    expect(await why({ reservePerMt: 30_000, startAt: start, endAt: new Date(Date.now() + 9e6).toISOString(), assuranceEnabled: true })).toMatch(/at least 6 photos and 1 video.*agree to the Lot Assurance terms/);
    expect(await why({ reservePerMt: 30_000, startAt: new Date(Date.now() - 7_200_000).toISOString(), endAt: start })).toMatch(/start time is in the past/);
    const std = must(await t.ds.saveDraft(null, { ...base, category: 'non_ferrous', attributes: { alloy: 'Cu', form: 'Wire' }, assuranceEnabled: true, assuranceAgreed: true }, SURESH));
    expect(std.assurance.enabled).toBe(false); // standard categories never carry assurance
  });

  it('sellers cannot touch another seller’s lot', async () => {
    expect(code(await t.ds.saveDraft('LOT-2025-0920', { title: 'Hijacked title here' }, IMRAN))).toBe('not_owner');
    expect(code(await t.ds.publishLot('LOT-2025-0920', IMRAN))).toBe('forbidden');
    expect(code(await t.ds.deleteDraft('LOT-2025-0920', IMRAN))).toBe('not_found');
    expect(must(await t.ds.sellerLot('LOT-2025-0920', IMRAN))).toBeNull();
    expect(must(await t.ds.getLot('LOT-2025-0920', IMRAN))).toBeNull();
  });

  it('won is not completed: steps run in order, by the right party, with reasons', async () => {
    expect(code(await t.ds.txAction('TX-1038', { type: 'complete' }, RAHUL))).toBe('invalid_state');
    expect(code(await t.ds.txAction('TX-1038', { type: 'propose_lifting', at: new Date(Date.now() + 864e5).toISOString(), vehicle: 'X' }, RAHUL))).toBe('invalid_state');
    const balance = must(await t.ds.transactionDetail('TX-1038', RAHUL))!.balanceDue;
    expect(code(await t.ds.txAction('TX-1038', { type: 'submit_balance_payment', payment: pay(balance) }, SURESH))).toBe('forbidden');
    expect(code(await t.ds.txAction('TX-1038', { type: 'mark_defaulted', reason: 'Not yet due at all.' }, OPS))).toBe('deadline_not_passed');
    must(await t.ds.txAction('TX-1038', { type: 'submit_balance_payment', payment: pay(balance) }, RAHUL));
    expect(code(await t.ds.txAction('TX-1038', { type: 'propose_lifting', at: new Date(Date.now() + 864e5).toISOString(), vehicle: 'X' }, RAHUL))).toBe('invalid_state');
    must(await t.ds.txAction('TX-1038', { type: 'confirm_balance_payment' }, SURESH));
    must(await t.ds.txAction('TX-1038', { type: 'propose_lifting', at: new Date(Date.now() + 864e5).toISOString(), vehicle: 'CG 04 AB 1234' }, RAHUL));
    expect(code(await t.ds.txAction('TX-1038', { type: 'confirm_lifting' }, RAHUL))).toBe('forbidden');
    must(await t.ds.txAction('TX-1038', { type: 'confirm_lifting' }, SURESH));
    const incomplete = await t.ds.txAction('TX-1038', { type: 'record_weighbridge', ticketRef: '', weighbridge: 'Gate 2', grossMt: null, tareMt: null, measuredMt: 29, ticketMediaId: null }, RAHUL);
    expect(incomplete.ok ? null : incomplete.error).toMatchObject({ code: 'incomplete_measurement', what: 'The measurement is missing: ticket reference, ticket photo or scan.' });
    expect(code(await t.ds.txAction('TX-1035', { type: 'mark_defaulted', reason: 'Overdue payment.' }, RAHUL))).toBe('forbidden');
    expect(must(await t.ds.txAction('TX-1035', { type: 'mark_defaulted', reason: 'Balance not paid within 72 hours.' }, OPS)).status).toBe('defaulted');
  });

  it('claims are refused with every specific reason', async () => {
    const input = { type: 'contamination' as const, observedValue: 15, mediaIds: [] as string[], expected: 'Up to 6%', observed: '15%', explanation: 'Found debris.', requestedRemedy: 'price_adjustment' as const };
    const why = async (tx: string, v: Viewer, patch: object = {}) => {
      const r = await t.ds.submitClaim(tx, { ...input, ...patch }, v, []);
      return r.ok ? 'opened' : `${r.error.code}: ${r.error.what}`;
    };
    expect(await why('TX-1038', RAHUL)).toMatch(/not_eligible: .*Lifting has not started yet/);
    expect(await why('TX-1031', ANITA)).toMatch(/standard lot without Lot Assurance.*already closed.*Loading is already complete/);
    // TX-1045 through lifting checks (mixed steel: limit 10%).
    must(await t.ds.txAction('TX-1045', { type: 'confirm_lifting' }, SURESH));
    const tkt = must(await t.ds.uploadMedia(new File([PNG], 't.png', { type: 'image/png' }), 'lifting', RAHUL));
    must(await t.ds.txAction('TX-1045', { type: 'record_weighbridge', ticketRef: 'WB-1', weighbridge: 'Gate', grossMt: null, tareMt: null, measuredMt: 35, ticketMediaId: tkt.id }, RAHUL, [tkt]));
    must(await t.ds.txAction('TX-1045', { type: 'record_condition', observedContaminationPct: 12, notes: '', photoMediaIds: [tkt.id] }, RAHUL, []));
    expect(await why('TX-1045', RAHUL, { observedValue: 5, mediaIds: [tkt.id, tkt.id + 'x'] })).toMatch(/5.0% is within the agreed limit of 10.0%/);
    expect(await why('TX-1045', RAHUL, { mediaIds: [tkt.id] })).toMatch(/You attached 1 file; at least 2 are needed/);
    expect(await why('TX-1045', SURESH)).toMatch(/^forbidden/);
    must(await t.ds.txAction('TX-1045', { type: 'complete' }, RAHUL));
    expect(await why('TX-1045', RAHUL, { mediaIds: ['a', 'b'] })).toMatch(/Loading is already complete, so the claim window has closed/);
  });

  it('a session whose user no longer exists is refused the same way', async () => {
    const ghost: Viewer = { id: 'U-GHOST', role: 'buyer' };
    for (const r of [await t.ds.buyerDashboard(ghost), await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), ghost), await t.ds.notifications(ghost)]) {
      expect(r.ok ? null : r.error).toMatchObject({ code: 'invalid_session', what: 'Your session isn’t valid any more.' });
    }
    // A real user with the wrong role is refused too.
    expect(code(await t.ds.buyerDashboard({ id: 'U-SURESH', role: 'buyer' }))).toBe('invalid_session');
  });

  it('demo reset restores the seed with fresh relative times', async () => {
    await confirmedEmd('LOT-2025-0891', RAHUL);
    must(await t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'pre-reset', seenHighestPerMt: 34_500 }, RAHUL));
    must(await t.ds.reset());
    const d = must(await t.ds.getLot('LOT-2025-0891', RAHUL))!;
    expect(d.bidCount).toBe(5);
    expect(d.viewer.emdPaid).toBe(false);
    expect(Date.parse(d.lot.endAt) - Date.now()).toBeGreaterThan(2.9 * 3_600_000);
    expect(Date.parse(d.lot.endAt) - Date.now()).toBeLessThan(3.1 * 3_600_000);
  });

  it('EMD paid offline: reported, rejected with a reason, corrected, confirmed — the same record for both parties', async () => {
    const first = must(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000, 'UTR-WRONG-1'), RAHUL));
    expect(first).toMatchObject({ status: 'submitted', mode: 'manual', payment: { reference: 'UTR-WRONG-1', method: 'neft' } });
    expect(must(await t.ds.sellerDashboard(SURESH))!.emdsToConfirm.map((e) => e.id)).toEqual([first.id]);
    expect(code(await t.ds.decideEmd(first.id, { decision: 'confirmed', reason: '' }, IMRAN))).toBe('forbidden');
    expect(code(await t.ds.decideEmd(first.id, { decision: 'rejected', reason: '' }, SURESH))).toBe('reason_required');
    must(await t.ds.decideEmd(first.id, { decision: 'rejected', reason: 'No credit with this UTR' }, SURESH));
    expect(must(await t.ds.getLot('LOT-2025-0891', RAHUL))!.viewer.emd).toMatchObject({ status: 'rejected', decision: { reason: 'No credit with this UTR', decidedBy: 'U-SURESH' } });
    const again = must(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000, 'UTR-RIGHT-2'), RAHUL));
    expect(again.id).toBe(first.id);
    must(await t.ds.decideEmd(first.id, { decision: 'confirmed', reason: '' }, SURESH));
    const forSeller = must(await t.ds.sellerLot('LOT-2025-0891', SURESH))!.emds.find((e) => e.id === first.id)!;
    const forBuyer = must(await t.ds.getLot('LOT-2025-0891', RAHUL))!.viewer.emd!;
    expect(forBuyer).toEqual(forSeller);
    expect(forBuyer.history.map((h) => h.type)).toEqual(['submitted', 'decided', 'submitted', 'decided']);
    expect(must(await t.ds.getLot('LOT-2025-0891', RAHUL))!.viewer.emdPaid).toBe(true);
    expect(must(await t.ds.notifications(RAHUL))[0]).toMatchObject({ kind: 'emd_confirmed' });
    const bad = await t.ds.submitEmd('LOT-2025-0910', { ...pay(1), paidOn: '2099-01-01' }, RAHUL);
    expect(code(bad)).toBe('amount_mismatch');
  });

  it('losing EMDs are owed back at close and the seller records each refund', async () => {
    await confirmedEmd('LOT-2025-0891', RAHUL);
    must(await t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'win', seenHighestPerMt: 34_500 }, RAHUL));
    must(await t.ds.closeDemoAuction('LOT-2025-0891', OPS));
    const due = must(await t.ds.sellerDashboard(SURESH))!.emdRefundsDue.filter((e) => e.lotId === 'LOT-2025-0891');
    expect(due.length).toBeGreaterThan(0);
    expect(due.some((e) => e.buyerId === 'U-RAHUL')).toBe(false);
    const r = must(await t.ds.recordEmdRefund(due[0]!.id, { amount: due[0]!.amount, refundedOn: today(), reference: 'UTR-REFUND-1', note: '' }, SURESH));
    expect(r).toMatchObject({ status: 'refunded', refund: { reference: 'UTR-REFUND-1', recordedBy: 'U-SURESH' } });
    expect(code(await t.ds.recordEmdRefund(due[0]!.id, { amount: due[0]!.amount, refundedOn: today(), reference: 'UTR-REFUND-1', note: '' }, SURESH))).toBe('nothing_due');
  });

  it('balance paid offline: reported, rejected, corrected, confirmed — history on the transaction', async () => {
    const due = must(await t.ds.transactionDetail('TX-1038', RAHUL))!.balanceDue;
    must(await t.ds.txAction('TX-1038', { type: 'submit_balance_payment', payment: pay(due, 'UTR-BAL-1') }, RAHUL));
    expect(code(await t.ds.txAction('TX-1038', { type: 'reject_balance_payment', reason: '' }, SURESH))).toBe('reason_required');
    must(await t.ds.txAction('TX-1038', { type: 'reject_balance_payment', reason: 'Only part received' }, SURESH));
    expect(must(await t.ds.transactionDetail('TX-1038', RAHUL))!).toMatchObject({ statusLabel: 'Won — awaiting balance payment', balancePayment: { decision: { decision: 'rejected', reason: 'Only part received' } } });
    must(await t.ds.txAction('TX-1038', { type: 'submit_balance_payment', payment: pay(due, 'UTR-BAL-2') }, RAHUL));
    expect(must(await t.ds.transactionDetail('TX-1038', SURESH))!.next).toMatchObject({ role: 'seller', action: 'confirm_balance_payment' });
    must(await t.ds.txAction('TX-1038', { type: 'confirm_balance_payment' }, SURESH));
    const d = must(await t.ds.transactionDetail('TX-1038', RAHUL))!;
    expect(d.tx).toMatchObject({ status: 'balance_paid', balancePaid: due });
    expect(d.paymentHistory.map((h) => h.type)).toEqual(['submitted', 'decided', 'submitted', 'decided']);
    expect(d.timeline.map((e) => e.label)).toEqual(expect.arrayContaining(['Buyer reported the balance payment', 'Seller rejected the reported balance payment', 'Seller confirmed receiving the balance']));
  });

  it('an ordinary (non-assured) sale completes without any Lot Assurance step', async () => {
    await t.expire('LOT-2025-0899');
    const txId = must(await t.ds.getLot('LOT-2025-0899', RAHUL))!.viewer.transactionId!;
    let d = must(await t.ds.transactionDetail(txId, RAHUL))!;
    expect(d.assured).toBe(false);
    must(await t.ds.txAction(txId, { type: 'submit_balance_payment', payment: pay(d.balanceDue) }, RAHUL));
    must(await t.ds.txAction(txId, { type: 'confirm_balance_payment' }, IMRAN));
    must(await t.ds.txAction(txId, { type: 'propose_lifting', at: new Date(Date.now() + 864e5).toISOString(), vehicle: 'CG 07 ZZ 1111' }, RAHUL));
    must(await t.ds.txAction(txId, { type: 'confirm_lifting' }, IMRAN));
    const ticket = must(await t.ds.uploadMedia(new File([PNG], 'ticket.png', { type: 'image/png' }), 'lifting', RAHUL));
    must(await t.ds.txAction(txId, { type: 'record_weighbridge', ticketRef: 'WB-77', weighbridge: 'Bhilai Gate 1', grossMt: null, tareMt: null, measuredMt: 7.9, ticketMediaId: ticket.id }, RAHUL, [ticket]));
    d = must(await t.ds.transactionDetail(txId, RAHUL))!;
    expect(d.tx.status).toBe('material_checked');
    expect(must(await t.ds.txAction(txId, { type: 'complete' }, RAHUL)).status).toBe('completed');
  });

  it('eligibility: apply with documents, review, then bid; documents open only for the owner and reviewers', async () => {
    const reg = must(await t.ds.registerBuyer({ name: 'Asha Menon', email: 'asha@newco.example', phone: '98765 43210', companyName: 'NewCo Metals', businessType: 'Scrap trader / stockist', city: 'Nagpur', state: 'Maharashtra', industry: 'Steel', materials: ['Ferrous / HMS'] }));
    const asha: Viewer = { id: reg.user.id, role: 'buyer' };
    expect(must(await t.ds.accountView(asha))).toMatchObject({ status: 'incomplete', eligible: false });
    expect(code(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), asha))).toBe('not_eligible');
    expect(code(await t.ds.submitEligibility(asha))).toBe('incomplete_application');
    must(
      await t.ds.saveEligibility(
        { entityType: 'private_limited', legalName: 'NewCo Metals Private Limited', pan: 'AABCN1234F', gstin: '27AABCN1234F1Z5', registrationNumber: 'U27100MH2010PTC123456', registeredAddress: 'Plot 4, MIDC Hingna, Nagpur 440016', representative: { name: 'Asha Menon', designation: 'Director' }, sellerDeclaration: null, bankDetails: null },
        asha,
      ),
    );
    expect(code(await t.ds.uploadDocument(file('x.gif', 'image/gif'), 'pan_card', asha))).toBe('invalid_file');
    const docs = [];
    for (const kind of ['pan_card', 'constitution', 'address_proof', 'representative_id', 'authorisation_letter'] as const) docs.push(must(await t.ds.uploadDocument(file(`${kind}.pdf`), kind, asha)));
    must(await t.ds.submitEligibility(asha));
    expect(must(await t.ds.eligibilityQueue(OPS))!.waiting.map((r) => r.companyId)).toEqual([reg.company.id]);
    expect(code(await t.ds.reviewEligibility(reg.company.id, { decision: 'approved', reason: '' }, asha))).toBe('forbidden');
    // Owner and reviewer may open a document; another buyer and the seller may not.
    expect(code(await t.ds.documentUrl(docs[0]!.id, asha))).toBe('ok');
    expect(code(await t.ds.documentUrl(docs[0]!.id, OPS))).toBe('ok');
    expect(code(await t.ds.documentUrl(docs[0]!.id, RAHUL))).toBe('forbidden');
    expect(code(await t.ds.documentUrl(docs[0]!.id, SURESH))).toBe('forbidden');
    const review = must(await t.ds.eligibilityReview(reg.company.id, OPS))!;
    expect(review.documents.map((d) => d.kind)).toEqual(['pan_card', 'constitution', 'address_proof', 'representative_id', 'authorisation_letter']);
    must(await t.ds.reviewEligibility(reg.company.id, { decision: 'approved', reason: 'Documents match the PAN and GSTIN.' }, OPS));
    expect(must(await t.ds.accountView(asha))).toMatchObject({ status: 'approved', eligible: true, eligibility: { review: { reviewedBy: 'U-DEVENDRA' } } });
    expect(code(await t.ds.submitEmd('LOT-2025-0891', pay(1_00_000), asha))).toBe('ok');

    // The same PAN can't open a second account as a seller (cross-role), and the refusal names nobody.
    const sel = must(await t.ds.registerSeller({ name: 'Ravi', companyName: 'Other Traders', businessType: 'Scrap trader', yard: 'Yard 1, Nagpur', city: 'Nagpur', state: 'Maharashtra', categories: ['ferrous_hms'], email: 'ravi@other.example', phone: '91234 56780' }));
    const ravi: Viewer = { id: sel.user.id, role: 'seller' };
    must(
      await t.ds.saveEligibility(
        { entityType: 'private_limited', legalName: 'Other Traders Private Limited', pan: 'AABCN1234F', gstin: '27AABCN1234F1Z5', registrationNumber: 'U27100MH2010PTC654321', registeredAddress: 'Yard 1, Wadi, Nagpur 440023', representative: { name: 'Ravi', designation: 'Director' }, sellerDeclaration: { authorisedToSell: true, materialSource: 'Own fabrication offcuts' }, bankDetails: { accountName: 'Other Traders', bankName: 'HDFC Bank', accountNumber: '50100123456789', ifsc: 'HDFC0001234', upiId: '' } },
        ravi,
      ),
    );
    for (const kind of ['pan_card', 'gst_certificate', 'constitution', 'address_proof', 'representative_id', 'authorisation_letter', 'premises_proof', 'cancelled_cheque'] as const) must(await t.ds.uploadDocument(file(`${kind}.pdf`), kind, ravi));
    const dup = await t.ds.submitEligibility(ravi);
    expect(dup.ok ? null : dup.error).toMatchObject({ code: 'duplicate_identity', what: 'These business details are already registered with AuctionIT.' });
    expect(JSON.stringify(dup)).not.toMatch(/NewCo|Asha/);
  });
});
