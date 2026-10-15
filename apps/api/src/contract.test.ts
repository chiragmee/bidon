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
}

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
    expect(noEmd.ok ? null : noEmd.error).toMatchObject({ code: 'emd_required', what: 'An EMD of ₹1,00,000 is needed before you can bid on this lot.' });

    expect(code(await t.ds.payEmd('LOT-2025-0891', 'failure', RAHUL))).toBe('payment_failed');
    expect(code(await bid('LOT-2025-0891', 35_000, 34_500))).toBe('emd_required');
    must(await t.ds.payEmd('LOT-2025-0891', 'success', RAHUL));
    expect(code(await t.ds.payEmd('LOT-2025-0891', 'success', RAHUL))).toBe('already_paid');

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
    must(await t.ds.payEmd('LOT-2025-0891', 'success', RAHUL));
    expect(must(await t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'a', seenHighestPerMt: 34_500 }, RAHUL))).toEqual({ amountPerMt: 35_000, minNext: 35_500 });
    expect(must(await t.ds.getLot('LOT-2025-0891', RAHUL))!.viewer).toMatchObject({ bidStatus: 'leading', emdPaid: true, myHighestPerMt: 35_000 });
    const notes = must(await t.ds.notifications(ANITA));
    expect(notes[0]).toMatchObject({ kind: 'outbid', title: 'You were outbid on LOT-2025-0891', body: 'Current highest bid is ₹35,000/MT.' });
  });

  it('20 buyers bidding at once: one consistent order, every accepted bid above the last, no duplicates', async () => {
    const buyers: Viewer[] = [];
    for (let i = 0; i < 20; i++) {
      const reg = must(
        await t.ds.registerBuyer({ name: `Bidder ${i}`, email: `b${i}@race.example`, companyName: `Race ${i}`, businessType: 'Scrap trader / stockist', city: 'Raipur', state: 'Chhattisgarh', industry: 'Scrap', materials: ['Ferrous / HMS'] }),
      );
      const v: Viewer = { id: reg.user.id, role: 'buyer' };
      must(await t.ds.payEmd('LOT-2025-0891', 'success', v));
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
    must(await t.ds.payEmd('LOT-2025-0891', 'success', RAHUL));
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
    expect(code(await t.ds.registerBuyer({ name: 'X', email: 'rahul.sharma@vardhan.example', companyName: 'X', businessType: 'X', city: 'X', state: 'X', industry: 'X', materials: ['X'] }))).toBe('duplicate_email');
  });
  it('a seller can never bid on their own lot (domain and place_bid agree)', async () => {
    await t.setSeller('LOT-2025-0891', 'U-RAHUL');
    expect(code(await t.ds.payEmd('LOT-2025-0891', 'success', RAHUL))).toBe('own_lot');
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
    expect(code(await t.ds.txAction('TX-1038', { type: 'pay_balance' }, SURESH))).toBe('forbidden');
    expect(code(await t.ds.txAction('TX-1038', { type: 'mark_defaulted', reason: 'Not yet due at all.' }, OPS))).toBe('deadline_not_passed');
    must(await t.ds.txAction('TX-1038', { type: 'pay_balance' }, RAHUL));
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
    for (const r of [await t.ds.buyerDashboard(ghost), await t.ds.payEmd('LOT-2025-0891', 'success', ghost), await t.ds.notifications(ghost)]) {
      expect(r.ok ? null : r.error).toMatchObject({ code: 'invalid_session', what: 'Your session isn’t valid any more.' });
    }
    // A real user with the wrong role is refused too.
    expect(code(await t.ds.buyerDashboard({ id: 'U-SURESH', role: 'buyer' }))).toBe('invalid_session');
  });

  it('demo reset restores the seed with fresh relative times', async () => {
    must(await t.ds.payEmd('LOT-2025-0891', 'success', RAHUL));
    must(await t.ds.placeBid({ lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'pre-reset', seenHighestPerMt: 34_500 }, RAHUL));
    must(await t.ds.reset());
    const d = must(await t.ds.getLot('LOT-2025-0891', RAHUL))!;
    expect(d.bidCount).toBe(5);
    expect(d.viewer.emdPaid).toBe(false);
    expect(Date.parse(d.lot.endAt) - Date.now()).toBeGreaterThan(2.9 * 3_600_000);
    expect(Date.parse(d.lot.endAt) - Date.now()).toBeLessThan(3.1 * 3_600_000);
  });
});
