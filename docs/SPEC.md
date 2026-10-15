> **How to use this spec:** This is the full product specification for AuctionIT. Build order and checkpoints come from the phase prompts and `CLAUDE.md`: complete one phase, report, and stop. Visual details are defined by `DESIGN.md`, which wins over §5 wherever they differ. Screen layouts come from `design/stitch/`.

# MASTER BUILD PROMPT: AUCTIONIT — END-TO-END INDUSTRIAL AUCTION MARKETPLACE

## 1. Your role and objective

Act as a senior product designer, staff-level full-stack engineer, and pragmatic product manager.

Build a polished, interactive, end-to-end web prototype for **AuctionIT**, a B2B marketplace for industrial scrap and surplus auctions.

This is a real product demonstration intended for the company's CEO and COO. It should demonstrate that you understand the marketplace, can design an intuitive user experience, and can translate a business problem into a coherent working product.

Do not just produce a plan, wireframes, static HTML, or a product requirements document. **Build the working application, test the flows, fix errors, and leave it ready to run and deploy.**

I have approximately two hours for the first working version. Prioritize product quality, end-to-end functionality, and a polished demonstration over an enormous feature set.

First inspect the repository, identify the existing code and installed tools, and extend the existing project if one already exists. Do not overwrite working code unnecessarily. Make reasonable decisions without asking me a long list of questions.

## 2. Product context

AuctionIT helps industrial sellers auction scrap and surplus material to business buyers.

The current transaction flow is:

Seller lists a lot → buyer registers and pays the EMD (earnest money deposit) → buyer bids → highest bid meeting the seller's reserve wins → winner pays the balance → buyer lifts the material → transaction completes.

The business problem is that winning a bid does not necessarily mean the transaction will be completed.

For the case study, the baseline is approximately:

- 500 lots listed per month.
- 50% auction clear rate.
- 18% of winning bids default.
- Approximately 205 completed transactions per month.
- Completed transaction rate of approximately 41%.

These figures belong to the case study. They are not live platform analytics.

The core product hypothesis is that uncertainty about the physical material may contribute to both unsuccessful auctions and post-win defaults.

### The key product idea: Lot Assurance

Lot Assurance should make it clear to a buyer:

1. What the seller is declaring about the lot.
2. What evidence is available.
3. What is confirmed through measurement at lifting.
4. What acceptable variation has been agreed.
5. What happens if the material falls outside the agreed tolerance.

The mechanism is:

**Seller declares → Buyer sees evidence → Buyer bids → Material is checked at lifting → Normal completion or predefined remedy → Seller track record updates.**

The auction and bidding mechanism should remain familiar. Lot Assurance adds clarity and a defined process for handling discrepancies; it is not a completely new auction model.

The product must also support ordinary, non-assured listings. Lot Assurance should initially be available only for eligible ferrous/mixed-steel pilot lots.

## 3. Product principles

Follow these principles throughout the application.

**Make the next action obvious.** Every page should have one clear primary action. Avoid unnecessary buttons, competing CTAs, and long forms.

**Explain important information in plain language.** Industrial buyers should understand the material, pricing, auction status, evidence, and remedy without needing to learn internal terminology.

**Preserve the familiar auction flow.** Do not redesign bidding just to make the prototype look innovative.

**Make trust visible.** Distinguish seller-declared information from information supported by evidence and values confirmed at lifting.

**Do not make unsupported guarantees.** Lot Assurance must have clear conditions. A buyer cannot obtain a refund simply by claiming that material is wrong.

**Avoid operational bloat.** Normal transactions should continue without manual intervention. Only disputed or ambiguous exceptions should reach AuctionIT operations.

**Use realistic sample data, clearly labelled as demo data.** Never present seeded numbers, fictional companies, sample seller ratings, or illustrative tolerances as real AuctionIT data.

**Build the complete core journey before peripheral features.** A working lot-to-completion journey matters more than dozens of incomplete dashboard widgets.

---

# 4. Technology and deployment architecture

Use the following architecture.

### Frontend — Vercel

- Next.js with App Router.
- TypeScript.
- Tailwind CSS.
- Use shadcn/ui or similarly accessible, well-designed components where useful.
- Responsive design for desktop, tablet and mobile.
- Reusable components and sensible separation between pages, UI, state and API calls.

### Backend — Render

