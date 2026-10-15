# SPEC §26 — acceptance report

Status as of 2026-10-15, checked from a **clean clone** (`git clone` → `pnpm install --frozen-lockfile` → typecheck, lint, test, build, e2e).

| Result | Count |
|---|---|
| Typecheck · lint · build | pass |
| Unit + API + role-security + contract tests | 418 pass (domain 228 · API 167, incl. contract 51×3 targets and security 111 · scripts 18 · web 5) |
| End-to-end, browser demo mode, 1440px + 390px | 185 pass, 1 skipped by design (the demo-script test runs at laptop width only) |
| End-to-end against API + Postgres (`pnpm e2e:http`, Phase 6) | 86 pass, 6 skipped (browser-only failure injection; covered by contract tests) |

Every test fails on any console error and on horizontal page scroll.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | A guest can browse lots and open a meaningful lot detail page | **Pass** | e2e `journey-a` steps 1–4 as a guest; catalogue filters and empty state; lot page with assurance summary, evidence, seller track record (`catalogue`, `a11y`) |
| 2 | A buyer can enter the demo, simulate EMD, place a bid and see the result | **Pass** (revised 2026-10-15, Phase 1 MVP: the EMD is now paid offline, reported by the buyer and confirmed by the seller before bidding — `journey-a`, contract suite) | One-click "Explore as Buyer"; EMD failure and success; bid with confirm; "Bid placed" announced (aria-live) and shown as Leading; dashboard updated (`journey-a`, `demo-script`, keyboard-only test) |
| 3 | The auction can be closed and the actual winning bid is selected from stored bids and the reserve | **Pass** | Ops "Close demo auction"; `close_auction` (Postgres) and `closeAuction` (domain); contract: an expired lot closes on read with the stored-bid winner on all three targets; unsold when no bid meets the reserve |
| 4 | A winning buyer can complete the simulated post-win steps and track lifting | **Pass** (revised: the balance is reported by the buyer and confirmed by the seller; refunds recorded by the seller — `journey-a-post`) | `journey-a-post` complete branch: balance (simulated) → buyer proposes lifting → seller confirms → checks → complete; stepper and timeline, in demo and against Postgres |
| 5 | An assured transaction can record a quantity/condition check | **Pass** | Separate weighbridge and condition cards with uploads; payable recalculated from measured MT; contract `incomplete_measurement`; Storage uploads verified in `e2e:http` |
| 6 | An eligible claim can be submitted with evidence | **Pass** | Claim form with live eligibility checklist (six rules, each with its reason); `journey-a-post` claim branch; contract: every refusal reason |
| 7 | Operations can review and resolve a disputed claim | **Pass** | Seller disputes → Ops queue → three-column review → reasoned decision with actor and time → audit trail (`operations`, `journey-a-post`, keyboard-only journey C) |
| 8 | A seller can create, preview and publish an auction listing | **Pass** | `journey-b` 1–9: four-step wizard with autosave, evidence checklist, invalid dates blocked, assurance agreement, preview with blockers, publish; appears in the buyer catalogue |
| 9 | The same listing and transaction state is reflected across roles | **Pass** | e2e checks one transaction's final state as buyer, seller and Ops; seller's new lot visible to buyers; contract suite: same results from browser demo and API |
| 10 | Invalid actions are blocked with clear explanations | **Pass** | Every rejection carries what happened and what to do next; contract checks codes and wording; API role matrix (401/403) and page access matrix; design check: disabled buttons explain why |
| 11 | Demo data is visibly labelled | **Pass** (revised 2026-10-15, D-080–D-085: the live site drops the pill and demo wording; seeded records keep "Sample data", real registrations don't; payments keep "(simulated)"; see docs/PRODUCTION_GAPS.md) | In browser demo mode: Demo Mode pill in every header; "Sample data" on companies, dashboards and listings; "(simulated)" on every payment and refund; "Demo policy" on tolerances; "Simulated" metrics beside the case-study baseline; automated check for "Verified/Guaranteed/Certified" on 25 routes |
| 12 | The core journey works without real payment credentials | **Pass** (revised: offline payments with seller confirmation; no gateway) | No payment SDK anywhere; EMD, balance and refunds are simulated records; browser demo mode needs no backend at all |
| 13 | The application builds and runs without known blocking errors | **Pass** | Clean-clone run above; dev and production builds; no console errors in any e2e |
| 14 | README and deployment instructions are present | **Pass** | `README.md`; `docs/DEPLOY.md` (Supabase → Render → Vercel with exact variables and checks); `render.yaml`; `docs/DEMO_SCRIPT.md` (verified by e2e) |

## Not done here

- **Deployment — done 2026-10-15.** Web: https://auctionit-sand.vercel.app (Vercel project `auctionit`, root `apps/web`, auto-deploys from `main`). API: https://auctionit-api-vmo3.onrender.com (Render `srv-db85cv689jmc73c9ird0`, free plan, `/health` → `mode: supabase`). Database and storage: Supabase project `auctionit` (`qainjxytjilrgajndogv`, ap-south-1), migrations applied, seeded, `lot-media` bucket present. Verified live: buyer EMD and bid on desktop seen by a guest on a phone-sized browser, CORS limited to the Vercel origin, no console errors; data reset afterwards.
- **Real authentication.** Demo sessions only (D-066). Supabase Auth is the next step before any real use.
- **Scale.** The API loads the whole dataset per request and serialises writes. That's right for a demo, not for production (ADR 0001 says when and how to change it).
- **Real photos.** Lots show designed placeholder tiles until photos are added to `apps/web/public/demo-images/`.

## Phase 1 MVP (2026-10-15)

Real sign-in, eligibility review, offline payments and production safeguards: results and checks in [PHASE1_MVP.md](PHASE1_MVP.md). Test counts now: domain 256 · API 243 · web 5 · scripts 18 · e2e demo mode 193 (+21 skipped by design) · `e2e:http` 91 (+16) · `e2e:live` (local Supabase Auth) 20.
