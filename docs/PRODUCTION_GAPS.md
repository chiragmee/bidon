# Production gaps — demo artifacts audit (2026-10-15)

Scope: the live deployment (`NEXT_PUBLIC_DATA_SOURCE=http`, API `DATA_MODE=supabase`). Browser demo mode
(`NEXT_PUBLIC_DATA_SOURCE=demo`, local only) keeps its presenter controls on purpose.

Classes: **Ready** = production-ready, no change · **Demo-only** = must be corrected · **Partial** = specific gap ·
**Blocked** = external dependency or decision required.

## Inventory

| # | Functionality | Class | Evidence (files) | Minimum action |
|---|---|---|---|---|
| 1 | Data reset: "Reset demo data" in every header + `POST /demo/reset` enabled in production (`render.yaml` `DEMO_RESET_ENABLED=true`) | **Demo-only** (and a security hole: any visitor can wipe the live database) | `RoleSwitcher.tsx`, `routes.ts:163`, `env.ts`, `render.yaml` | One flag for presenter controls: API `DEMO_CONTROLS_ENABLED` (default **off** when `DATA_MODE=supabase`, so the live API locks without a dashboard change), web `NEXT_PUBLIC_DEMO_CONTROLS` (default off when `http`). Hide the menu item. |
| 2 | Ops "Close demo auction now" (lot page, Ops auctions table) | **Demo-only** | `LotDetail.tsx`, `OpsOverview.tsx`, `routes.ts:92` | Behind the same flag in UI and API. The real path already exists: lots close automatically at end time (`processDueClosures` on every read; `close_auction` in Postgres). |
| 3 | EMD "Simulate a failed payment" button + API accepting `outcome: 'failure'` | **Demo-only** | `EmdDialog.tsx`, `schemas.ts:16`, `routes.ts:83` | Behind the flag in UI and API. |
| 4 | Fallback to browser demo data when the API is unreachable ("Showing demo data") | **Demo-only** (shows fictional data as if it were the marketplace) | `data/index.tsx`, `Shells.tsx` | In `http` mode stay on the API; show "Can't reach Bid ON" with a retry. Views already have error-with-retry states. |
| 5 | "Demo Mode" pill in every header; page title "(demo)"; footer "Demo environment" notice and "support details will appear here (placeholder)" | **Demo-only** | `AppHeader.tsx`, `Feedback.tsx`, `layout.tsx`, `Shells.tsx` | Pill only with presenter controls; neutral title; footer states the real limits (payments not connected, sample records marked); placeholder removed. |
| 6 | New buyer/seller companies stored and shown as "Sample data" (`sample: true` hard-coded on registration and on DB read) | **Partial** — real registrations mislabelled as fictional | `operations.ts:252`, `listings.ts:192`, `db/mapping.ts:241`, `types.ts:22` | `sample: boolean`; registrations write `false`; DB mapping reads the column. Column already exists (`companies.sample`). No migration, no record changed. |
| 7 | "Sample data / Sample listing" captions shown on every dashboard, lot and transaction, and "Operations · Sample data" | **Partial** — caption is right for seeded records, wrong for real ones | `BuyerDashboard`, `SellerDashboard`, `LotDetail`, `LotSections`, `TransactionWorkspace`, `OpsOverview`, `workflowViews.ts` | Show the caption only when the record (or a party) is seeded; Ops metrics say "Includes sample data" only while seeded records exist. "Simulated — computed from demo data" → "Computed from platform records". |
| 8 | "demo" wording in copy and errors ("Continue as demo buyer", "Switch to the right demo account", "Sign in with the demo seller", "Your demo session isn't valid", "Explore as …" landing section "Demo access", catalogue overline "Sample listings") | **Demo-only** | `sign-in/page.tsx`, `access-denied/page.tsx`, `SessionLostDialog.tsx`, `RoleEntry.tsx`, `page.tsx`, `Catalogue.tsx`, `BidPanel.tsx`, dashboards, `routes.ts`, `LocalDataSource.ts`, `listings.ts`, `operations.ts`, `auction.ts`, `transaction.ts`, `assurance.ts`, `workflow.ts` | Reword to plain product language. Where behaviour is still not real (payments, no passwords, no KYC), say so plainly instead of saying "demo". |
| 9 | Verification status "Demo-approved (sample status)" on onboarding, dashboards and the lot's seller card | **Partial** — the status itself is honest (no KYC exists), the wording is demo | onboarding, `SellerDashboard`, `LotSections` | Label: "Documents not checked". Stored value `demo_approved` unchanged (DB enum; no migration). |
| 10 | "Just exploring? Use the sample account" shortcut on both onboarding forms | **Demo-only** | `BuyerOnboarding.tsx`, `SellerOnboarding.tsx` | Show only with presenter controls. |
| 11 | `/dev/components` component gallery reachable in production | **Demo-only** | `app/dev/components/page.tsx` | 404 unless presenter controls are on. |
| 12 | "Demo policy" caption on tolerances, remedies, EMD and deadline rules | **Blocked** (business decision: approved Lot Assurance / EMD terms) | `policy.ts` (`demo: true`), `Badge.tsx`, lot/claim/wizard copy | Keep the honesty; reword to "Provisional policy — not yet approved terms". Replace values when terms are approved. |
| 13 | Registration and login (one-click accounts, "Viewing as" switcher, no passwords; API trusts `x-demo-session` = role:userId after checking the profile exists) | **Blocked** — needs real authentication (D-066). Anyone can act as any account, **including Operations**. | `lib/session.ts`, `proxy.ts`, `routes.ts:23`, `RoleSwitcher.tsx` | Not faked. Decisions/config needed: enable Supabase Auth (email provider + SMTP sender, site URL/redirects), how existing accounts get credentials, how Operations users are provisioned, then swap the session header for a verified JWT. Copy now says plainly that password sign-in isn't available. |
| 14 | EMD, balance payment, refunds, forfeiture | **Blocked** — needs a payment provider (e.g. Razorpay/Cashfree) account, keys, webhook URL, and settlement/refund policy | `EmdDialog`, `TransactionWorkspace`, `operations.ts payEmd`, `workflow.ts` | Not faked. Records stay labelled "(simulated)"; no money moves. |
| 15 | Buyer/seller KYC and business verification | **Blocked** — needs a KYC/GST verification provider and the approval policy | onboarding, `types.ts verification` | Not faked; status reads "Documents not checked". |
| 16 | Seeded fictional companies, lots, bids, claims in the production database | **Blocked** — removing them is a production-data decision (rule 5) | `seed.ts`, Supabase tables | Left in place and still labelled "Sample data". Decide: keep as showcase, or wipe before real users. |
| 17 | Seeded lot photos (`/demo-images/*`, files not present → designed placeholder tile) | **Blocked** (needs real photos) — placeholder is honest | `LotImage`, `public/demo-images` | No change. Seller-uploaded photos go to Supabase Storage (real). |
| 18 | Auction closure + winner selection | **Ready** (lazy: closes on the first request after end time; Postgres `close_auction`, stored-bid winner, reserve check) | `processDueClosures`, `close_auction` SQL, contract tests | No change. Note: with no traffic, closure notifications wait for the next request (no scheduler on the free plan). |
| 19 | Bidding, reserve, increments, EMD gate, own-lot block, idempotency | **Ready** | `place_bid` SQL, domain `auction.ts`, contract 51×3 | No change. |
| 20 | Listings: wizard, autosave, evidence upload (Supabase Storage), preview, publish | **Ready** | `listings.ts`, `storage.ts`, journey-b (demo + http) | No change. |
| 21 | Post-auction: balance (simulated, see 14), lifting propose/confirm, weighbridge, condition check, completion, default | **Ready** apart from 14 | `workflow.ts`, journey-a-post (demo + http) | No change. |
| 22 | Lot Assurance claims: eligibility, seller response, Ops decision, audit trail, track record | **Ready** (values provisional, see 12) | `assurance.ts`, `workflow.ts`, operations spec | No change. |
| 23 | Role guards (web proxy + every API route) | **Ready** as authorisation; authentication is item 13 | `proxy.ts`, `routes.ts`, security 111 tests | No change. |
| 24 | Notifications (in-app) | **Ready** (in-app only; no email/SMS — not in scope) | `NotificationBell`, `notifications` table | No change. |

