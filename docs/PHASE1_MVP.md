# Phase 1 MVP — remaining features (2026-10-15)

Scope: the user's brief "Implement Only the Remaining Phase 1 MVP Features". This file records the classification, the
design chosen, and the provisional business decisions (also logged in `docs/DECISIONS.md` D-087 onward).

## Classification (from the code, not the plan)

| Requirement | State before this work | Evidence |
|---|---|---|
| Catalogue, lot detail, bidding UI, bid rules, reserve, winner, `place_bid` / `close_auction` | **Working and complete** | domain `auction.ts`, SQL functions, contract suite on 3 targets |
| Seller listing wizard, drafts, publish, media storage | **Working and complete** | `listings.ts`, journey B |
| Transaction timeline, lifting, weighbridge, completion | **Working and complete**; non-assured lots already skip the condition check (`transaction.ts` → `material_checked` when `!assurance.enabled`) | `applyTransition` |
| Lot Assurance (claims, Ops decisions) | **Working**, optional per lot | `assurance.ts` |
| Sample data hidden from real users | **Partial**: labelled, not excluded | D-082 |
| Production demo controls | **Partial**: off by default (D-080), but an env var could switch them on against production | `env.ts` |
| Browser sample-data fallback | **Complete** for the live site (D-081) | `data/index.tsx` |
| Authentication (sign-up, verification, login, logout, reset, sessions, server-side identity) | **Missing** — `x-demo-session: role:userId` header, unauthenticated | `routes.ts session()` |
| Role separation | **Demo-only / unsafe** — one-click switcher, any visitor can be Operations | `RoleSwitcher`, sign-in page |
| Buyer / seller eligibility review | **Missing** — every registration active at once (`demo_approved`) | `registerBuyer`, `registerSeller` |
| Duplicate / cross-role accounts | **Partial** — email unique only; seller phone validated then discarded | `profiles_email_key`, `registerSeller` |
| EMD | **Demo-only** — client says "success", record created as paid | `payEmd(outcome)` |
| Winning-balance payment | **Demo-only** — one click marks the balance paid | `pay_balance` |
| Refund tracking | **Demo-only** — EMDs flip to `refunded` automatically on close | `close_auction` |
| Private document storage | **Missing** — only the public `lot-media` bucket | `storage.ts` |

## Design (keeps the existing architecture)

**Rules stay in `packages/domain`**, run by both the browser demo store and the API (snapshot → operation → row diff).
`place_bid` and `close_auction` in Postgres are updated to match.

### Identity
- Supabase Auth (email + password, email verification, password reset) in the web app via `@supabase/ssr` (session in
  cookies, refreshed automatically). The API accepts `Authorization: Bearer <access token>`, verifies it with
  Supabase Auth (`auth.getUser`, cached briefly), and looks up the **profile by `auth_user_id`**. Role comes from
  the profile row, never from the request.
- Sign-up offers **Buyer or Seller** only. The role is fixed when the profile is created (`/onboarding/buyer|seller`,
  one profile per auth user, email taken from the verified token). There is no role switching.
- Operations (eligibility reviewer, claims) is never offered at sign-up: `pnpm --filter @auctionit/api grant:reviewer
  <email>` links an existing verified auth user to a new `ops` profile. Run by an administrator with database access.
- The role is copied to Supabase `app_metadata` (server-only) so the Next.js route guard can redirect by role
  from the verified JWT; the API still decides from the profile row.
- The demo session header and the one-click sample accounts remain **only with presenter controls**, which are now
  hard-disabled whenever the API's database is not local (env alone can't enable them against production).

### Eligibility (manual review, no KYC provider)
- Company status: `incomplete → pending_review → approved | needs_info | rejected` (`needs_info` can resubmit).
  Seeded companies keep `demo_approved` (treated as approved; they are sample records, hidden in production).
- Application: entity type, legal name, PAN, GSTIN, CIN/LLPIN, registered address, authorised representative,
  account phone; sellers also a declaration of authority to sell + yard/premises evidence + bank details for
  receiving EMD and payments. Required documents depend on entity type and role (`kycPolicy.ts`, provisional).
- Documents go to the **private** bucket `account-documents`; the API returns short-lived signed URLs only to the
  owner, a reviewer, or (payment receipts) the counterparty seller.
