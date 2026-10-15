<p align="center">
  <img src="apps/web/src/app/icon.svg" alt="Bid ON logo" width="72" height="72">
</p>

<h1 align="center">Bid ON</h1>

<p align="center">
  <strong>Online auctions for industrial scrap and surplus, between approved Indian businesses.</strong><br>
  Clear lots, open bidding, payments straight to the seller, and every lot tracked from winning bid to weighbridge.
</p>

<p align="center">
  <a href="https://bidonindia.vercel.app"><strong>Open the live site →</strong></a> ·
  <a href="https://bidonindia.vercel.app/how-it-works">How it works</a> ·
  <a href="#run-it-on-your-machine">Run it locally</a>
</p>

![Bid ON home page](docs/images/readme/home.jpg)

---

## Contents

- [The problem](#the-problem)
- [What Bid ON does](#what-bid-on-does)
- [Who uses it](#who-uses-it)
- [How a trade works](#how-a-trade-works)
- [Lot Assurance](#lot-assurance)
- [Screenshots](#screenshots)
- [What's live today](#whats-live-today)
- [Run it on your machine](#run-it-on-your-machine)
- [How it's built](#how-its-built)
- [Quality and testing](#quality-and-testing)
- [Documentation](#documentation)

---

## The problem

Factories, steel plants and project sites in India constantly generate scrap and surplus: heavy melting steel, structural cut-ends, copper cable, aluminium extrusions, used motors and transformers. Selling it is still mostly done through phone calls, local traders and paper tenders. That creates the same problems again and again:

- **Few buyers see each lot**, so sellers rarely get a fair market price.
- **Buyers can't see the material in person** and have to trust a description, so they price in the risk.
- **Disputes are common at lifting**: the weight doesn't match, the grade is lower than described, or the load is contaminated.
- **Money and paperwork are informal**: who paid what, when, and what is still owed is often unclear.

## What Bid ON does

Bid ON is a B2B marketplace where **approved businesses** buy and sell this material through **open, time-bound auctions**.

| | |
|---|---|
| **Approved businesses only** | Every buyer and seller applies once with business details (PAN, GST, address proof, etc.). A Bid ON reviewer checks them before anyone can bid or sell, with one account per business. |
| **Clearly described lots** | Grade, estimated quantity, location, photos and video, the seller's track record, whether the reserve has been met, and the full bid history. |
| **Fair, automatic close** | Bids are accepted only while a lot is live. At the closing time, the highest bid that meets the reserve wins; otherwise the lot closes unsold. Nobody can pick a winner by hand. |
| **Bid ON never holds money** | Buyers pay a refundable deposit (EMD) and later the balance **directly to the seller's bank account**, then report the payment with its UTR. The seller confirms receipt, and both sides see the same record. |
| **Weighed, not estimated** | The buyer pays for the quantity measured at the agreed weighbridge when the material is lifted. Any overpayment is refunded by the seller and recorded. |
| **One timeline per trade** | Winning bid → balance → lifting date → weighbridge ticket → completion, with every step recorded: who did it, and when. |

## Who uses it

| Role | What they do |
|---|---|
| **Buyer** (traders, foundries, recyclers, EPC contractors) | Sign up, get approved once, browse live auctions, pay the EMD to bid, win, pay the balance, schedule lifting. |
| **Seller** (plants, fabricators, project sites, scrap yards) | Sign up, get approved once, list lots with photos and a reserve price, confirm deposits and payments as they arrive, confirm lifting. Sellers can add photos or **take an auction down** (with a reason bidders see) until it ends. |
| **Reviewer** (Bid ON staff) | Check new account applications **for their region** (North, West, Central, South, North East) and approve, reject or ask for more information; decide disputed Lot Assurance claims. Reviewers are emailed when an application arrives. |
| **Admin** (Bid ON staff) | Everything a reviewer does, for every region, plus appointing reviewers and assigning their regions. |

## How a trade works

```mermaid
sequenceDiagram
    autonumber
    participant S as Seller
    participant B as Bid ON
    participant R as Reviewer
    participant Y as Buyer
    S->>B: Sign up, apply with business documents
    Y->>B: Sign up, apply with business documents
    B->>R: Email: new application in your region
    R->>B: Approve, once and never repeated
    S->>B: List a lot: photos, quantity, reserve, auction dates
    Y->>S: Pay the EMD by bank transfer / UPI
    Y->>B: Report the payment (UTR)
    S->>B: Confirm the EMD arrived
    Y->>B: Bid (only while the auction is live)
    B->>B: At closing time: highest bid meeting the reserve wins
    Y->>S: Pay the balance directly
    S->>B: Confirm the balance
    Y->>B: Propose a lifting date, which the seller confirms
    Y->>B: Weighbridge ticket → pay for the measured quantity → complete
```

Losing bidders' deposits are owed back by the seller, who records each refund with its bank reference.

## Lot Assurance

For steel lots (heavy melting scrap and mixed steel), a seller can offer **Lot Assurance**: a structured declaration of grade and contamination, backed by evidence. If the material checked at lifting falls outside the agreed tolerance, the buyer can raise a claim. The seller accepts or disputes it with evidence, and Bid ON staff decide disputed claims with a recorded reason. The idea is simple: **the auction doesn't change, but what was promised, how it's measured and what happens if it differs are clear up front**, so buyers can bid with confidence without Bid ON inspecting every lot.

> Tolerances and remedies are provisional and will be confirmed in Bid ON's terms.

## Screenshots

Screens shown with the built-in sample data.

| Live and upcoming auctions | A lot, as a buyer sees it |
|---|---|
| ![Auction catalogue](docs/images/readme/auctions.jpg) | ![Lot page](docs/images/readme/lot.jpg) |
| **A trade's timeline, with an assurance claim** | **Seller dashboard** |
| ![Transaction timeline](docs/images/readme/transaction.jpg) | ![Seller dashboard](docs/images/readme/seller-dashboard.jpg) |
| **Admin: reviewers by region** | **On a phone** |
| ![Team page](docs/images/readme/ops-team.jpg) | <img src="docs/images/readme/home-phone.jpg" alt="Home page on a phone" width="260"> |

## What's live today

**Live at [bidonindia.vercel.app](https://bidonindia.vercel.app)** (Phase 1 MVP):

- Email-and-password sign-up with email verification, password reset and separate staff sign-in.
- One-time business approval by regional reviewers, with duplicate-account checks on PAN, GSTIN, email and phone.
- Seller listings with photos and video, scheduled auctions, live bidding with automatic close.
- Offline payments (EMD, balance, refunds) reported by the buyer and confirmed by the seller.
- Lifting, weighbridge quantity and completion; Lot Assurance claims and staff decisions.
- Email alerts to reviewers for new applications; notifications inside the app for everything else.

**Not built yet** (planned for Phase 2): an online payment gateway, automated KYC checks, phone OTP, and a custom domain (`bidon.co.in` is available). Fees and the final rules for deposits, deadlines and refunds are still to be decided ([docs/DECISIONS.md](docs/DECISIONS.md), D-097).

> The live server runs on a free plan and sleeps when idle. The first page load after a quiet period can take up to a minute.

---

## Run it on your machine

You don't need a database or any accounts to try it. The app ships with sample buyers, sellers, lots and trades.

**Requirements:** Node.js 22 or newer, and pnpm (`corepack enable`).

```bash
git clone https://github.com/chiragmee/auctionit.git
cd auctionit
pnpm install
pnpm dev
```

Open **http://localhost:3000**. On the home page or the sign-in page, choose a sample account. There's no sign-up in this mode, and you can switch role at any time from **"Viewing as …"** in the header.

| Sample account | Try this |
|---|---|
| **Buyer**: Rahul Sharma | Open a live lot, pay the EMD, place a bid; follow trade TX-1042 |
| **Seller**: Suresh Agrawal | Create an auction in the listing wizard; confirm a lifting date on TX-1045; take a live auction down |
| **Operations**: Devendra Nath (admin) | Review applications, appoint a regional reviewer, decide the disputed claim CLM-1042-01 |

In this mode everything runs in your browser and is saved there. **Reset demo data** in the header starts over with fresh auction times. A 10-minute guided walkthrough is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

<details>
<summary><strong>Run it with a real database and real sign-in</strong></summary>

Requires Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start                                   # local Postgres, Storage, Auth and a mail catcher
cp apps/api/.env.example apps/api/.env           # fill in from `supabase status`:
#   DATA_MODE=supabase
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   SUPABASE_URL=http://127.0.0.1:54321
#   SUPABASE_SERVICE_ROLE_KEY=<service role key from `supabase status`>
pnpm db:reset                                    # apply migrations and load the sample data
printf 'NEXT_PUBLIC_DATA_SOURCE=http\nNEXT_PUBLIC_API_URL=http://localhost:4000\n' > apps/web/.env.local
pnpm dev
```

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `apps/web/.env.local` to use real sign-up and sign-in. Verification emails then appear in the local mail catcher at http://127.0.0.1:54324. Deployment to Supabase, Render and Vercel is described in [docs/DEPLOY.md](docs/DEPLOY.md).

</details>

---

## How it's built

```mermaid
flowchart LR
  W["Web app<br/>Next.js · Vercel"] -->|HTTPS + sign-in token| A["API<br/>Express · Render"]
  W -. demo mode .-> D
  A --> D["Business rules<br/>packages/domain"]
  A --> P[("Postgres · Supabase<br/>bids and auction close<br/>in row-locked functions")]
  A --> F[("File storage<br/>photos · private documents")]
  P -->|new application| E["Email alerts<br/>Supabase Edge Function"]
  U["Supabase Auth<br/>sign-up · verification · reset"] --- W
```

| Part | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript |
| API | Node.js, Express 5, zod validation, role checks on every route |
| Business rules | Plain TypeScript in `packages/domain` (no I/O), shared by the web app's demo mode and the API |
| Data, files, sign-in | Supabase: Postgres, Storage, Auth, Edge Functions |
| Hosting | Vercel (web), Render (API), Supabase (data) |
| Tests | Vitest, Supertest, Playwright, axe accessibility checks |

**Main design choices:**
- **Every business rule is written once.** Bidding, closing, payments, approvals and claims are pure functions in `packages/domain`, used by both the browser demo and the real API, so the two can never disagree.
- **Integrity is enforced in three places.** The web app guards pages, the API checks the role and ownership on every request, and Postgres functions place bids and close auctions under row locks, so two bids can't race past each other.
- **Honest by design.** The product never says "verified" or "paid" unless that step really happened. Payments count only once the receiving seller confirms them.

**Repository layout:**

```
apps/web          Web app: pages, components, design tokens generated from DESIGN.md
apps/api          API server: routes, validation, persistence, admin scripts
packages/domain   Business rules, state machines, read models, sample data
packages/client   One data interface with two implementations (browser demo / HTTP API)
supabase/         Database migrations, Postgres functions, email-alerts Edge Function, Auth config
e2e/              Playwright end-to-end tests
scripts/          Design-token generator, deployment helper scripts
docs/             Specification, design system, decisions, plans, deployment
```

## Quality and testing

```bash
pnpm typecheck && pnpm lint && pnpm test   # types, lint, unit, API and contract tests
pnpm e2e                                   # end-to-end, desktop (1440px) and phone (390px)
```

- **Business rules:** about 270 unit tests, covering every rule and every refusal reason.
- **API:** about 270 tests. Every route is tried as a guest, buyer, seller and staff member, and one contract suite runs against both the browser demo and the real API with Postgres (including 20 concurrent bidders).
- **End to end:** about 210 browser tests of full buyer, seller and staff journeys. They also check access by role, accessibility (axe and keyboard-only), design rules and phone layouts. A separate suite exercises real sign-up, email verification, invitations and email alerts against a local Supabase.

## Documentation

| Document | What's in it |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Product requirements |
| [docs/PHASE1_MVP.md](docs/PHASE1_MVP.md) | What the Phase 1 MVP covers, and how it was verified |
| [DESIGN.md](DESIGN.md) | Design system: colours, type, layout rules |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every product and technical decision, with its reason |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | A 10-minute guided walkthrough |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploying and operating the live site |

---

<sub>Bid ON was developed under the working name AuctionIT, which is why the code, packages and repository still use `auctionit`.</sub>