- Node.js with Express and TypeScript.
- REST APIs for listings, bids, transactions, lifting checks and assurance claims.
- Server-side validation for every business-critical action.
- Centralized error handling.
- A health-check endpoint at `/health`.

### Database — Supabase

Use Supabase Postgres for persistent demo data.

Create a versioned SQL migration and a seed script containing realistic sample listings, buyers, sellers, bids and transactions.

Use Supabase Auth if credentials are configured. Never expose the Supabase service-role key to the browser.

For business-critical updates such as placing bids, enforce the rules on the server and handle competing bids safely. Where appropriate, use a PostgreSQL function or transaction to prevent race conditions.

### Demo-mode requirement

The prototype must remain easy to demonstrate even if real authentication or payment credentials have not been configured.

Provide a conspicuous but tasteful **Demo Mode** indicator. Provide quick access to Buyer, Seller and Operations demo experiences using seeded accounts or a controlled demo-session mechanism.

If the backend or Supabase credentials are missing, provide a clearly separated demo-data adapter so the core experience can still run locally. Do not silently pretend a real payment or production transaction occurred.

### Environment and deployment

Create:

- `.env.example` files without real secrets.
- Supabase schema/migration files.
- Database seed script.
- Frontend deployment instructions for Vercel.
- Backend deployment instructions for Render.
- Instructions for configuring environment variables, CORS and Supabase.
- A README covering local development and demo access.

Frontend variables should include the appropriate API base URL. Backend variables should include the Supabase URL, server-only credentials, allowed frontend origins and demo-mode configuration.

Do not spend time building complex infrastructure, elaborate microservices, or production payment integrations.

All payment, EMD and refund actions in the prototype must be simulated. No real money may move.

---

# 5. UX and visual design

The design should feel like a credible, modern B2B marketplace used by industrial procurement teams.

### Visual direction

> The exact colours, type, spacing and components are defined in `DESIGN.md`. The direction below is the original brief; where it differs, follow `DESIGN.md`.

Use a restrained industrial aesthetic:

- Deep teal for trust, navigation and important section headings.
- Warm orange for primary actions and important auction highlights.
- White and light neutral surfaces.
- Dark slate text.
- Subtle borders, moderate corner radii and restrained shadows.
- Clear typography, preferably Inter or an equivalent readable sans-serif.

Use generous but practical spacing. Create polished tables, cards, forms, step indicators, empty states, badges and dialogs.

Avoid excessive gradients, oversized typography, decorative animations, glassmorphism, generic AI-themed visuals and excessive dashboard charts.

Use high-quality scrap/material images where available. If image assets fail to load, show attractive, consistent fallbacks instead of broken image icons.

### Layout

Desktop:

- A clean top navigation for the public marketplace.
- An authenticated workspace with a compact sidebar or role-appropriate navigation.
- Main content with a clear heading, supporting context and one primary action.
- Content widths and tables that are readable on a 1440px desktop.

Mobile:

- No horizontal page overflow.
- Stack form fields and cards sensibly.
- Keep primary actions easy to reach.
- Use a mobile navigation pattern that does not obscure important actions.

### Accessibility

Use semantic HTML, keyboard-accessible controls, visible focus styles, form labels, descriptive error messages, sufficient contrast, and confirmation dialogs for consequential actions.

Use toasts for brief feedback, but place important transaction status and errors directly on the page as well.

---

# 6. Roles and access

Support four experiences.

### Guest

Can browse published auctions and view public lot details. Can begin registration or enter a demo account.

### Buyer

Can browse and filter lots, view evidence, register business details, simulate EMD payment, bid, see auction outcomes, track won transactions, simulate balance payment, schedule lifting, submit a valid assurance claim and view transaction history.

### Seller

Can onboard their business, create and preview lots, upload listing evidence, set auction parameters, publish listings, manage auctions, view bids and transaction status, confirm lifting arrangements and respond to assurance claims.

### Operations

Can see a compact overview of demo marketplace activity, close or resolve demo auction states when permitted, review ambiguous assurance claims, and inspect transaction history.

Role permissions must be enforced in the UI and on the server. Buyers must not access seller management. Sellers must not edit another seller's lots or change auction results manually. Only Operations can review disputed claims.

For the demo, provide clear entry points labelled:

- Explore as Buyer
- Explore as Seller
- Explore as Operations

Do not force a long signup flow just to see the product.

---

# 7. Public landing page

Create a polished landing page at `/`.

