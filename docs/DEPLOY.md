# Deploying AuctionIT

**Current deployment (2026-10-15):** web https://auctionit-sand.vercel.app · API https://auctionit-api-vmo3.onrender.com (Render `srv-db85cv689jmc73c9ird0`) · Supabase project `auctionit` (`qainjxytjilrgajndogv`, ap-south-1). The production secrets live only in Render's environment and in the gitignored `apps/api/.env.production` on the deploying machine.

Three pieces, deployed in this order:

1. **Supabase** — Postgres (schema, functions, seed) and Storage (`lot-media`).
2. **Render** — the API (`apps/api`).
3. **Vercel** — the web app (`apps/web`).

Nothing here is deployed automatically. Each step ends with a check; don't call a step done until its check passes.

---

## 1. Supabase (database + storage)

1. Create a project at supabase.com (region: **Mumbai (ap-south-1)** keeps latency low for Indian users). Save the database password.
2. From the repo root, link and apply the migrations:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This creates every table (RLS enabled, no policies), the `place_bid` / `close_auction` / `next_id` / `format_inr` functions and the public-read Storage bucket **`lot-media`**.
3. Get a connection string: **Project Settings → Database → Connection string → Session pooler** (port 5432, IPv4 — Render reaches it; the direct connection is IPv6-only). The transaction pooler (port 6543) also works: the API turns prepared statements off for it automatically.
4. Load the sample data:
   ```bash
   DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' \
     pnpm --filter @auctionit/api db:seed
   ```
   **Check:** it prints `Seeded 20 lots (dates relative to …)`.
   *Since D-093 the seed script refuses any non-local database — the live project was seeded once at launch and its sample records are now hidden from real users. A new project starts empty.*
5. From **Project Settings → API**, note the **Project URL** and the **service_role** key. The service-role key is server-only: it goes on Render and nowhere else.

## 2. Render (API)

Use the Blueprint in [`render.yaml`](../render.yaml): **New → Blueprint → select this repo**. It creates `auctionit-api` with:

| Setting | Value |
|---|---|
| Build command | `corepack enable && pnpm install --frozen-lockfile` |
| Start command | `pnpm --filter @auctionit/api start` |
| Health check path | `/health` |
| Node | 24 (`NODE_VERSION`) |

Set these environment variables (Render supplies `PORT` itself):

| Variable | Value |
|---|---|
| `DATA_MODE` | `supabase` |
| `DATABASE_URL` | the Session pooler string from step 1.3 |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
| `ALLOWED_ORIGINS` | your Vercel URL(s), comma-separated, e.g. `https://auctionit.vercel.app` — exact origins, no trailing slash |
| `DEMO_CONTROLS_ENABLED` | leave **unset** on the live site (defaults to off with `DATA_MODE=supabase`). `true` only for a private presenter/staging copy: enables data reset, early close and the simulated failed EMD (D-080) |

**Check:** `curl https://<service>.onrender.com/health` returns `{"status":"ok","mode":"supabase",…}`. If `mode` says `demo`, `DATA_MODE` or `DATABASE_URL` is missing.

> **Free plan sleeps** after ~15 minutes idle and takes up to a minute to wake. If the web app loads while the API is asleep, it shows **"Showing demo data"** with a **"Try the live backend again"** button. Before a meeting, open `/health` once to wake it, or use a paid instance.

## 3. Vercel (web)

**New Project → import this repo**, then:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` (keep "Include files outside the root directory" on — the app imports `packages/*`) |
| Framework | Next.js (detected) |
| Install / Build | defaults (pnpm is detected from the root lockfile; design tokens are committed, so `next build` needs no extra step) |

Environment variables (Production and Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | `http` (or `demo` to run without the backend) |
| `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com` — no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` — real sign-in |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon (or publishable) key — public by design; never the service-role key |

`NEXT_PUBLIC_*` values are built into the browser bundle, so never put a secret in them. Redeploy after changing them.

**Then** add the Vercel URL to `ALLOWED_ORIGINS` on Render (step 2) and redeploy the API. Preview deployments have their own URLs; add them too if you use them.

**Check:** open the Vercel URL. There should be **no** "Showing demo data" banner. Explore as Buyer → open LOT-2025-0891 → pay EMD → bid. Then open the same lot in another browser: the new bid is there, which proves you're on shared data.

## Resetting data

The live site has no reset: `POST /demo/reset` answers 403 unless `DEMO_CONTROLS_ENABLED=true`, and the web app shows no reset item unless built with `NEXT_PUBLIC_DEMO_CONTROLS=true`.
Reseeding a database is a deliberate operator action that **replaces all data**: `DATABASE_URL=… pnpm --filter @auctionit/api db:seed`. Never run it against the live database without the owner's go-ahead.

## Security notes

- The browser never sees `DATABASE_URL` or the service-role key; the API is the only thing that talks to Postgres and Storage.
- RLS is enabled on every table with no policies, so Supabase's public `anon` key can read or write nothing.
- Identity: Supabase Auth access tokens, verified by the API on every request; the role comes from the profile row (D-087). The `x-demo-session` sample-account header works only with presenter controls on a **local** database.
- Presenter controls (reset, early close, sample accounts) are refused against any non-local database even if `DEMO_CONTROLS_ENABLED=true`.
- Private documents (eligibility files, payment receipts) live in the private `account-documents` bucket; the API issues 60-second signed links only to the owner, reviewers, or the receiving seller.
- Supabase Auth configuration for the live site (Site URL, redirect URLs, confirm email, custom SMTP) and the first reviewer: docs/PHASE1_MVP.md → "Configuration".
- Live Auth settings and the email sender (D-099, D-100): `scripts/set-smtp-password.sh` once (stores the Gmail app password in the gitignored `supabase/.env.smtp`), then `scripts/push-auth-config.sh` — it shows the diff with passwords hidden and asks before pushing.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Web shows "Showing demo data" | API asleep or unreachable, `NEXT_PUBLIC_API_URL` wrong, or the Vercel origin missing from `ALLOWED_ORIGINS` (check the browser console for CORS) |
| `/health` says `mode: demo` | `DATA_MODE` not `supabase` or `DATABASE_URL` unset |
| API errors `prepared statement … does not exist` | a pooler on port 6543 under a different hostname pattern — use the Session pooler (5432) |
| Uploads fail with "interrupted" | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing, or the `lot-media` bucket not created (re-run `supabase db push`) |
| "Your session has ended" after a reset | expected: reset removes newly registered accounts; continue as the demo account |
