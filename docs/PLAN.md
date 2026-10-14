# AuctionIT — Build plan

> Status: **APPROVED (Gate 3) 2026-10-15.** Phase task lists in §6.
> Sources: `docs/SPEC.md` (§N), `DESIGN.md`, `design/stitch/`, `CLAUDE.md`. Assumptions → `docs/DECISIONS.md`.

## 0. Goal and cut line

One sentence: a CEO/COO can watch journeys A, B, C (§22) run end-to-end on seeded data, with Lot Assurance visibly making the material, measurement rule and outcome clear.

**Must ship (demo blocks without it):** landing, catalogue, lot detail + assurance card, demo role entry, EMD + bid, Ops close auction, transaction stepper + payment + lifting + lifting check, claim form, Ops claim review, seller wizard + preview + publish, seller/buyer/ops dashboards, demo reset, demo-mode fallback.
**Should ship:** in-app notifications (§18), metrics panel (§23), buyer/seller onboarding forms (§9, §12.1), mobile layouts for catalogue / lot / buyer dashboard.
**Cut first if time runs short:** onboarding (demo switcher covers entry), notification bell (keep page-level outcomes), seller claim-response UI (seed the seller response instead), Supabase Auth (demo sessions only).

## 1. Build order (phases)

Each phase ends with: `typecheck` + `lint` + `test` green → commit(s) → one-line PROGRESS.md entry → short report → stop.

| # | Phase | Output | Done when |
|---|---|---|---|
| 1 | **Scaffold** | pnpm monorepo, `apps/web` (Next.js App Router, TS strict, Tailwind), `apps/api` (Express + zod, error handler, `GET /health`), `packages/domain`, `scripts/tokens.ts` (DESIGN.md → CSS vars + Tailwind preset), ESLint, Vitest, Playwright skeleton, `.env.example`s | `pnpm dev` serves a token-styled page + `/health` → 200 |
| 2 | **Domain** | types, auction state machine, bid validation, close-auction, transaction state machine, lifting check, claim eligibility (§16.3), remedy calc, `policy.ts` (demo: true), `formatINR`, canonical seed (§4 below). Unit tests for every rule | All invariants in CLAUDE.md have a passing test |
| 3 | **Web shell + DemoDataSource** | `DataSource` interface, `DemoDataSource` (localStorage, reset), app shells (public top nav / workspace sidebar / mobile tab bar), Demo Mode pill, role switcher, route guards, UI kit (button, badge, trust tag, stat card, table, modal, toast, banner, stepper, empty/error/skeleton) | Role switch works; guarded routes redirect with explanation |
| 4 | **Journey A — buyer** | landing, catalogue (filters/sort/empty), lot detail + assurance card + bid panel, EMD modal (success/fail), bid confirm + all rejection states, buyer dashboard, Ops "close demo auction", transaction page (pay balance, schedule lifting, seller confirm, lifting check: weighbridge + condition as separate records), complete OR claim | Playwright journey A passes in demo mode |
| 5 | **Journey C — ops** | Ops overview (stats labelled sample + metrics panel), auctions table, assurance queue, claim review (approve adjustment / approve exit / reject, reason required), audit trail | Playwright journey C passes |
| 6 | **Journey B — seller** | seller dashboard, lots list, lot detail (read-only when live, explained), 4-step wizard with draft persistence, evidence upload (type/size validation, progress, retry, remove), step 4 policy summary, preview, publish | Playwright journey B passes |
| 7 | **Backend + Supabase** | migrations, seed, `place_bid` + `close_auction` Postgres functions (row lock + client request id), REST routes mirroring `DataSource`, role guard on every route, `HttpDataSource`, API-unreachable → demo fallback banner, contract tests | Same Playwright suite passes with `NEXT_PUBLIC_DATA_SOURCE=http` against local Supabase |
| 8 | **States, polish, verify** | skeleton/empty/error-retry on every view, §21 checklist, 1440 + 390 pass, no console errors, a11y pass (focus, labels, aria-live) | §21 + §24 boxes ticked |
| 9 | **Deploy readiness** | README, Vercel/Render/Supabase instructions, env docs, `pnpm demo:reset`, `pnpm db:reset` | Docs complete; deploy only if credentials exist and `/health` answers |