### Header

- AuctionIT wordmark.
- Explore Auctions.
- How Lot Assurance Works.
- Sell Surplus.
- Sign In.
- Primary CTA: Browse Auctions.

Keep the header compact and responsive.

### Hero

Use straightforward language such as:

**Industrial surplus. Competitive bidding. Clearer transactions.**

Supporting copy should communicate that AuctionIT helps businesses buy and sell industrial surplus through online auctions.

Primary CTA: Explore Auctions.

Secondary CTA: Sell Surplus.

Include a small explanation of Lot Assurance without suggesting that every lot is assured.

### How it works

Show the buyer and seller flows in simple steps.

Buyer: Find a lot → Review details → Bid → Win → Pay and lift.

Seller: Create listing → Set reserve and auction dates → Receive bids → Complete sale.

### Lot Assurance introduction

Explain three things clearly:

- Structured seller declaration and available evidence.
- Quantity measured at lifting using an agreed certified weighbridge.
- Defined remedies when an assured lot falls outside the applicable tolerance.

CTA: Explore assured lots.

### Featured lots

Show three to four seeded listings with varied categories and auction statuses.

Clearly show which are Lot Assurance eligible and which are standard listings.

### Footer

Include navigation, help/contact placeholders and a notice that this is a demo environment where applicable.

Do not invent official company claims, certifications, live marketplace statistics or testimonials.

---

# 8. Buyer experience

## 8.1 Auction catalogue — `/auctions`

Create a searchable, filterable listing page.

Each lot card should display:

- Material thumbnail.
- Lot title and category.
- Material grade where provided.
- Location.
- Estimated quantity.
- Current highest bid per MT.
- Reserve price where configured to be visible.
- Auction closing status/time.
- Number of bids.
- Lot Assurance badge when enabled.
- Seller track-record summary when enough history exists.

Use meaningful status labels such as Live, Upcoming, Closed, Reserve Met and Unsold.

### Search and filters

Support:

- Keyword search.
- Material category.
- Location.
- Lot Assurance only.
- Auction status.
- Ending soon.

Support sorting by closing time, newest and current bid.

Filters should be functional, not decorative. Provide a clear-filters action and a useful empty state when nothing matches.

Do not automatically label unrelated or non-assured lots as risky. A standard lot is simply a listing without the assurance mechanism.

## 8.2 Lot detail — `/auctions/[id]`

This is the most important buyer screen.

The page should have a clear hierarchy:

1. Lot title, location and auction status.
2. Image gallery.
3. Material specifications.
4. Quantity and measurement basis.
5. Reserve/current bid and auction ending time.
6. EMD requirement.
7. Seller information and track record.
8. Available supporting evidence.
9. Lot Assurance summary when applicable.
10. Primary bidding action.

### Lot Assurance summary

For an assured lot, show a concise summary that answers:

- What has the seller declared?
- What evidence is available?
- Which quantities or attributes will be checked at lifting?
- What is the agreed tolerance?
- What remedy is available if the lot falls outside tolerance?
- What evidence and timing are required for a claim?

Use labels such as **Seller declared**, **Evidence attached** and **Confirmed at lifting**.

Never show “Verified” unless a corresponding verification step has actually taken place.

Display category-specific tolerances as illustrative demo policy unless a real approved policy is supplied.

Example demo lot:

- HMS 1 & 2 steel scrap.
- Estimated quantity: 40 MT.
- Seller-declared contamination: up to 5%.
- Illustrative agreed limit: 8%.
- Final payable quantity: actual measurement at the mutually agreed certified weighbridge.
- Supporting evidence: sample photos and video.
- Outside-tolerance remedy: a predefined price adjustment or EMD refund and exit, subject to the defined evidence/claim process.

Use this as example data, not a universal rule for all materials.

### Primary action

For an eligible open lot, display **Place Bid**.

If the buyer does not have an EMD recorded for that lot, clicking the action should explain the requirement and take them through the demo EMD step before returning them to bidding.

If the auction is closed, show the result and the relevant transaction action instead. Do not show a working bid button for a closed auction.

---

# 9. Buyer onboarding

Create a concise buyer onboarding flow. It should collect only information needed to enable demo participation.

### Step 1 — Account

Name, email and password when using real authentication. Demo mode should permit direct entry using the demo account switcher.

### Step 2 — Business profile

- Business/company name.
- Business type.
- City/state.
- Industry or business category.
- Materials of interest.

