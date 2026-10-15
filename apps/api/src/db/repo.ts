import { closeNotifications, createSeed, policyFor, type DemoState, type NotificationDraft } from '@auctionit/domain';
import type { Sql, Tx } from './client';
import { JSON_COLUMNS, rowKey, rowsFromState, stateFromRows, TABLES, type Row, type Rows } from './mapping';

type Db = Sql | Tx;

/** The whole demo dataset is a few hundred rows, so each request works on a full snapshot. */
export async function loadState(db: Db): Promise<DemoState> {
  const rows = {} as Rows;
  for (const [table, pk] of TABLES) {
    rows[table] = (await db`select * from ${db(table)} order by ${db(pk)}`) as unknown as Row[];
  }
  return stateFromRows(rows);
}

function prepare(db: Db, table: string, row: Row): Row {
  const cols = JSON_COLUMNS[table as keyof typeof JSON_COLUMNS] ?? [];
  if (!cols.length) return row;
  const out = { ...row };
  for (const c of cols) out[c] = db.json(row[c] as never);
  return out;
}

/** Write only what changed between two snapshots: upserts in FK order, deletes in reverse. */
export async function writeDiff(tx: Tx, before: DemoState, after: DemoState): Promise<number> {
  const a = rowsFromState(before);
  const b = rowsFromState(after);
  let changes = 0;
  for (const [table, pk] of TABLES) {
    const old = new Map(a[table].map((r) => [r[pk], rowKey(r)]));
    for (const r of b[table]) {
      if (old.get(r[pk]) === rowKey(r)) continue;
      changes++;
      const row = prepare(tx, table, r);
      if (table === 'id_counters') {
        // Counters only move forward, even if another writer advanced them.
        await tx`insert into id_counters ${tx(row)} on conflict (prefix) do update set next = greatest(id_counters.next, excluded.next)`;
        continue;
      }
      const cols = Object.keys(row).filter((c) => c !== pk);
      await tx`insert into ${tx(table)} ${tx(row)} on conflict (${tx(pk)}) do update set ${tx(row, ...cols)}`;
    }
  }
  for (const [table, pk] of [...TABLES].reverse()) {
    const keep = new Set(b[table].map((r) => r[pk]));
    for (const r of a[table]) {
      if (keep.has(r[pk])) continue;
      changes++;
      await tx`delete from ${tx(table)} where ${tx(pk)} = ${r[pk] as string}`;
    }
  }
  return changes;
}

/**
 * Every write: one transaction, the global write lock (same as place_bid/close_auction), a fresh
 * snapshot, the domain operation, then the row diff. Writes are serialised — fine at demo scale.
 */
export async function withWrite<T>(
  sql: Sql,
  fn: (tx: Tx, state: DemoState) => Promise<{ state: DemoState; result: T }> | { state: DemoState; result: T },
  /** The view the operation works on (e.g. without sample data). The diff is taken against the same view, so rows outside it are never written or deleted. */
  view: (s: DemoState) => DemoState = (s) => s,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select app_write_lock()`;
    await tx`set constraints all deferred`;
    const before = view(await loadState(tx));
    const { state, result } = await fn(tx, before);
    if (state !== before) await writeDiff(tx, before, state);
    return result;
  }) as Promise<T>;
}

export async function insertNotifications(tx: Tx, drafts: NotificationDraft[], at: string) {
  for (const n of drafts) {
    await tx`insert into notifications (id, user_id, kind, title, body, href, read, at)
             values (next_id('N'), ${n.userId}, ${n.kind}, ${n.title}, ${n.body}, ${n.href}, false, ${at})`;
  }
}

export interface CloseOutcome {
  ok: boolean;
  code?: string;
  status?: string;
  transaction_id?: string | null;
  winner_id?: string;
  amount?: number;
  bidders?: string[];
}

/** close_auction (Postgres) + the shared close notifications, in one transaction. */
export async function closeLot(tx: Tx, lotId: string, actor: { id: string; role: string }, early: boolean, now: string): Promise<CloseOutcome> {
  const [lot] = await tx`select id, title, seller_id, category from lots where id = ${lotId}`;
  if (!lot) return { ok: false, code: 'not_found' };
  const hours = policyFor(lot.category as Parameters<typeof policyFor>[0]).paymentDeadlineHours;
  const [{ r }] = (await tx`select close_auction(${lotId}, ${actor.id}, ${actor.role}, ${early}, ${hours}, ${now}) as r`) as unknown as [{ r: CloseOutcome }];
  if (!r.ok) return r;
  const win = r.transaction_id && r.winner_id ? { bidderId: r.winner_id, amountPerMt: Number(r.amount), transactionId: r.transaction_id } : null;
  await insertNotifications(tx, closeNotifications({ id: String(lot.id), title: String(lot.title), sellerId: String(lot.seller_id) }, win, r.bidders ?? []), now);
  return r;
}

/** Close auctions whose end time has passed (close on first access — PHASES 2.3). */
export async function closeDueAuctions(sql: Sql, now: string): Promise<string[]> {
  const due = await sql`select id from lots where status = 'scheduled' and end_at <= ${now}`;
  const closed: string[] = [];
  for (const { id } of due) {
    const r = await sql.begin((tx) => closeLot(tx, String(id), { id: 'system', role: 'ops' }, false, now));
    if (r.ok) closed.push(String(id));
  }
  return closed;
}

/** Replace everything with the canonical seed, dated relative to now (pnpm db:reset / demo reset). */
export async function reseed(sql: Sql, now = new Date().toISOString()) {
  const seed = createSeed(now);
  const rows = rowsFromState(seed);
  await sql.begin(async (tx) => {
    await tx`select app_write_lock()`;
    await tx`set constraints all deferred`;
    await tx.unsafe(`truncate ${TABLES.map(([t]) => t).join(', ')} cascade`);
    for (const [table] of TABLES) {
      for (const r of rows[table]) await tx`insert into ${tx(table)} ${tx(prepare(tx, table, r))}`;
    }
  });
  return { lots: seed.lots.length, seededAt: now };
}