Phases 4–6 run entirely on `DemoDataSource`; Phase 7 swaps in HTTP. This keeps a demoable product at every checkpoint.

## 2. Screen map

| Route | Role | Stitch reference | SPEC |
|---|---|---|---|
| `/` | public | `auctionit_industrial_scrap_surplus_auctions` | §7 |
| `/auctions` | public | `auctions_catalogue_signed_in_buyer`, `auctions_catalogue_mobile` | §8.1 |
| `/auctions/[id]` | public (bid = buyer) | `hms_1_2_steel_scrap_lot_detail`, `..._mobile_lot_detail`, `lot_detail_bidding_dialogs_modals` | §8.2, §10 |
| `/lot-assurance` | public | (none — compose from landing section + assurance card) | §7 |
| `/onboarding/buyer` | guest | `buyer_onboarding_business_details` | §9 |
| `/onboarding/seller` | guest | (reuse buyer onboarding layout) | §12.1 |
| `/buyer/dashboard` | buyer | `buyer_dashboard_procurement_desk`, `buyer_dashboard_mobile` | §11 |
| `/buyer/transactions/[id]` | buyer | `hms_1_2_steel_scrap_transaction_tx_1042` | §15, §16.1–16.2 |
| `/buyer/transactions/[id]/claim` | buyer | `lot_assurance_claim_form_eligibility` | §16.3–16.4 |
| `/seller/dashboard` | seller | `seller_dashboard_shree_balaji_steels` | §12.2 |
| `/seller/lots`, `/seller/lots/[id]` | seller | (table from seller dashboard) | §14 |
| `/seller/lots/new` (steps 1–4) | seller | `listing_wizard_step_3_evidence`, `listing_wizard_step_4_auction_assurance` (steps 1–2 follow the same shell) | §13 |
| `/seller/lots/[id]/preview` | seller | `preview_as_buyer_pre_publish_verification` | §13 |
| `/seller/transactions/[id]` | seller | (transaction page, seller actions) | §15, §16.5 |
| `/ops` | ops | `operations_workspace_overview_assurance_queue` | §17, §23 |
| `/ops/auctions` | ops | (table from ops overview) | §17 |
| `/ops/claims/[id]` | ops | `claim_review_arbitration_dispute_clm_1042_01` | §16.5, §17 |
| `/notifications` | any signed-in | (bell dropdown + list) | §18 |

Stitch is the source for **layout and hierarchy**. Copy that breaks honesty rules is rewritten — see DECISIONS D-005.

## 3. Domain model (packages/domain)

- **Lot**: `draft → scheduled → live → closed_reserve_met | closed_unsold → awarded`. Status derived from server time + start/end; `closeAuction` picks highest stored bid ≥ reserve.
- **Bid**: amount/MT, bidder, lot, `clientRequestId`, timestamp. `minNextBid = max(highest, reserve) + increment`.
- **EMD**: buyer × lot, `succeeded | failed`, `mode: 'simulated'`.
- **Transaction**: `won_awaiting_balance → balance_paid → awaiting_lifting → lifting_scheduled → material_checked → completed`; side states `claim_open → under_review → resolved_adjustment | resolved_exit | resolved_rejected`; `defaulted`. Each transition: allowed role + precondition; rejection returns a reason.
- **LiftingCheck**: two records — `WeighbridgeMeasurement` (ticket ref, measured MT, attachment, time) and `ConditionCheck` (observed contamination %, photos, within tolerance?). Payable = measured MT × winning price.
- **Claim**: type, expected, observed, evidence[], explanation, requested remedy, seller response, ops decision {actor, reason, at}.
- **Policy** (`policy.ts`, all `demo: true`): per category — assurance eligible, tolerance, remedies, evidence requirement, EMD rule, bid increment, claim window.
- **AuditEntry**, **Notification**.

## 4. Canonical seed (all "Sample data")

Fixes contradictions between Stitch screens (see D-006). Figures here win over the screens.

**Accounts:** Buyer — Rahul Sharma, Tata Projects Ltd (sample). Buyer 2 — Jindal Recyclers (sample, for competing bids). Seller — Shree Balaji Steels, Raipur. Seller 2 — National Smelters, Bhilai. Ops — Devendra Nath, Operations Lead.