### Step 3 — Review

Summarize the submitted information and explain the next step.

In demo mode, mark the profile as demo-approved or sample status rather than pretending real KYC has been performed.

### Successful completion

Send the buyer to their dashboard and explain how to find lots, place bids and complete a purchase.

### Errors and recovery

Support:

- Missing required fields.
- Invalid email.
- Password validation when applicable.
- Duplicate email.
- Network failure.
- Session expiration.
- Incomplete profile.

Show specific messages and retain entered form data when possible.

Do not make onboarding feel like a long enterprise compliance questionnaire.

---

# 10. EMD and bidding workflow

## 10.1 EMD requirement

EMD is the earnest money deposit required to participate in a specific lot's bidding process.

For the prototype:

- Display the lot-specific EMD amount.
- Explain why it is required.
- Use a demo payment modal or page.
- Make clear that no real payment will be charged.
- Record a simulated successful deposit against the demo buyer and lot.
- Permit a simulated failure so the failure state can be tested.

Do not integrate real payment rails.

Do not invent universal EMD forfeiture or refund rules. Keep policy-dependent behaviour configurable and label it as a demo assumption where needed.

## 10.2 Place bid

Provide a focused bid form with:

- Current highest bid per MT.
- Minimum permitted next bid.
- Input for the buyer's bid per MT.
- Clear auction-ending information.
- Confirmation before submission.

The server must reject:

- Missing or invalid bid amount.
- A bid below the current required minimum.
- A bid on a closed or upcoming auction.
- A bid when the required EMD is not completed.
- A seller bidding on their own lot.
- A duplicate or stale submission that is no longer valid.

Handle concurrent bids using an atomic server/database operation. Refresh the displayed current bid after a rejection.

On success, show a clear confirmation and update:

- Latest bid.
- Bid history.
- Buyer's highest/current bidding status.
- Buyer dashboard.

Never claim a bid succeeded if the server returned an error.

## 10.3 Auction lifecycle

Represent an auction's status explicitly.

- Draft.
- Scheduled.
- Live.
- Closed — reserve met.
- Closed — reserve not met.
- Awarded.

The highest bid meeting the configured reserve wins once the auction closes. If the reserve is not met, the lot is unsold.

For demo convenience, Operations should have a controlled action to advance or close a demo auction. This must be clearly identified as a demo action, not a normal seller ability to alter auction results.

When the auction closes, determine the result using the actual stored bids and reserve price. Do not hardcode a winning bidder irrespective of the bid records.

Make the demo closing process easy to trigger during a live CEO walkthrough.

---

# 11. Buyer dashboard — `/buyer/dashboard`

Show only information the buyer needs.

### Summary

- Active bids.
- Auctions closing soon.
- Won lots awaiting next steps.
- Transactions in progress.
- Completed transactions.

### Active bidding

For each bid:

- Lot.
- Current highest bid.
- Buyer's bid/status.
- Closing time.
- Link to lot.

Use readable status labels such as Leading, Outbid, Won and Closed without winning.

### Won lots and transactions

Show a progression such as:

Won → Balance payment → Schedule lifting → Confirm quantity/condition → Complete or raise an assurance claim.

Each transaction card should have one clear next action.

### Empty states

If a buyer has no bids or transactions, guide them back to available auctions instead of showing a blank dashboard.

---

# 12. Seller onboarding and dashboard

## 12.1 Seller onboarding

Collect:

- Name.
- Business/company name.
- Business type.
- Yard/operating location.
- Material categories sold.
- Contact details.

Allow the demo to show a sample verification status, but do not claim that the real business has been verified.

Keep the onboarding short. Do not demand extensive business documents just to try the demo.

## 12.2 Seller dashboard — `/seller/dashboard`

Show:

- Active listings.
- Upcoming auctions.
- Closed auctions.
- Lots with a winning bidder.
- Transactions awaiting payment or lifting.
- Completed sales.
- Assurance claims requiring attention.

Include one clear primary CTA: **Create a new lot**.

Seller dashboard items must link to real seeded records and actual functioning pages.

---

# 13. Seller listing wizard

Create a four-step wizard at `/seller/lots/new`.

Use a visible step indicator, clear field labels, inline validation and a persistent next/back pattern. Retain entered values when navigating between steps.

### Step 1 — Basic details

