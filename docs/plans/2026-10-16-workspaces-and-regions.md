# Plan — signed-in workspaces, one-time review, staff sign-in, master admin and regions (2026-10-16)

Status: **approved 2026-10-16 ('go'); built** — see D-102, D-103 and PROGRESS.md. Owner's request, 2026-10-16, with answers to the open questions.

## What the owner asked for (restated)

1. Once a buyer or seller is signed in, the interface changes: no "Sign in", "Create account", "Start selling" or other
   sign-up prompts anywhere; they work inside their own workspace.
2. The main job is unmistakable: sellers — **Create auction**, prominent everywhere in their workspace, with many lots
   live at once; buyers — **find and bid on live auctions**, with their bids and payments due.
3. Review happens **once**, at onboarding. Approved accounts never go back to review and never see approval steps again.
4. A separate **staff sign-in** entry for Operations.
5. A **master admin** sees every buyer and seller in every region and **appoints reviewers** (in the app) for a region.
6. Regions: **North, West, Central, South, North East**. Bihar, Jharkhand, Odisha and West Bengal belong to **Central**.
   An account's region follows the **state of its registered address**. Master admin = the owner's existing reviewer
   login (chirag.mewara.18+reviewer@gmail.com, U-2001).

## Today (checked in code)

- Header already switches by role (`AppHeader` `NAV[session.role]`); the **homepage, /how-it-works and footer** still show
  sign-up CTAs to everyone.
- Review is already once in the rules: `eligibility.ts` `editable()` allows edits only while incomplete / pending /
  needs_info; an approved company never returns to review; publishing a lot needs no review. (Kept; a test pins it.)
- One staff role, `ops`; every reviewer sees every application. Reviewers are added only by `invite:reviewer` (script).
- The registered address is free text — there is no state, so no region.

## Region map (packages/domain, one place)

| Region | States / UTs |
|---|---|
| North | Jammu & Kashmir, Ladakh, Himachal Pradesh, Punjab, Chandigarh, Haryana, Delhi, Uttarakhand, Uttar Pradesh, Rajasthan |
| West | Gujarat, Maharashtra, Goa, Dadra & Nagar Haveli and Daman & Diu |
| Central | Madhya Pradesh, Chhattisgarh, Bihar, Jharkhand, Odisha, West Bengal |
| South | Karnataka, Kerala, Tamil Nadu, Andhra Pradesh, Telangana, Puducherry, Lakshadweep, Andaman & Nicobar |
| North East | Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim |

## Design

**Staff model.** Keep role `ops` (every guard and policy already uses it) and add `profiles.staff_level`
(`admin` | `reviewer`) and `profiles.regions` (array). Admin: all regions, all actions, manages reviewers. Reviewer: sees
and decides applications only in their regions; Operations claims/auctions unchanged. Enforced in the domain (pure,
tested), the API (every ops route) and the queue query; the UI only reflects it.

**Region of an account.** New required `state` on the application (dropdown of states/UTs, pre-filled from the GSTIN's
first two digits when given). `regionOf(state)` gives the region. Existing applications without a state show "Region
not set" and are visible to the admin only (the admin can set it). New-application email alerts go to the admin and the
reviewers of that region only.

**Appointing reviewers (in app).** `/ops/team` (admin only): list of staff with regions; "Appoint reviewer" (name,
email, regions) sends the Supabase invitation (same flow as `invite:reviewer`, moved into the API); change regions;
remove a reviewer (revokes the role, keeps their decision history). The script stays for the first admin.

**Staff sign-in.** `/staff/sign-in` — same Supabase sign-in, staff wording, no sign-up link; a buyer/seller who signs in
there is told to use the normal sign-in. Linked discreetly from the footer ("Bid ON staff") — not in the main header.

**Signed-in experience.**
- `/` for a signed-in buyer/seller/staff redirects to their home (`/buyer/dashboard`, `/seller/dashboard`, `/ops`).
- Public pages (/auctions, lot detail, /how-it-works, /lot-assurance) hide every sign-up CTA when signed in; lot pages
  show the signed-in action instead (pay EMD / bid, or "Your lot").
- Seller workspace: a primary **Create auction** button in the header on every seller page and at the top of the
  dashboard; dashboard grouped as Live · Scheduled · Drafts · Closed / awaiting payment, with counts.
- Buyer workspace: primary **Browse live auctions**; dashboard leads with Bidding now · Won — payment due ·
  EMDs awaiting the seller.
- After approval, the onboarding checklist / "get approved" panels disappear; the account page shows the approved
  status and details read-only (changing legal identity details = contact Bid ON, D-097 policy).
- Before approval, the workspace shows one clear "Finish your application" / "Under review" banner instead.

## Tasks (each ends in a commit; docs/DECISIONS.md + PROGRESS.md updated each time)

1. Domain: regions map + `regionOf`, `state` on Eligibility (required to submit), staff level/regions on User, queue
   and review filtered by region, alerts to region reviewers + admin. Unit tests (incl. "approved never returns to
   review").
2. DB migration: `companies` eligibility state (JSON field — no column change needed), `profiles.staff_level`,
   `profiles.regions`, `claim_email_alerts` unchanged (recipients come from notifications). Mapping + API contract tests.
3. API: staff endpoints — list staff, appoint (invite), change regions, remove; region guard on eligibility routes;
   set region for legacy applications (admin).
4. Web: state dropdown on the application; `/ops/team`; region filter + badge on the queue; `/staff/sign-in`.
5. Web: signed-in redirects and CTA hiding; seller "Create auction" header button and dashboard grouping; buyer
   dashboard ordering; post-approval cleanup.
6. Make U-2001 admin with all regions (owner runs the rollout script — Claude can't change production).
7. Tests: unit + contract; Playwright demo + `e2e:live` (admin appoints a regional reviewer → reviewer sees only their
   region → alert reaches only them); 1440 and 390 checks. Then push, and the owner runs the migration script.

## Not included (say if wanted)

- Region-based visibility of auctions for buyers (all buyers still see all auctions).
- Reassigning an applicant's region after approval (admin can, but it changes nothing else).
- Staff audit report / analytics per region.
