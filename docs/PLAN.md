# AuctionIT — Build plan

> Status: **APPROVED (Gate 3) 2026-10-15.** Phases are defined by `docs/PHASES.md` (authority); this file tracks progress against them.
> Sources: `docs/SPEC.md` (§N), `DESIGN.md`, `design/stitch/`, `CLAUDE.md`, `docs/PHASES.md`. Assumptions → `docs/DECISIONS.md`.

## 0. Goal and cut line

One sentence: a CEO/COO can watch journeys A, B, C (§22) run end-to-end on seeded data, with Lot Assurance visibly making the material, measurement rule and outcome clear.

**Must ship (demo blocks without it):** landing, catalogue, lot detail + assurance card, demo role entry, EMD + bid, Ops close auction, transaction stepper + payment + lifting + lifting check, claim form, Ops claim review, seller wizard + preview + publish, seller/buyer/ops dashboards, demo reset, demo-mode fallback.
**Should ship:** in-app notifications (§18), metrics panel (§23), buyer/seller onboarding forms (§9, §12.1), mobile layouts for catalogue / lot / buyer dashboard.
**Cut first if time runs short:** onboarding (demo switcher covers entry), notification bell (keep page-level outcomes), seller claim-response UI (seed the seller response instead), Supabase Auth (demo sessions only).

## 1. Phase checklist (from `docs/PHASES.md`)

Run one phase per session ("Run Phase N from docs/PHASES.md"). Each ends: typecheck + lint + test green → PLAN ticked → report (done · decisions · gaps · next) → commit → stop.

- [x] **Phase 1** (2026-10-15) — Plan, scaffold, design tokens + UI primitives (`/dev/components`), domain core + tests, seed
- [ ] **Phase 2** — Supabase migrations, `place_bid` / `close_auction`, time-based status, seed/reset, API routes, DemoDataSource, contract tests
- [x] **Phase 3** (2026-10-15) — Guest + buyer journey (demo access, role switcher + reset, catalogue, lot detail, EMD, bid, onboarding, buyer dashboard) · e2e A1–A7
- [ ] **Phase 4** — Seller onboarding, dashboard, 4-step wizard, preview/publish, lot management · e2e B1–B9
- [x] **Phase 5** (2026-10-15) — `/transactions/[id]`, lifting check, claims + seller response, `/ops`, track record, notifications · e2e A8–A14, B10, C
- [ ] **Phase 6** — Hardening: §21 walk, role security matrix, resilience, a11y, visual pass vs Stitch
- [ ] **Phase 7** — Env, README, DEPLOY.md, DEMO_SCRIPT.md, clean-clone run, §26 report

**Chosen order: fast track 1 → 3 → 5 → 4 → 2 → 6 → 7** (D-015). Phases 3–5 and 4 run on `DemoDataSource`, which moves from Phase 2.6 into Phase 3 (D-011). Phase 2 then adds Supabase + API + `HttpDataSource` + contract tests behind the same interface.

## 2. Screen map

Components refer to the Phase 1 primitives (`apps/web/src/components/ui`) plus feature components built in the phase that owns the screen.

