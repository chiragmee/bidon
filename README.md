# AuctionIT

A B2B marketplace for industrial scrap and surplus auctions, built around one idea:

> **The auction does not change. Lot Assurance makes the material, the measurement rule and the outcome if it differs clear — and AuctionIT handles exceptions without inspecting every lot.**

**Live site:** https://auctionit-sand.vercel.app (API: https://auctionit-api-vmo3.onrender.com/health). The free API instance sleeps when idle, so open the health link first; it takes up to a minute to wake.

**What isn't real yet** (details and exact missing dependencies: [docs/PRODUCTION_GAPS.md](docs/PRODUCTION_GAPS.md)): there is no password sign-in (sample accounts, any visitor can use any role); EMD, balance payments and refunds are recorded without moving money (no payment provider); business documents aren't checked (no KYC provider); tolerances and remedies are provisional. Seeded companies and lots are fictional and labelled "Sample data"; real registrations are not.

---

## Quick start (no database needed)

Requirements: Node 22+ (`.nvmrc` pins 24) and pnpm 11 (`corepack enable`).

```bash
pnpm install
pnpm dev            # web on http://localhost:3000, API on http://localhost:4000 (in-memory)
```

Open http://localhost:3000 and choose **Explore as Buyer / Seller / Operations** — one click, no signup. By default the web app runs in **browser demo mode**: the rules run in the browser and data is kept in this browser's localStorage. Tabs stay in sync, so you can keep a buyer tab and an Operations tab side by side.

### Demo accounts

| Role | Account | Use it for |
|---|---|---|
| Buyer | Rahul Sharma · Vardhan Infra Projects | Bidding (LOT-2025-0891), transactions TX-1038 / TX-1042 / TX-1045 |
| Seller | Suresh Agrawal · Shree Balaji Steels | Seller dashboard, listing wizard, confirming lifting (TX-1045), the claim on TX-1042 |
| Operations | Devendra Nath | Closing demo auctions, the disputed claim CLM-1042-01, marking TX-1035 defaulted |

Switch roles at any time from **"Viewing as …"** in the header. In browser demo mode the same menu has **Reset demo data**, which restores the starting sample data with fresh auction times. Presenter controls (reset, close an auction early, simulated failed EMD, Demo Mode pill) exist only in browser demo mode or with `NEXT_PUBLIC_DEMO_CONTROLS=true` / `DEMO_CONTROLS_ENABLED=true` — never on the live site (D-080).

---

## Demo mode vs real mode

| | Browser demo mode (default) | Real mode |
|---|---|---|
| Set by | `NEXT_PUBLIC_DATA_SOURCE=demo` | `NEXT_PUBLIC_DATA_SOURCE=http` + `NEXT_PUBLIC_API_URL` |
| Rules run in | the browser (`packages/domain`) | `apps/api` (same `packages/domain`) + Postgres functions for bids and auction close |
| Data lives in | localStorage, per browser | Supabase Postgres, shared by everyone |
| Evidence files | photos kept as small previews in the browser | Supabase Storage bucket `lot-media` |
| Reset | header → Reset demo data | only with presenter controls on, or `pnpm demo:reset` (replaces all data) |

