# 0001 — API persistence: snapshot + shared domain + row diff, bids and closes in Postgres

- Status: Accepted
- Date: 2026-10-15
- Related: CLAUDE.md (Architecture, Business invariants), docs/PHASES.md Phase 2, DECISIONS D-009, D-011, D-015, D-062–D-071

## Context

AuctionIT has two data paths that must never disagree (CLAUDE.md: "demo mode and real mode cannot disagree"):

- **Demo mode** runs `packages/domain` in the browser over a full in-memory state snapshot (`DemoState`). Every rule — bids, auction close, transaction transitions, claims, listings — is a pure function `(state, input, actor, now) → { state, result }`.
- **Real mode** (`apps/api` + Supabase Postgres) must enforce the same rules server-side, survive concurrent requests (PHASES 2.2: `place_bid` locks the lot row, dedupes by request id), and write audit and notifications in the same transaction.

The dataset is demo-sized: about 20 lots, a few hundred rows in total. The audience is a CEO/COO walkthrough, not production traffic. The build was fast-tracked (D-015): Phases 3–5 were built on demo mode first, so by Phase 2 every rule already existed as a tested pure function (228 domain tests).

## Decision

1. **The API reuses the domain operations unchanged.** For each request the API loads the full state from Postgres into a `DemoState` (`loadState`), runs the same `packages/domain` function demo mode runs, and writes back **only the rows that changed** (`writeDiff`: upserts in foreign-key order, deletes in reverse). The mapping `DemoState ⇄ rows` is in `apps/api/src/db/mapping.ts`, and a round-trip test confirms it is exact.
2. **Bids and auction closes are Postgres functions.** `place_bid` locks the lot row (`FOR UPDATE`), re-checks every rule in **the same order and with the same codes** as `validateBid`, dedupes on `client_request_id`, and timestamps the bid with `clock_timestamp()` after it holds the lock. `close_auction` picks the winner from stored bids (highest bid meeting the reserve, earliest on a tie), creates the transaction, refunds losing EMDs and writes audit rows — all in one transaction. The wording comes from the shared domain (`bidRejection`, `bidNotifications`, `closeNotifications`), so both paths say the same thing.
3. **All writes are serialised.** Every writer — the snapshot path, `place_bid` and `close_auction` — first takes the same transaction-scoped advisory lock (`app_write_lock()` → `pg_advisory_xact_lock(4242)`). Ids continue from per-prefix counters (`next_id`); counter writes only move forward (`greatest`).
4. **Auctions close on read.** Before serving any request the API closes lots whose end time has passed (`closeDueAuctions`), mirroring `processDueClosures` in demo mode. There is no scheduler.
5. **Parity is enforced by tests, not by convention.** One contract suite (`apps/api/src/contract.test.ts`) runs against `LocalDataSource` (the reference), `HttpDataSource` → API → memory, and `HttpDataSource` → API → Postgres. It covers rejection codes and wording, the journeys, 20 concurrent bidders and a 5× retry storm.

## Alternatives considered

- **A conventional repository per entity (SQL per use case).** This is the usual production shape, and per-request cost scales with what is touched rather than the whole dataset. It was rejected for now because every rule would have to be re-expressed as SQL or ad-hoc queries next to the domain functions — two implementations of each rule, which is exactly the drift CLAUDE.md forbids — and that is a large rewrite for a demo deadline.
- **All business logic in Postgres functions.** This gives the strongest atomicity, but duplicates the domain in PL/pgSQL, loses the unit-tested TypeScript rules, and makes demo mode a second, divergent implementation. It is used only where atomicity under concurrency is the point (bids, closes).
- **Supabase JS client (PostgREST) instead of a direct Postgres connection.** It can't run multi-statement transactions or take advisory locks from the client, both of which serialised writes and close-plus-notify need. Supabase JS is kept for Storage uploads only.
- **Row-level locks only (no global lock).** This allows more concurrency, but snapshot writes touch many tables, and counters are shared by both paths. Serialising is simpler and provably correct at this scale; `place_bid` still also locks the lot row, as the spec requires.
- **A scheduler or cron to close auctions.** One more moving part (Render cron, retries). Close-on-read gives the same observable behaviour for the demo and matches demo mode exactly.

## Consequences

- **Good:** one source of truth for every rule. Demo and real mode return identical results, codes and wording, and the contract suite proves it on every run. Business-critical writes (bids, closes) are atomic and race-safe, and the 20-bidder test passes repeatedly against Postgres. Adding a rule means changing one domain function; the API picks it up with no SQL change, unless the rule lives in `place_bid`/`close_auction`.
- **Cost:** each request loads the whole dataset (~14 queries) and writes are serialised. That is fine for hundreds of rows and one demo audience, but it **does not scale**. Throughput is bounded by one writer at a time, and latency grows with total data size.
- **Two places must stay in step:** the bid and close rules exist in both `validateBid`/`closeAuction` (TypeScript) and `place_bid`/`close_auction` (SQL). The contract suite catches drift, but changes must be made in both.
- **Ordering is not guaranteed for ties:** row order from Postgres can differ from demo-mode array order. Views must sort explicitly, with an id tie-break (already done for bids).
- **When to revisit:** before real usage — more than a few thousand rows, more than one concurrent demo, or production sellers. The migration path is incremental: keep the domain functions, replace `loadState` with scoped loaders per operation (lot plus its bids, transaction plus its claim), and narrow the global lock to per-lot or per-transaction advisory locks. The contract suite stays as the safety net during that change.