- Reviewer page `/ops/eligibility`: queue, application, documents, possible duplicates by name (flag only),
  decision with reason; reviewer id and time recorded.
- Gates: only approved buyers submit EMD and bid; only approved sellers publish. Pending buyers can browse.

### Duplicates
- Email: Supabase Auth + `profiles` unique. Phone: normalised `+91XXXXXXXXXX`, unique across profiles.
  PAN and GSTIN: unique across **all** companies (buyer or seller), enforced in the domain and by unique indexes, so
  the same legal entity cannot hold a buyer and a seller account. Same legal name → flagged to the reviewer only.
- Refusals never reveal the other account: "These business details are already registered with AuctionIT."

### Payments (offline, recorded and confirmed)
- EMD: buyer submits method, amount, date, UTR/reference, payer name, optional receipt → `submitted`.
  The lot's seller confirms (`confirmed`, bidding allowed) or rejects with a reason (`rejected`, buyer corrects and
  resubmits; the earlier submission stays in the history). On close, losing bidders' confirmed EMDs become
  `refund_due`; the seller records the refund (amount, date, reference) → `refunded`.
- Balance: same pattern on the transaction (`submit_balance_payment` → seller `confirm_balance_payment` moves
  `won_awaiting_balance → balance_paid`, or `reject_balance_payment`). The status machine is unchanged.
  Ops cannot mark a default while a reported payment awaits the seller.
- Refunds on a transaction (exit remedy, measured quantity below the paid amount) are recorded by the seller.
- Payment instructions shown to approved buyers come from the seller's bank details in their application.
- No simulated-success path remains anywhere (demo mode uses the same submit/confirm flow).

### Sample data in production
- The API hides companies marked `sample` and everything belonging to them unless the database is local
  (`SAMPLE_DATA_VISIBLE` can only hide, never show, on a remote database). Rows are not deleted.

## What was built (2026-10-15)

| Area | Result | Where |
|---|---|---|
| Sign-up / verify email / sign-in / sign-out / forgot + reset password | Supabase Auth in the web app (`@supabase/ssr`, cookie session refreshed by the route guard); `/sign-up` offers Buyer or Seller only | `apps/web/src/components/auth/AuthForms.tsx`, `app/auth/confirm/route.ts`, `src/proxy.ts`, `lib/supabase/*` |
| Server-side identity | API verifies the bearer token with Supabase Auth and loads the profile by `auth_user_id`; the role comes from the row; one profile per sign-in; role fixed; `x-demo-session` honoured only with presenter controls on a local database | `apps/api/src/routes.ts` (`session`, `register`), `services/supabase.ts` |
| Reviewer (Operations) accounts | `grant:reviewer` admin script only; never at sign-up | `apps/api/src/db/grantReviewer.ts` |
| Eligibility | Application, private documents, submit, review (approve / needs info / reject with reason, reviewer and time), status + next action; gates on EMD, bid (domain **and** `place_bid`) and publish | `packages/domain/src/eligibility*.ts`, `/account`, `/ops/eligibility` |
| Duplicates | Email, phone, sign-in unique; PAN/GSTIN unique across roles among applications under review or approved (domain + partial unique indexes); similar names flagged to reviewers | `operations.ts accountIdentityProblem`, `eligibility.ts`, migration `…000002` |
| EMD | Report → seller confirm/reject (reason) → resubmit; history; refunds recorded by the seller; payment instructions from the seller's bank details | `packages/domain/src/payments.ts`, `EmdDialog`, `seller/EmdPanel` |
| Balance | Same pattern on the transaction; status moves to `balance_paid` only when the seller confirms; no default while a report is pending; refunds after measurement or exit recorded by the seller | `transaction.ts`, `TxPanels.tsx` (`BalancePanel`, `RefundPanel`) |
| Ordinary (non-assured) sale | Verified end to end without any Lot Assurance step | contract test "an ordinary (non-assured) sale…" |
| Production safeguards | Presenter controls and the demo header require a local database whatever the env says; reseed script refuses non-local databases; sample records hidden from every API view on a non-local database (rows untouched) | `apps/api/src/env.ts`, `db/reseed.ts`, `packages/domain/src/samples.ts`, `db/repo.ts withWrite(view)` |
| Defects fixed on the way | Unsold auctions left confirmed EMDs as paid (now owed back) · seed shared its company/user objects between calls · local data source ordered same-time notifications differently from Postgres · sign-out raced the session listener · role-specific pages queried as the new role during a presenter switch | D-091, `seed.ts`, `LocalDataSource.ts`, `SessionProvider.tsx` |