| Stitch screen | Route | Role | Components | SPEC | Phase |
|---|---|---|---|---|---|
| `auctionit_industrial_scrap_surplus_auctions` | `/` | guest | TopNav, DemoModePill, Button, LotCard ×4, LotAssuranceBadge, StatusBadge, role entry Card ×3, Footer | §7 | 3 |
| (landing section + assurance card) | `/lot-assurance` | guest | AssuranceSummaryCard, TrustBadge ×3, Stepper (mechanism) | §7 | 3 |
| `auctions_catalogue_signed_in_buyer`, `auctions_catalogue_mobile` | `/auctions` | guest · buyer | FilterRail / FilterSheet, filter chips, LotCard grid, sort Select, EmptyState, Skeleton, ErrorState | §8.1 | 3 |
| `hms_1_2_steel_scrap_lot_detail`, `hms_1_2_steel_scrap_mobile_lot_detail` | `/auctions/[id]` | guest · buyer (bid) | Gallery (LotImage), spec table, AssuranceSummaryCard + TrustBadge, SellerCard (track record), EvidenceList, BidPanel / MobileBidBar, BidHistory, Countdown | §8.2 | 3 |
| `lot_detail_bidding_dialogs_modals` | dialogs on `/auctions/[id]` | buyer | Dialog, EmdDialog (success/fail), BidDialog (MoneyInput, quick chips, confirm), Toast, Banner (bid errors) | §10 | 3 |
| `buyer_onboarding_business_details` | `/onboarding/buyer` | guest | Stepper, Field/Input/Select, chip multi-select, Banner, Button | §9 | 3 |
| `buyer_dashboard_procurement_desk`, `buyer_dashboard_mobile` | `/buyer/dashboard` | buyer | WorkspaceShell, StatCard ×5, bids Table, StatusBadge, TransactionCard (Stepper + one action), EmptyState | §11 | 3 |
| `hms_1_2_steel_scrap_transaction_tx_1042` | `/transactions/[id]` | buyer · seller · ops | Stepper, Timeline, WeighbridgeCard, ConditionCheckCard, ReconciliationCard, TrustBadge, Dialog, demo Button | §15, §16.1–2 | 5 |
| `lot_assurance_claim_form_eligibility` | `/transactions/[id]/claim` | buyer | EligibilityChecklist, claim type Segmented, ToleranceComparison, EvidenceUploader, Field, Dialog | §16.3–4 | 5 |
| (transaction page, seller panel) | `/transactions/[id]` | seller | SellerResponseForm (accept / dispute + evidence) | §16.5 | 5 |
| `operations_workspace_overview_assurance_queue` | `/ops` | ops | WorkspaceShell, StatCard ×5 (attention), MetricsPanel ("Simulated"), ClaimsQueue Table, auction controls | §17, §23 | 5 |
| (table from ops overview) | `/ops/auctions` | ops | Table, StatusBadge, demo Button "Close demo auction", Dialog | §17 | 5 |
| `claim_review_arbitration_dispute_clm_1042_01` | `/ops/claims/[id]` | ops | three columns (declaration · lifting · positions), DecisionForm (reason required), Dialog, AuditTrail | §16.5, §17 | 5 |
| (bell) | `/notifications` | signed-in | NotificationBell, list, EmptyState | §18 | 5 |
| `seller_dashboard_shree_balaji_steels` | `/seller/dashboard` | seller | WorkspaceShell, StatCard ×6, claim Banner, lots Table + tabs, TrackRecord, Button "Create a new lot" | §12.2 | 4 |
| (reuse onboarding layout) | `/onboarding/seller` | guest | as buyer onboarding, sample verification status | §12.1 | 4 |
| (from seller dashboard table) | `/seller/lots`, `/seller/lots/[id]` | seller | Table, tabs, BidHistory, result Banner, EvidenceList, read-only explanation | §14 | 4 |
| `listing_wizard_step_3_evidence`, `listing_wizard_step_4_auction_assurance` (steps 1–2 same shell) | `/seller/lots/new` | seller | WizardShell (Stepper + sticky footer), Field, MoneyInput, date inputs, EvidenceUploader (progress, retry, remove), PilotChecklist, policy summary, agreement Checkbox | §13 | 4 |
| `preview_as_buyer_pre_publish_verification` | `/seller/lots/[id]/preview` | seller | preview Banner, lot detail components (read-only), publish-blockers list, Dialog | §13 | 4 |
| — | `/dev/components` | dev | every primitive, all variants | — | 1 |

Stitch is the source for **layout and hierarchy**. Copy that breaks honesty rules is rewritten (D-005).

## 3. Domain model (packages/domain)