- Lot title.
- Category.
- Material type/grade.
- Description.
- Yard/location.

### Step 2 — Quantity and condition

- Estimated quantity in MT.
- Relevant condition details.
- Contamination estimate when applicable.
- Grade and category-specific attributes.

Only show fields relevant to the selected category.

### Step 3 — Evidence

- Upload photos.
- Upload a video where supported.
- Supporting documents where relevant.
- Preview uploaded evidence.
- Show progress and remove/retry controls.

The initial assurance pilot can request 6 or more geotagged photos and one video. Label those as proposed pilot requirements, not universal industry standards.

Validate file types and sizes. Handle failed uploads with clear recovery actions. Do not claim location metadata has been verified if the prototype has only attached a file.

### Step 4 — Auction settings and assurance

- Reserve price per MT.
- EMD amount.
- Auction start/end.
- Lot Assurance eligibility.
- Applicable tolerance/remedy summary if assurance is enabled.

For the prototype, use a configurable demo policy for EMD, tolerance and remedy settings. Do not hardcode the 5%/8% example as the rule for every category.

Show an intelligible notice explaining what the seller is agreeing to if Lot Assurance is enabled.

Prevent invalid auction date ranges and missing mandatory fields.

### Preview and publish

Before publishing, show the listing as the buyer will see it.

The seller can go back and edit fields.

After publishing, show a confirmation and the new lot on the dashboard. The auction status should reflect its start time.

Support Save Draft, Preview and Publish.

Do not publish an incomplete listing.

---

# 14. Seller lot management and auction results

Create `/seller/lots` and `/seller/lots/[id]`.

A seller should be able to:

- View drafts, scheduled listings, live auctions and closed lots.
- Open a lot.
- Edit a draft.
- View the current bid and bid count for their own listing.
- View the auction result.
- See whether the lot cleared or remained unsold.
- Track the winning transaction when applicable.
- Review evidence and assurance status for the lot.

Do not allow a seller to manipulate bids, erase bid history, secretly change the reserve after live bidding starts, or override the winner through the UI.

If editing a live auction is not supported, explain why rather than showing broken edit controls.

---

# 15. Post-win transaction workflow

A won lot should move into a coherent transaction workflow.

Suggested states:

1. Won — awaiting balance payment.
2. Balance payment simulated.
3. Awaiting lifting arrangement.
4. Lifting scheduled.
5. Material checked.
6. Completed.
7. Assurance claim opened.
8. Under review.
9. Resolved by adjustment, withdrawal/refund or other approved disposition.
10. Defaulted where completion fails under the applicable rules.

Implement only the transitions needed to demonstrate the core workflow, but model the statuses clearly.

### Buyer actions

After winning:

- Open the transaction.
- View the winning price and applicable lot details.
- Simulate payment of the outstanding balance.
- Request or schedule lifting.
- View the confirmed lifting date.
- Record or view the lifting check for an assured lot.
- Complete the transaction if there is no discrepancy.
- Open a claim if the assured lot falls outside its stated tolerance.

### Seller actions

- See the transaction status.
- Review the proposed lifting date.
- Confirm the lifting arrangement in demo mode.
- View the final quantity/check results where permitted.
- View an assurance claim and respond if the role is authorized.

### Completion

When the transaction is completed, show a clear success state, final quantity, final transaction value where supported, and a link to transaction history.

Do not mark a transaction complete merely because the buyer won or simulated payment succeeded. The required completion steps must be satisfied.

---

# 16. Lifting, quantity measurement and Lot Assurance claims

This is the core differentiating workflow. Make it easy to follow.

## 16.1 Quantity measurement

For an assured transaction, allow the lifting check to record:

- Certified weighbridge identifier or ticket reference.
- Measured quantity in MT.
- Evidence/ticket attachment.
- Time of measurement.

For demo data, show a clear contrast between estimated and measured quantity. The actual measured quantity should drive the simulated final payable quantity where the price is per MT.

Only treat the measurement as accepted when the required fields are complete.

The prototype does not need to integrate a real weighbridge. It records the accepted evidence and measurement.

## 16.2 Grade and condition check

For the initial ferrous/mixed-steel pilot:

- Display the seller declaration.
- Display reference images and available listing evidence.
- Allow a lifting-stage visual assessment.
- Capture timestamped lifting photos as evidence when possible.
- Record the observed contamination/condition and whether it falls within the demo tolerance.

