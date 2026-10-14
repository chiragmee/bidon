# AuctionIT — build phases

Run one phase per session. Start each with: **"Run Phase N from docs/PHASES.md."**
Each phase ends with typecheck, lint and tests green, `docs/PLAN.md` ticked, a short report (done · decisions · gaps · next), a commit, and a stop.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7.
Fast track (about 2 hours, demo mode only): 1 → 3 → 5, then 2, 4, 6, 7 later.

---

## Phase 1 — Plan, scaffold, design tokens, domain core

Read `CLAUDE.md`, `docs/SPEC.md`, `DESIGN.md`, this file, and everything in `design/stitch/` first.

1. Write `docs/PLAN.md`:
   - **Screen map:** every Stitch screen → route → role → components.
   - **Use-case checklist:** one line per rule in SPEC §10, §15, §16, §20 and per edge state in §21, each saying where it is enforced (domain / API / DB / UI) and how it is tested.
   - **Phase checklist:** Phases 1–7 from this file.
2. Scaffold the pnpm monorepo exactly as `CLAUDE.md` describes, TypeScript strict.
3. Write `scripts/tokens.ts`: read `DESIGN.md` front matter → CSS variables + Tailwind preset. Build UI primitives on those tokens only: Button (primary, secondary, ghost, danger, demo), MoneyInput, StatusBadge, TrustBadge, Lot Assurance badge, Card, LotCard, Stepper, StatCard, Banner, EmptyState, Dialog, Toast, Skeleton, DemoModePill, and an image component with the designed fallback tile. Add `/dev/components` showing all of them.
4. Build `packages/domain`:
   - Types and state machines: auction (Draft → Scheduled → Live → Closed reserve met / Closed reserve not met → Awarded), transaction (SPEC §15 states, including Defaulted), claim (Open → Seller responded → Under review → Resolved / Rejected).
   - Pure functions: `validateBid`, `minNextBid`, `deriveAuctionStatus(lot, now)`, `closeAuction(lot, bids)`, `canTransition`, `claimEligibility` (returns specific failing reasons), `applyRemedy`, `computePayable`, `sellerTrackRecord(transactions, claims)`, `formatINR`.
   - `policy.ts`: per-category EMD, increment, tolerance, remedy, evidence requirement, claim window and payment deadline, all flagged `demo: true`.
   - Vitest tests for every function and every rejection reason.
5. Write `packages/domain/seed.ts`:
   - Covers every record in SPEC §19 and can run journeys A, B and C (§22) with no contradictions between roles.
   - **All dates are relative to the moment of reset** (for example, live lot ends now + 3h, one lot ends now + 40 min, upcoming starts now + 1 day). Seeded data must look current on any day.
   - Include seller histories so track records show (one seller with completions and one resolved claim; one new seller with no history).
   - Use photos from `apps/web/public/demo-images/` when present, else the fallback tile.

---

## Phase 2 — Database, API, demo data source

1. **Migrations** (`supabase/migrations`): tables from SPEC §19, foreign keys, status enums, check constraints (reserve > 0, end > start), indexes, RLS enabled. The API uses the service role server-side only; never expose it to the browser. Storage bucket `lot-media` for listing evidence, lifting photos and weighbridge tickets.
2. **Postgres functions:**
   - `place_bid(lot_id, bidder_id, amount, client_request_id)`: locks the lot row, re-checks status, time, EMD, self-bid and minimum increment, dedupes by request id, returns new state or a typed error code.
   - `close_auction(lot_id, actor)`: winner = highest stored bid meeting reserve, else Unsold; creates the transaction; writes audit and notifications in one transaction.