- **Lot**: `draft → scheduled → live → closed_reserve_met | closed_unsold → awarded`. Status derived from server time + start/end; `closeAuction` picks highest stored bid ≥ reserve.
- **Bid**: amount/MT, bidder, lot, `clientRequestId`, timestamp. `minNextBid = max(highest, reserve) + increment`.
- **EMD**: buyer × lot, `succeeded | failed`, `mode: 'simulated'`.
- **Transaction**: `won_awaiting_balance → balance_paid → lifting_proposed (buyer) → lifting_scheduled (seller confirms) → material_checked → completed`; `claim_opened → under_review → resolved`; `defaulted` (Ops only, after payment deadline per policy). Each transition: allowed role + precondition; rejection returns a reason.
- **LiftingCheck**: two records — `WeighbridgeMeasurement` (ticket ref, measured MT, attachment, time) and `ConditionCheck` (observed contamination %, photos, within tolerance?). Payable = measured MT × winning price.
- **Claim**: `open → seller_responded → under_review → resolved | rejected` (seller accepts → resolved with remedy, no Ops). Fields: type, expected, observed, evidence[], explanation, requested remedy, seller response {accept|dispute, explanation, evidence}, ops decision {actor, reason, at}.
- **Seller track record**: `sellerTrackRecord(transactions, claims)` → completed sales, resolved claims; recomputed after every completion/resolution.
- **Policy** (`policy.ts`, all `demo: true`): per category — assurance eligible, tolerance, remedies, evidence requirement, EMD rule, bid increment, claim window, payment deadline.
- **AuditEntry**, **Notification**.

## 4. Canonical seed (all "Sample data")

Fixes contradictions between Stitch screens (see D-006). Figures here win over the screens.

**Accounts:** Buyer — Rahul Sharma, Tata Projects Ltd (sample). Buyer 2 — Jindal Recyclers (sample, for competing bids). Seller — Shree Balaji Steels, Raipur. Seller 2 — National Smelters, Bhilai. Seller 3 — Mahalaxmi Metals, Pune (**new seller, no history**). Ops — Devendra Nath, Operations Lead.

| ID | Lot | Seller | State | Assured | Purpose |
|---|---|---|---|---|---|
| LOT-2025-0891 | HMS 1 & 2 Steel Scrap ~40 MT, Raipur Yard #4 | Shree Balaji | **Live**, reserve ₹32,000/MT, high bid ₹34,500, 12 bids, EMD ₹1,00,000, increment ₹500 | Yes | Journey A |
| LOT-2025-0899 | Armoured Copper Cable Scrap ~15 MT, Bhilai | National Smelters | Live | No | Standard lot contrast |
| LOT-2025-0894 | Aluminium Extrusion Scrap 6063 ~22 MT, Pune | Mahalaxmi Metals | Live, **ends now + 40 min** (buyer outbid) | No | Outbid + urgent countdown; new seller with no track record |
| LOT-2025-0910 | Aluminium Dross ~25 MT, Rourkela | National Smelters | Upcoming | No | Upcoming state |
| LOT-2025-0905 | Mixed Steel Rebar Cut-ends ~80 MT, Jamshedpur | Shree Balaji | Scheduled | Yes | Upcoming assured |
| LOT-2025-0861 | HMS 2 ~30 MT, Raipur | Shree Balaji | Closed — reserve met → TX-1038 | Yes | Won, awaiting payment (deadline in future) |
| LOT-2025-0855 | Cast Iron Scrap ~20 MT | National Smelters | Awarded → TX-1035 | No | Payment deadline passed → Ops can mark Defaulted |
| LOT-2025-0866 | Used Machinery (lathes) | National Smelters | Closed — unsold | No | Unsold state |
| LOT-2025-0873 | HMS 1 & 2 ~40 MT, Raipur Yard #4 | Shree Balaji | Awarded → **TX-1042** | Yes | Journey C claim |
| LOT-2025-0879 | Mixed Steel ~35 MT | Shree Balaji | Awarded → TX-1045 | Yes | Awaiting lifting |
| LOT-2025-0848 | Copper Turnings ~10 MT | National Smelters | Awarded → TX-1031 | No | Completed |
| LOT-2025-0812…0840 | 6 past HMS / mixed-steel lots | Shree Balaji | Completed (one with resolved claim CLM-0998-01, price adjustment) | Yes | Track record: 6 completed · 1 resolved claim |
| (draft) | Seller draft | Shree Balaji | Draft | — | Edit-draft path |