| ID | Lot | Seller | State | Assured | Purpose |
|---|---|---|---|---|---|
| LOT-2025-0891 | HMS 1 & 2 Steel Scrap ~40 MT, Raipur Yard #4 | Shree Balaji | **Live**, reserve ₹32,000/MT, high bid ₹34,500, 12 bids, EMD ₹1,00,000, increment ₹500 | Yes | Journey A |
| LOT-2025-0899 | Armoured Copper Cable Scrap ~15 MT, Bhilai | National Smelters | Live | No | Standard lot contrast |
| LOT-2025-0894 | Aluminium Extrusion Scrap 6063 ~22 MT, Pune | National Smelters | Live (buyer outbid) | No | Outbid state |
| LOT-2025-0910 | Aluminium Dross ~25 MT, Rourkela | National Smelters | Upcoming | No | Upcoming state |
| LOT-2025-0905 | Mixed Steel Rebar Cut-ends ~80 MT, Jamshedpur | Shree Balaji | Scheduled | Yes | Upcoming assured |
| LOT-2025-0861 | HMS 2 ~30 MT, Raipur | Shree Balaji | Closed — reserve met → TX-1038 | Yes | Won, awaiting payment |
| LOT-2025-0866 | Used Machinery (lathes) | National Smelters | Closed — unsold | No | Unsold state |
| LOT-2025-0873 | HMS 1 & 2 ~40 MT, Raipur Yard #4 | Shree Balaji | Awarded → **TX-1042** | Yes | Journey C claim |
| LOT-2025-0879 | Mixed Steel ~35 MT | Shree Balaji | Awarded → TX-1045 | Yes | Awaiting lifting |
| LOT-2025-0848 | Copper Turnings ~10 MT | National Smelters | Awarded → TX-1031 | No | Completed |
| (draft) | Seller draft | Shree Balaji | Draft | — | Edit-draft path |

**TX-1042 / CLM-1042-01 (journey C):** win ₹36,000/MT; EMD ₹1,00,000; balance paid ₹13,40,000 (on ~40 MT est.); weighbridge WB-2025-10429 net **38.6 MT** → payable ₹13,89,600 → ₹50,400 to reconcile; declared contamination ≤5%, tolerance 8%, observed 14% → outside by 6 pts; buyer requests price adjustment; seller disputes (offers 1% goodwill); status **under Ops review**.

## 5. Use-case checklist

Tick as each passes in the running app.

**Journey A — Buyer (§22)**
- [ ] A1 Open marketplace · [ ] A2 Browse live lots · [ ] A3 Open assured HMS lot
- [ ] A4 Declaration / evidence / measurement rule / tolerance / remedy visible with trust tags
- [ ] A5 Simulated EMD (success + failure path) · [ ] A6 Valid bid · [ ] A7 Bid status updates
- [ ] A8 Ops closes demo auction (winner from stored bids) · [ ] A9 Winner's transaction
- [ ] A10 Simulated balance · [ ] A11 Schedule lifting (+ seller confirms)
- [ ] A12 Weighbridge + condition recorded separately · [ ] A13 Complete OR eligible claim · [ ] A14 Final state

**Journey B — Seller**
- [ ] B1–B2 Seller dashboard · [ ] B3–B4 Wizard steps 1–2 · [ ] B5 Evidence upload (validation, retry)
- [ ] B6 Reserve + dates (invalid range blocked) · [ ] B7 Assurance policy shown
- [ ] B8 Preview + publish (incomplete blocked) · [ ] B9 Listing in correct state · [ ] B10 Status visible

**Journey C — Operations**
- [ ] C1–C2 Ops overview · [ ] C3 Open CLM-1042-01 · [ ] C4 Declaration, tolerance, measurements, evidence
- [ ] C5 Decision with reason · [ ] C6 Status + audit history update across roles

**Rules & states (§20, §21)**
- [ ] Bid rejections: invalid, below min, closed, upcoming, no EMD, own lot, duplicate/stale
- [ ] Claim ineligible reasons: standard lot, no valid tx, before lifting, within tolerance, no evidence, after window
- [ ] Wrong-role transition rejected with reason · [ ] Route guards web + API
- [ ] Empty states: no matches, no bids, no listings, no transactions, no claims
- [ ] Upload: wrong type, too large, failed + retry · [ ] Network/API failure + backend-down banner
- [ ] Demo reset restores seed · [ ] Same state across buyer/seller/ops for TX-1042 and new TX

