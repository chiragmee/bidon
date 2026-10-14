# AuctionIT — project guide for Claude Code

AuctionIT is a working demo of a B2B marketplace for industrial scrap and surplus auctions, built to show the CEO and COO one idea: **the auction does not change; Lot Assurance makes the material, the measurement rules and the outcome if it differs clear — and AuctionIT handles exceptions without inspecting every lot.**

## Sources of truth

| File | What it decides |
|---|---|
| `docs/SPEC.md` | Product requirements. Referenced as §N. |
| `DESIGN.md` | Design system: tokens and visual rules. Wins over SPEC §5 on any visual conflict. |
| `design/stitch/` | Approved screen designs. Match their layout, hierarchy and copy; if a colour differs from DESIGN.md, DESIGN.md wins. |
| `docs/PHASES.md` | The 7 build phases. When asked to "Run Phase N", do exactly that phase, then stop. |
| `docs/PLAN.md` | Living build plan, screen map and use-case checklist. Keep it current. |
| `docs/DECISIONS.md` | Every assumption or policy you had to invent, one line each. |

## Architecture (pnpm monorepo, TypeScript strict)

```
apps/web        Next.js App Router + Tailwind (theme generated from DESIGN.md) → Vercel
apps/api        Express + zod, central error handler, GET /health → Render
packages/domain Pure TS, no I/O: types, state machines, rules, policy, formatters, seed data
supabase/       migrations/*.sql, seed, Postgres functions place_bid and close_auction
e2e/            Playwright journeys A, B, C (SPEC §22)
scripts/        tokens.ts (DESIGN.md → CSS variables + Tailwind preset), reset scripts
```

**Why `packages/domain`:** every business rule lives once, as pure functions with unit tests. The API and the web demo adapter both call it, so demo mode and real mode cannot disagree.

**Data access in the web app** goes only through a `DataSource` interface with two implementations:
- `HttpDataSource` — calls `apps/api` (which uses Supabase server-side).
- `DemoDataSource` — in-browser, uses `packages/domain` and the shared seed, persisted to localStorage, resettable.

Chosen by `NEXT_PUBLIC_DATA_SOURCE=http|demo`. If the API is unreachable, fall back to demo **with a visible banner** — never silently.

## Business invariants — enforce in domain, API and DB

**Auctions**
- Only Live lots accept bids; never before start or after end (server time is authoritative).
- Minimum next bid = current highest (or reserve/start price if none) + configured increment.
- Bid requires a recorded EMD for that buyer and lot. A seller can never bid on their own lot.
- Duplicate or stale submissions are rejected (client request id + row lock).
- On close, the winner is the highest stored bid that meets the reserve; otherwise the lot is Unsold. Never hard-code a winner.
- Lifecycle: Draft → Scheduled → Live → Closed (reserve met | reserve not met) → Awarded. Scheduled → Live and Live → Closed happen automatically at start and end time; Operations can close a demo auction early.

**Listings**
- Publish only when complete and valid: reserve > 0, end > start, category fields filled, and, if assured, the category's evidence requirement met.
- Sellers cannot edit live lots, change the reserve after bidding starts, alter bids, or change winners.

**Transactions** (SPEC §15 states)
- Winning ≠ completed. Completion requires balance paid (simulated), lifting scheduled and confirmed, and, for assured lots, an accepted lifting check.
- Invalid transitions are rejected with a reason. Only the assigned role can take each action.
- Payable = measured quantity × winning price per MT.
- Lifting: buyer proposes a date, seller confirms it.
- Defaulted: only when the payment deadline (demo policy) passes; marked by Operations.

**Lot Assurance**
- Only assured lots (pilot: ferrous / mixed steel) can enter the claim flow.
- Weighbridge measurement and visual condition check are separate records and separate UI.
- Claim eligibility (SPEC §16.3) returns specific failing reasons, never a bare "not allowed".
- Outcomes: within tolerance → normal completion; clear exception → configured remedy; disputed → Operations.
- Seller responds first (accept or dispute with evidence). Only Operations decides disputed claims; every decision records actor, reason and timestamp.
- Seller track record (completed sales, resolved claims) updates after every completion and claim resolution.
- Tolerances, remedies and EMD rules live in `packages/domain/policy.ts`, per category, flagged `demo: true`.

## Demo data

- One seed (`packages/domain/seed.ts`) feeds both Supabase and demo mode.
- All seeded dates are relative to the moment of reset, so Live lots are live on any day.
- Real scrap photos go in `apps/web/public/demo-images/`; without them, use the designed fallback tile.

## Honesty rules

- Never show "Verified", "Guaranteed" or "Certified" unless that step really happened.
- All payments, EMD and refunds are simulated and labelled so. No real payment SDKs.
- Seeded companies, ratings and metrics are labelled "Sample data". Never present them as real.
- Never show success unless the server (or domain, in demo mode) confirmed it.
- Never claim something is deployed unless you deployed it and `/health` answered.

## UI rules (summary of DESIGN.md — read the full file)

- One `action`-filled primary button per viewport. `action-accent` is never text.
- Every fact on an assured lot carries a trust tag: Seller declared / Evidence attached / Confirmed at lifting.
- Money via one `formatINR` helper: ₹ with Indian grouping, `/MT` on rates, `~` on estimates, tabular figures.
- Every data view has loading skeleton, empty state and error-with-retry. Errors answer: what happened, what it means, what to do next.
- Consequential actions (bid, payment, Ops decision) confirm in a dialog. Toasts only for brief confirmations; outcomes also appear on the page.
- Works at 1440px and 390px with no horizontal scroll. Visible focus rings, labelled inputs, `aria-live` for bid results.
- Demo Mode pill in every header; demo-only actions use the dashed demo button.

## Roles

Guest, Buyer, Seller, Operations. One-click demo entry for each (seeded accounts, no signup), plus a role switcher and "Reset demo data" in the header on every page. Guard routes in the web app **and** every API route; buyers never reach `/seller`, sellers never touch another seller's lot, only Operations reviews claims or closes demo auctions.

## Commands (keep this list accurate)

```
pnpm install
pnpm generate       # DESIGN.md → tokens, demo-image manifest (dev/build/typecheck run it)
pnpm dev            # web :3000 + api :4000
pnpm typecheck
pnpm lint
pnpm test           # unit + contract
pnpm e2e            # Playwright journeys
pnpm build
pnpm db:reset       # migrations + seed (Supabase) — arrives in Phase 2
pnpm demo:reset     # demo mode: explains in-app "Reset demo data" (data lives in each browser)
```

## Definition of done (every change)

1. `typecheck`, `lint`, `test` pass; the affected Playwright journey passes.
2. No console errors; screen checked at 1440 and 390.
3. The matching items in `docs/PLAN.md` are ticked; new assumptions logged in `docs/DECISIONS.md`.
4. No secrets committed; `.env.example` updated when a variable is added.

## Working style

- Make reasonable decisions without asking; record them in `docs/DECISIONS.md`.
- Small, focused commits with clear messages.
- Cut scope rather than ship something half-working. A complete core journey beats many partial features.
- If credentials are missing (Supabase, Render, Vercel), use the demo path, say exactly what manual setup remains, and move on.
- End each phase with a short report: done, decisions, gaps, next.