All timestamps are relative to reset time (live lot ends now + 3h, LOT-0894 now + 40 min, upcoming starts now + 1 day).

**TX-1042 / CLM-1042-01 (journey C):** win ₹36,000/MT; EMD ₹1,00,000; balance paid ₹13,40,000 (on ~40 MT est.); weighbridge WB-2025-10429 net **38.6 MT** → payable ₹13,89,600 → ₹50,400 to reconcile; declared contamination ≤5%, tolerance 8%, observed 14% → outside by 6 pts; buyer requests price adjustment; seller disputes (offers 1% goodwill); claim status **under_review**.

## 5. Use-case checklist

**Status after Phase 1:** the **D** (domain) layer and its **U** tests are done for every rule row below (165 domain tests). A row is ticked only when all its listed layers and tests pass.

Enforced: **D** domain (`packages/domain`) · **A** API · **DB** Postgres constraint/function · **UI** web. Test: **U** Vitest unit · **C** contract (both DataSources) · **E** Playwright. Tick once the test passes. Columns A/DB/C are delivered in Phase 2.

### Bidding and auctions (§10, §20 Auctions)
| ✓ | Rule | Enforced | Test |
|---|---|---|---|
| [ ] | EMD required before bid; simulated success records it, simulated failure doesn't | D A DB UI | U C E(A5) |
| [ ] | Bid amount missing / not a positive number → `invalid_amount` | D A UI | U C |
| [ ] | Bid below min next bid (highest or reserve + increment) → `below_minimum` | D A DB UI | U C E |
| [ ] | Bid before start → `auction_not_started` | D A DB UI | U C |
| [ ] | Bid after end / closed → `auction_closed` | D A DB UI | U C |
| [ ] | No EMD → `emd_required` | D A DB UI | U C E |
| [ ] | Seller bidding own lot → `own_lot` | D A DB | U C |
| [ ] | Duplicate client request id → `duplicate` (idempotent) | A DB UI | C |
| [ ] | Stale bid (someone outbid meanwhile) → `outbid`, UI refreshes minimum | D A DB UI | U C |
| [ ] | 20 concurrent bids → one consistent highest, no duplicates | DB | C |
| [ ] | Status derived from time: Scheduled → Live at start, Live → Closed at end | D A | U C |
| [ ] | Close: winner = highest stored bid ≥ reserve (earliest on tie), else Unsold; creates transaction | D A DB | U C E(A8) |
| [ ] | Only Ops can close a demo auction early | D A UI | U C |
| [x] | No working bid button on upcoming/closed lots | UI | E |

### Listings (§13, §14, §20 Listings)
| ✓ | Rule | Enforced | Test |
|---|---|---|---|
| [ ] | Required fields per step (category-specific) | D UI | U E |
| [ ] | Reserve > 0; EMD > 0 | D A DB UI | U C |
| [ ] | End after start; start not in past at publish | D A DB UI | U C E |
| [ ] | Assurance only for eligible categories; requires agreement + evidence requirement met | D A UI | U C |
| [ ] | Publish blocked with specific reasons; drafts saved and editable | D A UI | U C E |
| [ ] | Status after publish reflects start time | D A | U C |
| [ ] | Seller cannot edit live lot / change reserve after first bid / alter bids / change winner | D A UI | U C |
| [ ] | Seller cannot touch another seller's lot | A UI | C |

### Transactions (§15, §20 Transactions)
| ✓ | Rule | Enforced | Test |
|---|---|---|---|
| [ ] | Won ≠ completed; completion needs balance paid, lifting confirmed, and (assured) accepted lifting check | D A | U C |
| [ ] | Every transition has one allowed role; others rejected with reason | D A UI | U C |
| [ ] | Invalid transition for current state rejected with reason | D A UI | U C |
| [ ] | Buyer proposes lifting date; seller confirms | D A UI | U E(A11) |
| [ ] | Payable = measured MT × winning price; reconcile vs balance paid | D | U |
| [ ] | Defaulted only by Ops after payment deadline (policy) | D A UI | U C |
| [ ] | Weighbridge (ticket, MT, file, time) and condition check are separate records + cards | D A UI | U E(A12) |
| [ ] | Measurement accepted only when all required fields present | D A UI | U |