3. **Time-based status:** Scheduled → Live at start time and Live → Closed at end time happen automatically (derive on read with `deriveAuctionStatus` and close on first access after end, or a lightweight scheduler). Operations' "Close demo auction" ends one early for the live demo.
4. **Seed and reset:** loader using `seed.ts`; `pnpm db:reset` and `pnpm demo:reset` restore the initial state with fresh relative times. No Supabase credentials → try `supabase start` (Docker); otherwise note it and continue in demo mode.
5. **API routes** (`apps/api`): demo session and auth, role switch, demo reset (demo mode only), lots (list with filters and sort, detail, draft create/update, publish), media upload (type and size validation), EMD (simulate success / failure), bids, close auction (Operations, demo action), transactions (pay balance, schedule lifting, seller confirm, lifting check, complete, mark defaulted by Operations when the payment deadline passes), claims (create, seller respond, Operations decide), notifications, Operations overview and metrics, seller track record, audit, `GET /health`.
   Every write: zod → role guard → domain rule → DB → audit → notification. Errors return `{ code, message, what, next }`.
6. **DemoDataSource** in `apps/web`: same interface, uses `packages/domain` and the seed, persists to localStorage, uploads held as object URLs, resettable.
7. **Contract tests:** one suite run against HttpDataSource and DemoDataSource with identical outcomes. Include: 20 parallel bids → exactly one correct highest bid, no duplicates; auction past end time is closed with the correct winner.

---

## Phase 3 — Guest and buyer journey

Match the Stitch screens for landing, catalogue, lot detail, EMD and bid dialogs, onboarding and buyer dashboard, using only Phase 1 components.

1. **Demo access:** landing page "Explore as Buyer / Seller / Operations" (one click, no signup), and a **role switcher in the header on every page** (Buyer, Seller, Operations, plus "Reset demo data" with confirmation) so a live walkthrough can jump between roles without leaving the current lot or transaction when that role may view it.
2. **`/auctions`:** working search, filters, sort, filter chips, clear filters, empty state; filters synced to the URL.
3. **`/auctions/[id]`:** full hierarchy from SPEC §8.2; Lot Assurance summary with trust tags; seller card with live track record; sticky bid panel (bottom bar on mobile).
   Bid button logic: no EMD → EMD dialog → back to bid; upcoming → opening time; closed → result and next action, never a working bid button.
4. **EMD dialog** with simulated success and failure.
5. **Bid dialog:** minimum increment, quick chips, confirm step, double-submit guard, stale-bid recovery (refresh, show new minimum), current bid refreshing every 5s or via Supabase realtime, `aria-live` result.
6. **Buyer onboarding:** 3 steps, values kept between steps, every error in SPEC §9.
7. **`/buyer/dashboard`:** stats; active bids with Leading / Outbid / Won / Closed without winning; transactions with stepper and one next action (links go to `/transactions/[id]`; a simple placeholder is fine until Phase 5); empty states.

Every view: skeleton, empty, error with retry. Playwright: journey A steps 1–7. Check every screen at 1440px and 390px.

---

## Phase 4 — Seller listing and lot management

Match the Stitch seller screens.

1. **Seller onboarding:** short, with a sample verification status (never claim real verification).
2. **`/seller/dashboard`:** stats, claim banner, lots table with Drafts / Scheduled / Live / Closed tabs linking to real records, track record summary, one primary "Create a new lot".
3. **`/seller/lots/new` wizard (4 steps):**
   - Category-specific fields; values kept across steps; draft autosave.
   - Evidence upload to `lot-media` (or object URLs in demo) with progress, retry, remove and type/size errors; pilot checklist (6+ geotagged photos, 1 video, labelled "proposed"; never claim location was verified).
   - Reserve, EMD and date validation; Lot Assurance toggle showing the category's demo policy and an agreement checkbox (only for eligible categories).
   - Preview as buyer; publish blocked until valid; status set from start time.
4. **`/seller/lots` and `/seller/lots/[id]`:** current bid, bid count, bid history, result (cleared / unsold), link to the transaction, evidence and assurance status. Live lots cannot be edited — explain why instead of showing broken controls. No way to alter bids, reserve after bidding, or winners.