## Live status (2026-10-15, after the user said go)

Done: step 1 (both migrations applied to `qainjxytjilrgajndogv`; the old API kept answering), step 3 (Vercel `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Production + Preview), step 4 (pushed 94b9c48; Render and Vercel deployed). Verified live: API refuses reset (403), the sample-account header (401), the email probe (403), forged tokens and sign-up without sign-in; no sample lots served; web shows the password sign-in, Buyer/Seller-only sign-up, no demo controls, `/dev/components` 404, protected pages redirect to sign-in; no console errors at 1440 and 390. No account was created on the live site.
**Not done:** step 2 (Supabase Auth settings — reading the CLI's login token was blocked by the permission policy, so it's for the owner in the dashboard; SMTP needs provider credentials) and step 5 (needs a real reviewer to sign up first).

## Configuration and migrations the live site needs

Order matters: 1 → 2 → 3 → push code → 5.

1. **Migrations** (additive; safe for the currently deployed API, which ignores the new columns and whose `place_bid` calls keep working): `supabase link --project-ref qainjxytjilrgajndogv && supabase db push` — applies `20261016000001_phase1_accounts_payments.sql` and `20261016000002_phase1_functions.sql`.
2. **Supabase Auth** (dashboard → Authentication): Email provider on, **Confirm email on**; Site URL `https://auctionit-sand.vercel.app`; Redirect URLs `https://auctionit-sand.vercel.app/**`; minimum password length 8; **custom SMTP sender** (Supabase's built-in mailer only delivers to the project's team members and a few emails an hour — real users won't receive verification or reset emails without it). Optional: email templates using `{{ .TokenHash }}` links to `/auth/confirm?token_hash=…&type=…` so links work on a different device.
3. **Vercel env** (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL=https://qainjxytjilrgajndogv.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>`. Without them the live sign-in page says sign-in isn't available. **Render: no change** — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set and now also verify tokens and sign private-document links; the leftover `DEMO_RESET_ENABLED` is ignored.
4. Push to `main` (Vercel and Render auto-deploy).
5. **First reviewer**: they sign up and verify their email, then an administrator runs `DATABASE_URL=<live session-pooler URL> pnpm --filter @auctionit/api grant:reviewer <email> "<name>"`.

## Checks run

- `pnpm typecheck`, `pnpm lint`: pass. Production web build with the live env shape: pass.
- Unit/API: domain 256/256 · API 243/243 (contract 23 tests × 3 targets including local Postgres; security matrix with the new routes and the sign-in/role tests; `live.test.ts` against Postgres) · web 5/5 · scripts 18/18.
- Playwright, browser demo mode, 1440 + 390: 193 passed, 21 skipped by design.
- Playwright `e2e:http` (API + local Postgres, presenter controls on): 91 passed, 16 skipped by design.
- Playwright against **local Supabase Auth + mail catcher**, live configuration (`e2e/auth.spec.ts`, `e2e/live-config.spec.ts`), 1440 + 390: 22/22 — sign-up and email verification, onboarding with the verified email, session kept across reloads, role guards, private document upload and a signed link that serves the file, reviewer invited by the script, emailed about the new application (D-101) and approving, sign-out, wrong password, forgotten password → reset → sign-in.
- Not checked against the live Supabase project, Vercel or Render (nothing deployed; production reads were not available).

## Still blocked or deferred

- **Email delivery for real users** — needs a custom SMTP provider (credentials) on the live Supabase project (step 2).
- **Phone verification** — numbers are unique and normalised but not OTP-verified (needs an SMS provider; reviewers see them marked unverified).
- **Policy decisions** (D-097): EMD deadline, forfeiture and refund timelines, the final KYC document list per entity type, GST/TCS handling. Values are provisional and in one place (`policy.ts`, `eligibilityPolicy.ts`).
- **Accounts created before sign-in existed** on the live database have no sign-in and can't be reached; if any are real, they need a decision (invite them to sign up again, or link by email with an admin script).
- **Phase 2, untouched:** payment gateway, KYC provider, logistics/FleetX, vehicle tracking, weighbridge hardware, escrow/settlement, Lot Assurance expansion, buyer scoring/recommendations.