## Blocked — what exactly is missing

1. **Authentication** — Supabase Auth configuration on project `qainjxytjilrgajndogv` (email provider, custom SMTP for production mail, site URL `https://auctionit-sand.vercel.app`), a decision on credentials for the 11 seeded accounts and on who may hold the Operations role. Until then the live site is open: any visitor can act as any role.
2. **Payments** — payment-gateway merchant account + API keys + webhook secret, and the EMD/refund/forfeiture settlement policy.
3. **KYC / business verification** — provider choice + credentials, and the approval rule (block bidding until verified or not).
4. **Approved Lot Assurance and EMD terms** — tolerances, remedies, deadlines (`packages/domain/src/policy.ts`).
5. **Seeded data in production** — keep or remove.
6. **Support contact details** — none supplied, so the footer no longer shows a placeholder.

Also under #13: a person who registers is signed in on that browser only. Once they switch account or the
cookie expires (8 h), nothing lets them sign back in to their own account. Real authentication fixes this.

## Changes made (2026-10-15)

D-080 to D-086 in `docs/DECISIONS.md`. Items 1–11 fixed as listed. Items 12–17 kept honest and documented,
not faked. Items 18–24 unchanged.

## Checks run (targeted)

- `pnpm typecheck`, `pnpm lint`: pass. Production web build with the Vercel env (`http`, Render API URL): pass.
- Domain 228/228 (updated: real registrations not sample; Ops metric captions; timeline label).
- API 173/173: the contract suite on all three targets (in-browser rules, API + memory, API + local Postgres),
  including a new check that a registration reads back from Postgres as `sample=false`; the security suite,
  including new checks that presenter controls are refused under the live configuration.
