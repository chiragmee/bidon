# Bid ON — 10-minute CEO/COO walkthrough

> Kept honest by `e2e/demo-script.spec.ts`, which clicks through this script with the same labels.

**The one idea to land:** *The auction does not change. Lot Assurance makes the material, the measurement rule and the outcome if it differs clear — and Bid ON handles exceptions without inspecting every lot.*

Everything on screen is sample data, and the sample sellers' bank details are fictional. Say so once, at the start, and point at the **Demo** pill in the header.

> **Run this walkthrough in browser demo mode** (`pnpm dev`, http://localhost:3000) or on a private copy built with `NEXT_PUBLIC_DEMO_CONTROLS=true`. The live site (https://bidonindia.vercel.app) deliberately has no Reset, no early close and no sample accounts (D-080, D-087), so steps 0 and 4.1 don't exist there.

---

## Step 0 — before the meeting (2 minutes)

1. Open the app in browser demo mode (http://localhost:3000).
2. **Viewing as … (top right) → Reset demo data → Reset demo data.** Live auctions now close in about 3 hours, and one closes in 40 minutes.
3. Have two small photos ready on the desktop, e.g. `ticket.jpg` and `pile.jpg`, for the lifting check.
4. One browser window at laptop width. Use the header role switcher throughout; it keeps you on the same lot or transaction.

---

## 1. The problem (0:00–1:00) — Landing page

**Show:** the hero and the four trust points, then scroll past the categories to **"Buying steel? Look for Lot Assurance."**

**Say:**
> "In the case study, half the lots clear and 18% of winning bids default, so only about 41% of listed lots become completed transactions. Our hypothesis is that buyers can't trust what they can't see. Lot Assurance tackles that without changing how the auction works — and only on eligible steel lots for the pilot."

---

## 2. A buyer looks at an assured lot (1:00–3:00) — Journey A, steps 1–4

1. **Explore as Buyer** (Rahul, Vardhan Infra Projects).
2. **Auctions** in the left bar → tick **Lot Assurance only** → open **HMS 1 & 2 steel scrap** (LOT-2025-0891).
3. Scroll to the **Lot Assurance** card. Point to the three tags, from lightest to heaviest:
   - **Seller declared** — "a claim, not proof: HMS 1&2, about 40 MT, contamination up to 5%."
   - **Evidence attached** — "six yard photos and a video the buyer can inspect. We attach them; we don't claim to have verified them."
   - **Confirmed at lifting** — "the net weight at the agreed weighbridge, and a visual contamination check. These are two separate records."
4. Point to **Agreed tolerance (8%)**, **If outside tolerance** and **How to claim**, each marked *Demo policy*.

**Say:**
> "Nothing here says 'verified' unless it really was. The buyer knows what's declared, what's evidenced, what gets measured, and exactly what happens if the material is off — before they bid."

## 3. The EMD, then bidding (3:00–4:30) — Journey A, steps 5–7

1. **Pay EMD to bid.** The dialog shows the amount and the seller's bank details (sample, not a real account). Enter a **UTR number** (e.g. `UTR000123456`) and **Paid from** → **Report EMD payment → Done.**
2. **Viewing as … → Seller → Dashboard.** Under **EMD payments to check**, **Confirm receipt** on Vardhan Infra Projects' EMD.
3. **Viewing as … → Buyer**, back to the HMS lot → **Place bid** → the minimum, ₹35,000/MT, is prefilled → **Review bid → Confirm bid**.
4. Point to the green **"Bid placed: ₹35,000/MT"** and **You're the highest bidder**.

**Say:** "Bid ON doesn't touch the money. The buyer pays the seller directly and reports it; only the seller's confirmation lets them bid. Same auction mechanics after that: minimum increment, confirm, and races handled on the server."

## 4. Win, pay, lift, measure (4:00–6:30) — Journey A, steps 8–12

1. **Viewing as … → Operations.** You stay on the lot. **Close demo auction now → Close auction.** "The winner comes from the stored bids and the reserve — never hand-picked."
2. **Viewing as … → Buyer → Go to your transaction** (TX-2000). Point to the stepper.
3. In **Balance payment**, enter a **UTR number** and **Paid from** → **Report balance payment**. **Viewing as … → Seller → Confirm receipt of ₹13,00,000**, then **Viewing as … → Buyer**.
4. Enter a vehicle number (e.g. `MH 04 GP 8812`) → **Propose lifting date**.
5. **Viewing as … → Seller → Confirm lifting date → Confirm lifting date.** "The seller confirms; nobody can skip a step."
6. **Viewing as … → Buyer.** In **Quantity — weighbridge measurement**: Ticket reference `WB-2026-0001`, Gross `54.2`, Tare `15.6` (the net 38.6 MT appears) → **Choose files** → `ticket.jpg` → wait for *1 file attached* → **Record measurement**.

**Say:** "Estimated 40 MT, measured 38.6. The buyer pays for 38.6 — the reconciliation shows the refund due. Quantity is settled by the weighbridge, not by argument."

## 5. When the material is off (6:30–7:30) — Journey A, step 13

1. In **Condition — visual check**: observed contamination `14` → the red **Outside tolerance — 6.0% over the 8.0% limit** appears → **Choose files** → `pile.jpg` → wait for *1 file attached* → **Record condition check**.
2. **Raise assurance claim.** Point to the **Claim eligibility** checklist (all ticks) and the computed **price adjustment** (₹81,060).
3. Fill *What you observed* and *Short explanation*, choose **Price adjustment**, then **Review and submit claim → Submit claim**.

**Say:**
> "A refund is never automatic. The claim needs evidence, has to be outside the agreed tolerance, and has to be raised before loading completes. The seller responds first. Only if they dispute it does it reach us."

## 6. Operations handles the exception (7:30–9:00) — Journey C

1. **Viewing as … → Operations**, then **Operations** in the navigation. Point to the stat cards and the **Assurance queue**.
2. **Review CLM-1042-01** (a seeded disputed claim on another HMS lot). Walk the three columns: **Seller declaration · Lifting and buyer evidence · Seller's position**.
3. Choose **Approve price adjustment** (₹83,376 — 6% excess × 38.6 MT × ₹36,000) → write a one-line reason → **Record decision → Record decision**.
4. Scroll to the **Audit trail**: who decided, why, when.

**Say:**
> "This is the operating model: normal transactions finish without us. We see only disputed exceptions, with both sides' evidence and the agreed rule side by side, and every decision is recorded."

## 7. The seller side and the metric (9:00–10:00) — Journey B, briefly

1. **Viewing as … → Seller → Dashboard** (left bar). Point to the **track record**: it now reads "7 completed sales · 2 resolved claims" — the decision you just recorded updated it. Buyers see this line on every lot.
2. **Create a new lot** → show step 1, then jump to step 3 (**pilot evidence checklist**) and step 4 (**Lot Assurance agreement**), and close.
3. **Viewing as … → Operations**, then **Operations** in the navigation → **Outcome metrics**: the North Star (completed ÷ lots listed) next to the **41% case-study baseline**, labelled *Simulated*.

**Close:**
> "The auction didn't change. The buyer understood the material, the measurement and the remedy before bidding, and we only stepped in for the one disputed exception. The pilot question is whether that moves completed transactions above 41%."

---

## If something goes wrong

| What you see | Do this |
|---|---|
| A buyer can't bid after reporting the EMD | The seller hasn't confirmed it yet: **Viewing as … → Seller → Dashboard → Confirm receipt**. |
| "Can't reach Bid ON right now" (live site) | The free API was asleep. Wait a minute and click **Try again**. |
| "Your session has ended" | Click **Continue as demo …** — what was typed stays. |
| Lost track of state | **Viewing as … → Reset demo data**, then pick up at the act you were on. |
| An auction already ended | Reset demo data (all times are relative to the reset). |

## Longer version (15 minutes): full seller journey (Journey B)

As the seller, **Create a new lot**:
- **Step 1:** title, category **Ferrous / HMS — Lot Assurance pilot**, grade, description, state.
- **Step 2:** quantity `25`, contamination `3`, form and thickness.
- **Step 3:** upload 6 photos and 1 short video; the checklist fills up.
- **Step 4:** reserve `31000` → **Use suggested EMD** → keep the suggested dates → tick **Offer this lot with Lot Assurance** and the agreement → **Preview listing → Publish auction → Publish auction**.

The dashboard's **Scheduled** tab shows it, and buyers see it under **Upcoming** in Auctions.