**Acceptance (§26)** — checked in Phase 8 against all 14 criteria.

## 6. Phase details

Conventions for every phase: each **T** item is one commit (`<phase>.<n>: <what>`). Before starting a phase, restate its rows from §1 and this section. After each commit, add a line to `PROGRESS.md`. At the end of a phase: run the gate check, tick the §5 boxes, write the report (done / decisions / gaps / next), then stop.

### Phase 1 — Scaffold
- **T1.1 Workspace root.** `package.json` (pnpm workspaces, `packageManager` pinned), `pnpm-workspace.yaml`, `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`), `.nvmrc` (Node 22), `.editorconfig`, Prettier.
- **T1.2 `packages/domain`.** Empty TS package with `src/index.ts`, Vitest config, one smoke test. Built through TS project references and consumed as source (no build step in dev).
- **T1.3 `apps/api`.** Express + zod. `src/app.ts` (factory, testable) and `src/server.ts`. Central error handler with shape `{error:{code,message,meaning,nextStep}}`. CORS from `ALLOWED_ORIGINS`. `GET /health` → `{status:'ok', mode, time}`. Supertest test for `/health` and the 404 shape. `.env.example`.
- **T1.4 `scripts/tokens.ts`.** Parses the DESIGN.md front-matter (yaml) and writes `apps/web/src/styles/tokens.css` (CSS variables) and `apps/web/tailwind.tokens.ts` (preset: colours, font sizes, radii, spacing, shadows from the Elevation section). Unit test: every `{colors.x}` reference resolves. `pnpm tokens` script; it also runs as a `predev`/`prebuild` hook.
- **T1.5 `apps/web`.** Next.js App Router, TS, Tailwind using the preset, Inter via `next/font` with `tnum`, a `/` placeholder page using the tokens, `.env.example` (`NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_API_URL`).
- **T1.6 Tooling.** ESLint (typescript-eslint, next, jsx-a11y). Root scripts `dev` (web + api in parallel), `typecheck`, `lint`, `test`, `build`, `e2e`. Playwright config with a smoke spec that opens `/`.
- **Gate:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` green; `pnpm dev` → web on :3000 shows token colours, `curl :4000/health` → 200. If `pnpm` is missing, enable it with corepack (no global installs without asking).

### Phase 2 — Domain (pure, fully unit-tested)
- **T2.1 Types + money.** `types.ts` (Lot, Bid, Emd, Transaction, WeighbridgeMeasurement, ConditionCheck, Claim, AuditEntry, Notification, User, Role, Company). `money.ts`: integer paise internally. `formatINR` handles Indian grouping, `/MT`, `~` and compact lakh. Tests: ₹1,00,000, ₹13,89,600, ₹34,500/MT, ~40 MT.
- **T2.2 `policy.ts`.** Per-category config (`ferrous_hms`, `mixed_steel` assured; `non_ferrous`, `e_waste`, `machinery` standard): `assuranceEligible`, `tolerancePct`, `remedies[]`, `evidence {minPhotos:6, minVideos:1}`, `emd` rule, `bidIncrement`, `claimWindow: 'before_loading_complete'`. Every entry carries `demo:true`.
- **T2.3 Auction rules.** `deriveLotStatus(lot, now)`, `minNextBid`, `validateBid(ctx) → Ok | {code, reason}` covering every §10.2 rejection, `closeAuction(lot, bids) → {status, winner?}`. Table-driven tests, including ties (the earliest bid wins), no bids, below reserve and a seller bidding on their own lot.
- **T2.4 Listing rules.** `validateDraft(step)`, `canPublish(lot, evidence) → reasons[]`, `canSellerEdit(lot, field) → reason`.
- **T2.5 Transaction machine.** Transition table `{from, action, role, guard} → to`; `applyTransition(tx, action, actor) → {tx, audit} | {reason}`; `payable(measuredMt, rate)`; `reconcile(paid, payable)`. Tests: every illegal transition and wrong role is rejected with a reason, and completion is blocked until the checks are done.
- **T2.6 Assurance.** `recordWeighbridge`, `recordCondition` (separate), `withinTolerance`, `claimEligibility(tx, claim) → {eligible, failing: Reason[]}` (all six §16.3 rules), `classifyClaim → normal | clear_exception | disputed`, `computeRemedy` (D-008). Test: CLM-1042-01 → ₹83,376.
- **T2.7 Seed.** `seed.ts` exactly as §4, with relative timestamps (`now ± h`) so live lots stay live at demo time, and `sample:true` on companies and metrics. Test: the seed passes every validator and TX-1042's numbers match §4.
- **Gate:** coverage ≥ 90% on `packages/domain`; one test per CLAUDE.md invariant.

### Phase 3 — Web shell + DemoDataSource
- **T3.1 DataSource contract.** `apps/web/src/data/DataSource.ts`: async methods per use case (`listLots(filters)`, `getLot`, `payEmd`, `placeBid`, `closeAuction`, `getTransaction`, `transition`, `recordWeighbridge`, `recordCondition`, `submitClaim`, `respondClaim`, `decideClaim`, `saveDraft`, `publish`, `uploadEvidence`, `notifications`, `audit`, `reset`). Results use the same `{ok, data} | {ok:false, error}` shape as the API.
- **T3.2 `DemoDataSource`.** Calls the domain functions, persists to localStorage under a versioned key, `reset()` restores the seed, adds a simulated 150–400 ms latency so loading states are visible, and has a `failNext()` hook for error demos.
- **T3.3 Session + guards.** Demo session (role + user id) in a cookie. The role switcher sits in the header and offers "Explore as Buyer/Seller/Operations". Middleware guards `/buyer`, `/seller`, `/ops`; an unauthorised visit lands on a page that explains why, with a way back.
- **T3.4 UI kit** (`components/ui`): Button (primary/secondary/ghost/danger/demo-dashed), Badge (all statuses with the live pulse dot), TrustTag ×3, Card, StatCard, Table, Input/Select/CurrencyInput (₹ prefix, /MT suffix), Field (label, helper, error), Modal/ConfirmDialog, Toast, Banner, Stepper (horizontal/vertical plus claim state), EmptyState, ErrorState (what / means / next + retry), Skeleton, ImageWithFallback, Countdown (orange under 1h, reduced motion).
- **T3.5 Layouts.** Public top nav (64px); workspace with a 240px teal sidebar and 64px top bar; mobile bottom tab bar; Demo Mode pill and demo-data footer notice.
- **Gate:** the `/dev/kit` page renders every component at 1440 and 390; the role switch and guards work.

### Phase 4 — Journey A (buyer)
- **T4.1 Landing `/`.** Sections from §7, three role entry cards, four featured lots from the seed (with Stitch copy rewritten per D-005).
- **T4.2 Catalogue `/auctions`.** Filter rail (keyword, category, location, assured only, status, ending soon), sort, clear filters, empty state. On mobile the filters open in a bottom sheet. Filters live in the URL.
- **T4.3 Lot detail.** 65/35 layout; gallery (4:3, with fallback); specs; quantity and measurement basis; seller and track record; evidence list; assurance card (six rows, each with a trust tag and a "Demo policy" caption); sticky bid panel that becomes a sticky bottom bar on mobile; bid history.
- **T4.4 EMD + bid.** EMD modal (success, plus a simulated failure toggle); bid form with quick increments; confirm dialog; `aria-live` result; every rejection shows inline, with a refresh of the current bid.
- **T4.5 Buyer dashboard.** Stat cards, active bids table (Leading / Outbid / Won / Closed without winning), transaction cards each with one next action, empty states.
- **T4.6 Ops close auction (minimal).** A demo-dashed "Close demo auction" button on `/ops/auctions` with confirmation; the result comes from the stored bids and creates the transaction plus notifications.
- **T4.7 Transaction page.** Stepper, timeline, pay balance (simulated, confirm), schedule lifting (date and vehicle), seller confirm (seller view), weighbridge form and condition form as separate cards, estimated vs measured comparison, reconciliation, Complete. A disabled button explains why it's disabled.
- **T4.8 Claim.** Eligibility panel (pass/fail list with reasons and the next step), form (type, expected, observed, evidence ≥ 2, explanation, remedy), submit → claim state on the stepper.
- **T4.9 E2E journey A** (both endings: complete, and claim).
- **Gate:** journey A Playwright green at 1440 and 390.

### Phase 5 — Journey C (operations)
- **T5.1 Ops overview.** Five stat cards (attention state for open claims), metrics panel (North Star etc., computed from the seed and labelled "Sample data · simulated").
- **T5.2 Auctions table.** Status, bids, result, close action.
- **T5.3 Assurance queue.** Columns per §17, time since opened.
- **T5.4 Claim review.** Declaration vs observed, tolerance, measurements, evidence on both sides, seller response, three decisions with a required reason, confirm dialog, and the remedy amount computed by the domain.
- **T5.5 Audit trail + cross-role consistency.** Decision appears for buyer, seller and Ops; notifications sent.
- **T5.6 E2E journey C.**
- **Gate:** journey C green, and TX-1042 shows the same state in all three roles.

### Phase 6 — Journey B (seller)
- **T6.1 Seller dashboard + `/seller/lots`.** Stats, tabbed lots table, claim attention banner, "Create a new lot".
- **T6.2 Wizard shell.** Stepper, sticky Back/Next footer, autosave draft, Save draft.
- **T6.3 Steps 1–2.** Category-driven fields, inline validation.
- **T6.4 Step 3 evidence.** File picker (JPG/PNG/MP4/PDF, 50 MB), progress, remove/retry, simulated failure, pilot requirement counter labelled "Proposed pilot requirement", no geotag claims. Files go to object URLs (demo) or Supabase Storage (phase 7).
- **T6.5 Step 4.** Reserve, EMD, start/end with range validation, assurance toggle (eligible categories only) showing the policy summary and the seller agreement notice.
- **T6.6 Preview + publish.** Buyer view banner, edit links per section, publish blocked with reasons, confirmation, lands on the dashboard with the correct status.
- **T6.7 Seller lot detail + seller transaction view** (read-only when live, with an explanation; respond to claim: accept or dispute with evidence).
- **T6.8 E2E journey B.**
- **Gate:** journey B green; the new lot appears in the buyer catalogue.

### Phase 7 — Backend + Supabase
- **T7.1 Migrations.** Tables per §3; enums; FKs; `audit_log`; RLS enabled (API uses the service role server-side only).
- **T7.2 SQL functions.** `place_bid(lot, bidder, amount, request_id)` uses `SELECT … FOR UPDATE`, re-checks the domain rules and has a unique `request_id`. `close_auction(lot)` is idempotent.
- **T7.3 Seed.** A script generates SQL from `packages/domain/seed.ts` (single source); `pnpm db:reset`.
- **T7.4 API routes.** One router per resource, zod schemas shared with web, a role guard middleware (demo session header; Supabase JWT when configured), domain validation before the DB.
- **T7.5 `HttpDataSource`** plus the unreachable → demo fallback with a banner.
- **T7.6 Contract tests.** The same test suite runs against both DataSources; concurrency test of 20 parallel bids → exactly one valid sequence.
- **Gate:** e2e suite green with `NEXT_PUBLIC_DATA_SOURCE=http` against local Supabase (`supabase start`). If Docker or Supabase is unavailable, the gate becomes contract tests plus a documented manual step; noted in the report.

### Phase 8 — States, polish, verify
- **T8.1** Walk every §21 state and tick it; fill any gaps.
- **T8.2** Responsive pass at 390 / 768 / 1024 / 1440; no horizontal scroll (Playwright check of `scrollWidth`).
- **T8.3** A11y: axe in Playwright on key pages, focus order, `aria-live`, contrast.
- **T8.4** Copy pass: grep for Verified, Certified, Guarantee, escrow; every seeded figure labelled.
- **T8.5** Console-error check in e2e (fail on `console.error`).
- **Gate:** all 14 §26 criteria ticked.

### Phase 9 — Deploy readiness
- **T9.1 README.** What it is, demo script (A/B/C click paths), local setup, commands.
- **T9.2 `docs/DEPLOY.md`.** Supabase (project, migrations, seed), Render (build/start, env, health check), Vercel (root dir, env), CORS, reset.
- **T9.3** `render.yaml`, `vercel.json` if needed, `pnpm demo:reset`.
- **T9.4** Deploy only if credentials are present → confirm with you first (outward-facing) → verify `/health` and the live journey; otherwise list the exact manual steps.
