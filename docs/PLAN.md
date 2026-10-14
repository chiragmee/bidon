# AuctionIT — Build plan

> Status: **DRAFT — awaiting Gate 3 approval.** No product code until approved.
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