- Web unit 5/5, scripts 18/18.
- Playwright, browser demo mode, affected specs at 1440 and 390 px (onboarding, access, journeys A and B,
  operations, resilience, demo script, design rules): 89 passed, 1 skipped by design.
- Playwright `e2e/live-config.spec.ts` against the live configuration (web `http` with presenter controls off,
  API with `DEMO_CONTROLS_ENABLED=false`), at both widths: 12/12. It checks: no Demo pill or demo wording on
  the landing and sign-in pages; no Reset in the account menu; no simulated payment failure; no early close;
  `/dev/components` returns 404; the API refuses reset and early close; an unreachable API shows an error,
  not sample data.
- Not re-run: the full `pnpm e2e` and `pnpm e2e:http` suites (rule 4). No production data was touched.

## Update — Phase 1 MVP (2026-10-15, docs/PHASE1_MVP.md)

| # | Was | Now |
|---|---|---|
| 13 Authentication | Blocked | **Implemented**: Supabase Auth sign-up / verify / sign-in / reset, server-verified tokens, roles from the profile row, no role switching, reviewers by admin script. **Still needs live configuration** (Auth settings, custom SMTP, two Vercel env vars) — PHASE1_MVP.md "Configuration". |
| 14 Payments | Blocked (simulated) | **Offline payments implemented**: buyer reports, seller confirms/rejects, refunds recorded by the seller, full history. No money moves through Bid ON; a gateway stays Phase 2. |
| 15 KYC | Blocked | **Manual eligibility review implemented** (application, private documents, reviewer decision, gates). A KYC provider stays Phase 2; phone OTP needs an SMS provider. |
| 16 Seeded data | Blocked (decision) | **Hidden on the live site** by an API view filter; rows untouched (no production data changed). |
| 1–3 Presenter controls | Off by default | Now also **impossible against a non-local database**, whatever the env says; reseed script refuses non-local databases. |
| 12 Policy values | Provisional | Unchanged — business decisions listed in D-097. |