Make it explicit that grade/condition assessment is not the same as weighbridge measurement.

Do not automatically infer verified grade from a photo or use an AI-generated quality score as a substitute for evidence.

## 16.3 Claim eligibility

A claim is available only when:

- The lot has Lot Assurance enabled.
- The auction has resulted in a valid winning transaction.
- Lifting has started or the defined lifting checkpoint has been reached.
- The claimed discrepancy is outside the applicable category tolerance.
- Required evidence is supplied.
- The claim is raised before loading is complete, according to the demo policy.

If those requirements are not satisfied, explain the specific reason and show the user what they can do next.

## 16.4 Claim form

Allow the buyer to provide:

- Claim category: quantity, grade, contamination or condition.
- Expected value/declaration.
- Observed value.
- Evidence attachment.
- Short explanation.
- Requested remedy: price adjustment or exit/refund of EMD.

Use plain language. Do not overwhelm the buyer with legal terminology.

Display the claim status and next step after submission.

## 16.5 Claim handling

Support three outcomes.

**Normal transaction:** measurement and condition are within tolerance; proceed with normal completion.

**Clear exception:** evidence supports an outside-tolerance discrepancy; apply the configured remedy rules.

**Ambiguous/disputed exception:** escalate to Operations for review.

Seller responses can be:

- Accept the proposed resolution.
- Dispute the claim with an explanation and supporting evidence.

Operations can review the available evidence and approve, reject or resolve the claim according to the demo policy.

Record the decision, actor and timestamp.

Do not silently approve refunds or claim that an external payment has been returned. All monetary outcomes are simulated.

The current model should reflect this operating principle:

**AuctionIT handles exceptions; it does not inspect every lot.**

---

# 17. Operations dashboard

Create a small, practical Operations workspace at `/ops`.

Do not turn it into an enterprise back-office application. Focus on the core prototype.

### Summary

- Live auctions.
- Closed auctions.
- Transactions awaiting action.
- Open assurance claims.
- Completed transactions.

Use seeded demo data and label it as such.

### Auction management

Operations can:

- View auction details and bid history.
- Close a demo auction when permitted.
- Inspect the winning result.
- View failed-to-clear outcomes.

Closing an auction must use actual bids, auction status, and reserve price.

### Assurance queue

Create a list of open/disputed claims with:

- Lot and transaction.
- Buyer and seller.
- Discrepancy claimed.
- Declared tolerance.
- Evidence attachments.
- Buyer-requested remedy.
- Seller response.
- Time since claim was opened.

### Review workflow

Operations opens a claim, reviews evidence, records a reasoned decision and changes the status.

Prevent review by non-Operations users.

### Audit trail

For sensitive state changes, record the actor, previous status, new status and timestamp where practical.

---

# 18. Notifications

Implement simple in-app notifications for the most important events:

- Listing published.
- Bid accepted.
- Bid rejected or outbid.
- Auction won/lost/closed.
- Balance payment simulated.
- Lifting scheduled/confirmed.
- Claim submitted.
- Seller response recorded.
- Claim resolved.
- Transaction completed.

Keep notifications relevant. They should link directly to the corresponding lot or transaction.

Email and SMS are outside the prototype scope.

---

# 19. Data model

Create a simple schema that supports the journeys above without needless complexity.

At minimum consider:

### Profiles

Identity, role, company association and onboarding status.

### Companies

Business details and seller/buyer capabilities where relevant.

### Lots

Seller ID, title, category, grade, description, location, estimated quantity, condition attributes, reserve price, EMD amount, auction dates/status and Lot Assurance settings.

### Lot media

Lot ID, file URL/path, media type, order and supporting information.

### Bids

Lot ID, bidder ID, bid amount per MT, timestamp and status.

### EMD records

Buyer, lot, amount, status, reference and simulated/real mode.

### Transactions

Lot, buyer, seller, winning bid, price per MT, final quantity, transaction status, payment status and lifting status.

### Lifting checks

Transaction, accepted quantity, weighbridge/ticket reference, grade/condition observations, evidence and check status.

### Assurance claims

Transaction, buyer, claim type, expected and observed details, requested remedy, evidence, status, seller response, Operations decision and timestamps.

### Notifications and audit records

The important user-facing notifications and history of sensitive changes.

Keep the database schema proportional to the demo. Prefer a few well-structured tables over unnecessary microservices or a complex event system.