### Lot Assurance claims (§16, §20 Assurance)
| ✓ | Rule | Enforced | Test |
|---|---|---|---|
| [ ] | Ineligible: standard lot → `not_assured` | D A UI | U C |
| [ ] | Ineligible: no valid winning transaction → `no_transaction` | D A | U |
| [ ] | Ineligible: lifting not started → `lifting_not_started` | D A UI | U |
| [ ] | Ineligible: within tolerance → `within_tolerance` | D A UI | U |
| [ ] | Ineligible: missing evidence → `evidence_required` | D A UI | U |
| [ ] | Ineligible: after loading complete → `window_closed` | D A UI | U |
| [ ] | Eligibility returns all failing reasons at once, each with a next step | D UI | U |
| [ ] | Classify: within tolerance → normal; clear exception → remedy; disputed → Ops | D | U |
| [ ] | Seller responds first: accept → remedy applied, resolved; dispute → Ops queue | D A UI | U C E |
| [ ] | Only Ops decides disputed claims; decision needs reason; records actor + timestamp | D A UI | U C E(C5) |
| [ ] | Remedy (D-008): price adjustment = (observed − tolerance) × measured MT × rate; exit = EMD + balance refunded (simulated) | D | U (CLM-1042-01 → ₹83,376) |
| [ ] | Track record updates after completion and claim resolution | D | U |
| [ ] | Policy per category, every entry `demo: true` | D | U |

### Edge states (§21)
| ✓ | State | Where | Test |
|---|---|---|---|
| [x] | No matching auctions | UI catalogue EmptyState + clear filters | E |
| [x] | No active bids / no transactions | UI buyer dashboard | E |
| [ ] | No seller listings | UI seller dashboard | E |
| [x] | No open claims | UI ops queue | E |
| [x] | Required field missing | UI Field + D validators | U E |
| [ ] | Invalid number / quantity / date | UI + D | U |
| [x] | Auction already closed / not started | UI BidPanel + D | U E |
| [x] | Outbid while bidding | UI BidDialog + D | U C (E in demo mode) |
| [x] | Below minimum increment | UI + D | U E |
| [x] | EMD not completed | UI EmdDialog + D | E |
| [~] | Evidence wrong type / too large / upload failed + retry | UI EvidenceUploader + A | U E (Storage upload in Phase 2) |
| [ ] | Listing cannot be published | UI preview + D | U E |
| [ ] | Duplicate submission | UI guard + A/DB | C |
| [x] | Transaction action not allowed in current state | UI disabled+reason + D | U E |
| [x] | Claim within tolerance / no evidence / after window | UI EligibilityChecklist + D | U E |
| [ ] | Unauthorised role access | UI guard page + A 401/403 | E C |
| [~] | Network/API failure; backend unavailable | UI ErrorState + fallback Banner | E (network ✓; real backend-down in Phase 2) |
| [ ] | Demo data unavailable (corrupt/missing storage) | UI → auto reset + Banner | E |

### Journeys (§22)
- [x] **A** (A1–A14 ✓ e2e in demo mode, both endings) A1 marketplace · A2 browse live · A3 open assured HMS lot · A4 declaration/evidence/rule/tolerance/remedy with trust tags · A5 EMD · A6 bid · A7 status · A8 Ops close · A9 transaction · A10 balance · A11 lifting · A12 weighbridge + condition · A13 complete or claim · A14 final state
- [~] **B** (B10 ✓ Phase 5; B1–B9 Phase 4) B1–B2 dashboard · B3–B4 wizard 1–2 · B5 evidence · B6 reserve + dates · B7 assurance policy · B8 preview + publish · B9 correct state · B10 status
- [x] **C** (✓ e2e: seeded CLM-1042-01 and a live claim) C1–C2 overview · C3 open CLM-1042-01 · C4 inspect · C5 decide · C6 status + audit across roles
- [x] Same transaction state in buyer, seller and Ops views
- [ ] Demo reset restores seed with fresh relative times

**Acceptance (§26)** — reported item by item in Phase 7.