The two modes cannot disagree: they call the same domain functions, and the contract suite runs one set of tests against both (see [Testing](#testing)). If real mode can't reach the API, the live site says **"Can't reach AuctionIT right now"** with a retry; it never shows browser sample data instead (D-081).

### Run real mode locally

Requires Docker (e.g. Colima) and the Supabase CLI.

```bash
supabase start                                   # local Postgres + Storage
cp apps/api/.env.example apps/api/.env           # then fill in from `supabase status`:
#   DATA_MODE=supabase
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   SUPABASE_URL=http://127.0.0.1:54321
#   SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>
pnpm db:reset                                    # apply migrations + load the seed
printf 'NEXT_PUBLIC_DATA_SOURCE=http\nNEXT_PUBLIC_API_URL=http://localhost:4000\n' > apps/web/.env.local
pnpm dev
```

Deploying to Supabase, Render and Vercel: see **[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## Architecture

```
apps/web         Next.js App Router + Tailwind (theme generated from DESIGN.md)  → Vercel
apps/api         Express + zod, role guards on every route, GET /health           → Render
packages/domain  Pure TypeScript: types, state machines, rules, demo policy, seed, read models
packages/client  DataSource interface + LocalDataSource (demo) + HttpDataSource (API)
supabase/        migrations: schema (RLS on), place_bid / close_auction functions, lot-media bucket
e2e/             Playwright: journeys A–C, rules, access, resilience, accessibility, design rules
scripts/         DESIGN.md → design tokens; demo-image manifest
```

```mermaid
flowchart LR
  UI[apps/web pages] --> DS{DataSource}
  DS -- demo --> L[LocalDataSource] --> D[packages/domain]
  DS -- http --> H[HttpDataSource] --> API[apps/api routes<br/>zod → role guard] --> S[DbService]
  S --> D
  S --> PG[(Postgres<br/>place_bid · close_auction)]
  S --> ST[(Storage lot-media)]
```

- **Every business rule lives once**, in `packages/domain`, as pure functions with unit tests.
- **The API** loads a snapshot, applies the same domain operation and writes only the rows that changed. Bids and auction closes go through row-locked Postgres functions, and all writes are serialised. The trade-offs and when to revisit them are in [ADR 0001](docs/decisions/0001-api-persistence-snapshot-diff.md). This design is right for a demo and not for production scale.
- **Identity** is a demo session (`role:userId`) that the API checks against the profiles table. Supabase Auth is not wired up (D-066).

Key documents: [docs/SPEC.md](docs/SPEC.md) (requirements) · [DESIGN.md](DESIGN.md) (design system) · [docs/PLAN.md](docs/PLAN.md) (screen map, rule/test matrix, §21 coverage) · [docs/DECISIONS.md](docs/DECISIONS.md) (every assumption) · [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) (10-minute walkthrough) · [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) (SPEC §26 report).

---

## Commands

```bash
pnpm install
pnpm generate       # DESIGN.md → tokens, demo-image manifest (dev/build/typecheck run it)
pnpm dev            # web :3000 + api :4000
pnpm typecheck
pnpm lint
pnpm test           # unit, API, role-security and contract tests
pnpm e2e            # Playwright, browser demo mode, at 1440px and 390px
pnpm e2e:http       # the same journeys against API + Postgres (API on :4000, web started in http mode)
pnpm build
pnpm db:reset       # supabase db reset (migrations) + seed — needs `supabase start`
pnpm demo:reset     # reseed the database; in browser demo mode use "Reset demo data" in the header
```

## Testing

- **Domain** (`packages/domain`): every rule and every rejection reason, about 230 tests.
- **Contract** (`apps/api/src/contract.test.ts`): one suite run against `LocalDataSource`, `HttpDataSource` → API → memory, and `HttpDataSource` → API → Postgres. It covers identical codes and wording, the journeys, 20 concurrent bidders and a 5× retry storm. The Postgres target runs when `supabase start` is up and is skipped otherwise, saying so.
- **Role security** (`apps/api/src/security.test.ts`): every route as guest, buyer, seller and Operations.
- **End to end** (`e2e/`): journeys A, B and C, bidding rules, page access by role, session recovery, axe accessibility, keyboard-only journeys, and design rules (one primary button per viewport, no "Verified", ₹ formatting, no horizontal scroll) — at desktop and phone widths. Any console error fails a test.

## Adding real photos

Put scrap photos in `apps/web/public/demo-images/` named like the seed expects (`hms-1.jpg` … `hms-6.jpg`, `copper-1.jpg`, …) and run `pnpm generate`. Until then, lots show a designed placeholder tile.