Seed enough records to demonstrate different journeys, including:

- Active and upcoming auctions.
- An assured ferrous lot.
- A standard non-assured lot.
- A reserve-met closed auction.
- An unsold auction.
- A won transaction awaiting payment.
- A transaction awaiting lifting.
- A completed transaction.
- A disputed assurance claim waiting for Operations.

Label all these as demo examples.

---

# 20. Business rules and validation

Implement the following consistently across UI and API.

### Auctions

- Only published, open lots can accept bids.
- Auctions cannot start after their end time or accept bids once closed.
- The required minimum bid is determined from the current bid and configured increment.
- A winning bid must satisfy the reserve.
- The winner is determined from stored bids when the auction closes.
- If the reserve is not met, the auction closes unsold.
- Seller cannot bid on their own lot.

### Listings

- Required fields must be validated before publishing.
- Reserve price must be positive.
- Auction end must follow its start.
- Assurance requires the relevant category settings and required evidence.
- Drafts must be recoverable and editable.

### Transactions

- A won auction does not mean a transaction is completed.
- Only authorized users can perform their assigned transaction actions.
- Invalid state transitions must be rejected.
- Completion requires the necessary payment and lifting steps.

### Assurance

- Standard lots cannot enter the assurance claim flow.
- Claims require eligibility and supporting evidence.
- Quantity measurements and material quality assessments are distinct.
- Tolerance rules must be category-specific.
- Ambiguous cases are escalated to Operations.
- Remedies and refunds remain simulated and governed by an explicit demo policy.

### General

- Prevent duplicate submissions on important actions.
- Handle expired sessions and lost network connections.
- Do not lose unsaved form values unnecessarily.
- Do not show false success messages.
- Use meaningful loading, success, warning and error states.

---

# 21. Error, empty and edge states

These must be designed—not left as browser alerts or blank screens.

Cover at least:

- No matching auctions.
- No active bids.
- No seller listings.
- No transactions.
- No open claims.
- Required field missing.
- Invalid number/quantity/date.
- Auction already closed.
- Auction not started yet.
- Another bidder has placed a higher bid.
- Bid below minimum increment.
- EMD not completed.
- Evidence file type not supported.
- Evidence file too large.
- Upload interrupted or failed.
- Listing cannot be published.
- Duplicate submission.
- Transaction action not allowed in current state.
- Claim outside the tolerance.
- Claim submitted without mandatory evidence.
- Claim after the defined submission window.
- Unauthorized role access.
- Network/API failure.
- Backend unavailable.
- Demo data unavailable.

Each error should clearly answer:

1. What happened?
2. What does it mean for the user?
3. What can the user do next?

Provide retry actions where appropriate.

Use inline validation for forms, toasts for brief confirmations, confirmation dialogs for sensitive actions, and page-level error messages when the whole request fails.

---

# 22. Demo data and demonstration script

The application needs to be easy for me to demonstrate live to the CEO and COO in a short meeting.

Seed coherent demo data and provide role-based access so I can show these flows without manual database setup.

### Demo journey A — Buyer

1. Open the marketplace.
2. Browse live lots.
3. Open an assured HMS/mixed-steel lot.
4. Review the seller declaration, evidence, quantity-measurement rule, tolerance and remedy.
5. Simulate EMD payment.
6. Place a valid bid.
7. Show updated bid status.
8. Close/advance the demo auction as Operations.
9. Enter the winner's transaction.
10. Simulate balance payment.
11. Schedule lifting.
12. Record the accepted quantity and condition.
13. Complete the transaction, or submit an eligible assurance claim.
14. Show the final transaction state.

### Demo journey B — Seller

1. Enter Seller demo mode.
2. Open the seller dashboard.
3. Create a new scrap lot.
4. Enter category, grade, quantity, condition and location.
5. Upload or attach demonstration evidence.
6. Configure reserve and auction duration.
7. Review the assurance policy for the selected category.
8. Preview and publish the listing.
9. Return to the dashboard and see the listing in the correct state.
10. View its auction and transaction status.

### Demo journey C — Operations

1. Enter Operations demo mode.
2. Open the overview.
3. Review a disputed Lot Assurance claim.
4. Inspect the seller declaration, tolerance, measurements and submitted evidence.
5. Record a demo resolution.
6. Return to the dashboard and verify the status update and audit history.

Seed data must support these journeys coherently. Do not make a buyer, seller and Operations dashboard show contradictory states for the same transaction.