Playwright: journey B steps 1–9.

---

## Phase 5 — Post-win workflow, Lot Assurance claims, Operations

Match the Stitch transaction, claim and Operations screens.

1. **`/transactions/[id]`**, shared by buyer, seller and Operations with role-appropriate actions and one stepper and timeline:
   - Buyer pays balance (simulated) → buyer proposes lifting date → **seller confirms** → lifting check.
   - **Card A — Weighbridge measurement:** ticket reference, measured MT, ticket upload, time; payable recalculated from measured quantity.
   - **Card B — Visual condition check:** seller declaration beside timestamped lifting photos, observed value, within / outside tolerance.
   - The two cards are visibly separate. Then Complete, or Raise assurance claim.
   - Payment deadline passed with no balance → Operations can mark Defaulted (demo action), with the EMD outcome shown per demo policy.
2. **Claims:**
   - Eligibility checklist showing each specific failing reason (standard lot, no lifting yet, within tolerance, missing evidence, after loading complete).
   - Form per SPEC §16.4.
   - **Seller response:** accept the proposed remedy, or dispute with explanation and evidence.
   - Outcomes per §16.5: within tolerance → normal completion; clear exception accepted by seller → configured remedy applied and transaction resolved; disputed → Operations queue.
3. **`/ops`:**
   - Overview and North Star metrics panel (completed ÷ listed, clear rate, unique bidders per lot, mismatch defaults, Ops reviews per 100 completions), labelled "Simulated".
   - Auction controls: close demo auction using real bids and reserve; inspect results and unsold lots.
   - Assurance queue; three-column claim review; decision with required reason and confirmation dialog; audit trail; transaction history.
4. **Seller track record** updates after every completion and claim resolution, and shows on lot cards, lot detail and the seller dashboard.
5. **Notifications** for every event in SPEC §18, each linking to its lot or transaction; bell with unread count.

Playwright: journey A steps 8–14 (complete branch and claim branch), journey B step 10, journey C. Assert one transaction shows the same state in buyer, seller and Operations views.

---

## Phase 6 — Hardening

1. Walk every item in SPEC §21 and every unticked line in `docs/PLAN.md`: confirm a designed UI state and a test for each. List anything not covered and why.
2. **Role security:** call every API route as guest, buyer, seller and Operations; assert 401/403 where required. Buyers can't open `/seller`; sellers can't touch another seller's lot; only Operations reviews claims, closes demo auctions or marks defaults.
3. **Resilience:** API down → banner and retry (or fallback to demo with a visible banner); expired session → sign back in without losing form data; network drop mid-bid → never a false success.
4. **Accessibility:** journeys A–C by keyboard only; visible focus; labelled inputs; `aria-live` for bid results; axe in Playwright with zero serious violations.
5. **Visual pass:** screenshot every route at 1440px and 390px, compare with `design/stitch/` and `DESIGN.md` (one primary button per viewport, trust tags, no "Verified", ₹ formatting, no horizontal scroll). Fix every difference.

---

## Phase 7 — Deployment readiness and demo kit

1. `.env.example` for web and api; `README.md` covering local setup, demo access, reset, architecture overview, and how demo mode differs from real mode.
2. `docs/DEPLOY.md`: step by step for Supabase (project, migrations, storage bucket, seed), Render (build and start commands, env vars, health check, CORS) and Vercel (env vars, API URL), with exact variable names. Add `render.yaml` and Vercel config if useful.
3. `docs/DEMO_SCRIPT.md`: a 10-minute CEO/COO walkthrough of journeys A, B and C with exact clicks, what to say at each Lot Assurance moment, and "Reset demo data" as step zero.
4. Final run from a clean clone: build, typecheck, lint, test, e2e all green.
5. Do not claim deployment unless you deployed and `/health` responded.
6. Report against every acceptance criterion in SPEC §26, item by item: pass, fail, or not possible here and why.