Make it possible to reset demo data to its initial state.

---

# 23. Product analytics and success metrics

The prototype should reflect the business outcome that motivated the product.

North Star:

**Completed transactions ÷ lots listed**

Other useful measures:

- Auction clear rate.
- Unique bidders per eligible lot.
- Mismatch-related defaults.
- Lots listed per month.
- Operations reviews per 100 completed transactions.
- Hammer price relative to reserve.

Build a modest demo overview or summary panel that connects the workflow to these metrics where feasible.

Do not invent real performance results or claim that the prototype has proven Lot Assurance works. Label simulated analytics as demo data.

Avoid building a large analytics suite. The core product journeys come first.

---

# 24. Quality bar

The application must feel coherent and polished, not merely technically functional.

Specifically:

- Consistent typography, spacing, colors and component behavior.
- Good information hierarchy and scan-friendly layouts.
- Useful seeded content and no lorem ipsum.
- No broken links or decorative buttons pretending to work.
- No duplicate navigation patterns.
- No needless onboarding friction.
- No dead ends in the core buyer, seller or Operations journeys.
- Sensible mobile layouts.
- Meaningful loading, empty, success and failure states.
- No exposed secrets.
- No inconsistent transaction states.
- No fake real-world payment claims.

Prefer well-executed core journeys over shallow implementation of every imaginable feature.

---

# 25. Required build and verification sequence

Work in this order.

### Phase 1 — Inspect and plan briefly

Inspect the repository and confirm the framework, package manager and existing code. Identify the smallest implementation path. Do not spend a long time writing a separate plan.

### Phase 2 — Build the core experience

Implement:

1. Shared design system and navigation.
2. Seeded auction catalogue.
3. Lot detail and Lot Assurance summary.
4. Demo role access.
5. Buyer bidding and auction lifecycle.
6. Seller listing wizard.
7. Post-win transaction and lifting workflow.
8. Claim and Operations review flow.

### Phase 3 — Backend and persistence

Implement the REST endpoints, schema, seed data, business validation and environment configuration.

Ensure the demo mode is deterministic and coherent. Use persistent database records when the backend is configured.

### Phase 4 — Complete the UI states

Implement validation, disabled states, confirmation dialogs, toasts, loading skeletons, empty states and useful error recovery.

### Phase 5 — Verify

Run the application locally.

Run available linting, type checks and tests.

Fix build errors, broken imports, runtime errors, API mismatches, inconsistent state transitions and obvious layout problems.

Exercise the core demo journeys with the seeded data.

Do not stop after generating the code. Run it and fix what can be fixed in the available environment.

### Phase 6 — Deployment readiness

Document how to deploy the frontend to Vercel, the API to Render and the database to Supabase.

Explain which environment variables must be configured and how to seed/reset the demo environment.

If deployment credentials are unavailable, leave the code deployment-ready and state exactly what manual setup remains. Do not claim deployment has succeeded unless it has actually succeeded.

---

# 26. Acceptance criteria

The build is ready for the CEO/COO demonstration when all of the following work:

- A guest can browse lots and open a meaningful lot detail page.
- A buyer can enter the demo, simulate EMD, place a bid and see the result.
- The auction can be closed and the actual winning bid is selected based on stored bids and the reserve.
- A winning buyer can complete the simulated post-win steps and track lifting.
- An assured transaction can record a quantity/condition check.
- An eligible claim can be submitted with evidence.
- Operations can review and resolve a disputed claim.
- A seller can create, preview and publish an auction listing.
- The same listing and transaction state is reflected across the relevant roles.
- Invalid actions are blocked with clear explanations.
- Demo data is visibly labelled.
- The core journey works without real payment credentials.
- The application builds and runs without known blocking errors.
- README and deployment instructions are present.

## Final instruction

Make strong product decisions rather than building everything mechanically.

If a feature is not necessary to demonstrate the core business idea, leave it out. If a business policy is unknown, use a configurable, explicitly labelled demo assumption rather than pretending to know the real rule.

The final result should communicate this product idea through the experience itself:

**The auction does not change. The buyer gets a clearer understanding of the material, the measurement rules and the outcome if the material differs—and AuctionIT has a defined way to handle exceptions without manually inspecting every lot.**

Do not return only with a plan or ask me to approve every implementation decision. Work through the phases in order, ending each with a short report.