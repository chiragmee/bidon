---
version: alpha
name: AuctionIT
description: Design system for AuctionIT, a B2B marketplace for industrial scrap and surplus auctions in India, with Lot Assurance as its trust layer.
colors:
  primary: "#0F4C5C"
  primary-hover: "#0B3B48"
  primary-container: "#EFF6F7"
  on-primary: "#FFFFFF"
  on-primary-container: "#0B3B48"
  action: "#BD5418"
  action-hover: "#9A4413"
  action-accent: "#E8772E"
  action-container: "#FEF4EC"
  on-action: "#FFFFFF"
  on-action-container: "#9A4413"
  canvas: "#F7F8FA"
  surface: "#FFFFFF"
  surface-muted: "#F1F4F7"
  border: "#E2E8F0"
  border-strong: "#CBD5E1"
  border-control: "#7C8A9D"
  primary-line: "#1C5F6D"
  text: "#1E293B"
  text-secondary: "#5F6E82"
  text-strong: "#0F172A"
  success: "#15803D"
  success-container: "#F0FDF4"
  warning: "#B45309"
  warning-container: "#FFFBEB"
  danger: "#B91C1C"
  danger-container: "#FEF2F2"
  trust-declared: "#F1F4F7"
  on-trust-declared: "#334155"
  trust-evidence: "#FFFFFF"
  on-trust-evidence: "#145466"
  trust-confirmed: "#0F4C5C"
  on-trust-confirmed: "#FFFFFF"
typography:
  display:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 600
    lineHeight: 3rem
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 2.375rem
    letterSpacing: -0.015em
  h2:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 2rem
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.75rem
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
  label-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.25rem
  caption:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1rem
  overline:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: 600
    lineHeight: 1rem
    letterSpacing: 0.06em
  price-xl:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 2.5rem
    letterSpacing: -0.02em
    fontFeature: "'tnum' 1"
  price-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.5rem
    fontFeature: "'tnum' 1"
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 0 16px
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.on-action}"
  button-primary-large:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary-hover}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: 40px
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: 40px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 0 12px
  input-error:
    backgroundColor: "{colors.danger-container}"
    textColor: "{colors.danger}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  input-outline:
    backgroundColor: "{colors.border-control}"
    width: 1px
  helper-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.caption}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 16px
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
  nav-top:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    height: 64px
  nav-sidebar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    width: 240px
  table-header:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-trust-declared}"
    typography: "{typography.overline}"
    height: 40px
  bid-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    typography: "{typography.price-xl}"
    rounded: "{rounded.lg}"
    width: 384px
    padding: 24px
  badge-live:
    backgroundColor: "{colors.action-container}"
    textColor: "{colors.on-action-container}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
  badge-live-dot:
    backgroundColor: "{colors.action-accent}"
    size: 8px
  badge-upcoming:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-trust-declared}"
    rounded: "{rounded.full}"
  badge-reserve-met:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.full}"
  badge-success:
    backgroundColor: "{colors.success-container}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  badge-warning:
    backgroundColor: "{colors.warning-container}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
  badge-danger:
    backgroundColor: "{colors.danger-container}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
  trust-declared:
    backgroundColor: "{colors.trust-declared}"
    textColor: "{colors.on-trust-declared}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
  trust-evidence:
    backgroundColor: "{colors.trust-evidence}"
    textColor: "{colors.on-trust-evidence}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
  trust-evidence-border:
    backgroundColor: "{colors.primary-line}"
    width: 1px
  divider-strong:
    backgroundColor: "{colors.border-strong}"
    height: 1px
  trust-confirmed:
    backgroundColor: "{colors.trust-confirmed}"
    textColor: "{colors.on-trust-confirmed}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
  assurance-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 24px
  assurance-card-header:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.h3}"
  demo-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-trust-declared}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
  toast:
    backgroundColor: "{colors.text-strong}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 24px
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    typography: "{typography.h2}"
    rounded: "{rounded.lg}"
  stat-card-attention:
    backgroundColor: "{colors.warning-container}"
    textColor: "{colors.warning}"
  countdown-urgent:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-action-container}"
    typography: "{typography.caption}"
---

## Overview

AuctionIT is where procurement teams and scrap traders buy and sell industrial surplus — HMS steel, copper, aluminium, e-waste, used machinery — through online auctions. The people using it are practical and busy, often on a phone in a yard, and they are about to commit lakhs of rupees to material they have not touched.

The feel is **calm industrial confidence**: a well-run procurement desk, not a trading floor. Quiet surfaces, dense but readable information, precise numbers, and exactly one obvious next step on every screen. Trust is shown, not claimed — the interface always makes clear whether a fact was declared by the seller, backed by attached evidence, or confirmed at the weighbridge.

Design for the anxious moment of a buyer deciding whether to bid ₹13 lakh on 40 MT of scrap they have only seen in photos. Every screen should reduce that anxiety with clarity, never with decoration.

Every screen carries a small "Demo Mode" pill; all companies, prices, ratings and metrics are sample data.

## Colors

Two brand colours with strictly separated jobs, on a cool neutral base.

- **Primary teal (#0F4C5C):** Trust and structure — navigation, sidebar, headings, links, the Lot Assurance identity, and "Confirmed at lifting" badges. It says "you can rely on this."
- **Action orange (#BD5418):** The fill for primary buttons only ("Place bid", "Pay EMD", "Publish"). Darkened from the brand orange so white button text passes WCAG AA (≈4.7:1).
- **Accent orange (#E8772E):** The brand orange — marks only, always beside a word: the live-auction pulse dot, the centre of the current stepper step. Never text and never a fill under text (2.95:1 on white).
- **Canvas (#F7F8FA) / Surface (#FFFFFF):** Pages sit on canvas; cards, tables, panels and modals are white with a 1px #E2E8F0 border.
- **Text (#1E293B), Secondary (#5F6E82), Strong (#0F172A):** Body, metadata and key figures. Secondary is the lightest colour allowed for readable text (4.7:1 or better on every surface).
- **Borders:** hairlines #E2E8F0 for cards and tables (decorative); control borders #7C8A9D on inputs, selects, checkboxes (3.5:1, as WCAG requires for controls).
- **Semantic:** Success green #15803D (Leading, Won, Within tolerance, Completed), warning amber #B45309 (Outbid, awaiting action), danger red #B91C1C (errors, Outside tolerance, destructive actions only). Each pairs with a pale container tint for badges and banners.

**Trust tiers — the signature of this system.** Every fact on an assured lot is tagged with one of three badges, increasing in visual weight as certainty increases:

1. **Seller declared** — neutral grey fill (#F1F4F7), slate text, quote/user icon. A claim, not proof.
2. **Evidence attached** — white fill, 1px teal (#1C5F6D) border, teal text, paperclip/camera icon. Proof exists for the buyer to inspect.
3. **Confirmed at lifting** — solid teal (#0F4C5C), white text, check-scale icon. Measured at the certified weighbridge or recorded at lifting.

Never use the word "Verified" and never colour a declaration as if it were confirmed. Standard (non-assured) lots carry no warning colour — they simply lack the assurance shield.

## Typography

**Inter** for everything, with tabular figures (`tnum`) on every number so prices, quantities and countdowns align in columns and don't jitter as they update.

- **Display 40/48 semibold** — landing hero only.
- **H1 30/38, H2 24/32, H3 18/28 semibold** — page titles, section titles, card titles. Sentence case always.
- **Body-md 14/20** is the default inside the app (B2B density); **Body-lg 16/24** for landing pages and onboarding.
- **Label 14/20 medium** for buttons and form labels; **Caption 12/16 medium** for badges and metadata; **Overline 11/16 semibold, uppercase, +0.06em** for table headers and section eyebrows.
- **Price-xl 32/40** for the current bid in the bid panel; **Price-md 18/24** for prices on cards.

Number formatting: Indian grouping with ₹ (₹34,500/MT, ₹1,00,000, ₹13,89,600). Always show the unit — "/MT" on rates, "MT" on quantities, "~" for estimates (~40 MT). Countdowns as "Closes in 3h 42m"; under one hour, "Closes in 42:18" in dark orange #9A4413.

## Layout

- **4px base grid.** Spacing scale: 4, 8, 12, 16, 24, 32, 48, 80.
- **Desktop (1440px):** 12-column grid, content max-width 1280px, 24px gutters. Public pages use a 64px top nav; signed-in workspaces use a 240px teal sidebar (collapsible to 72px) plus a 64px top bar.
- **Catalogue:** 280px filter rail + 3-column card grid (24px gaps).
- **Lot detail:** 65/35 split — scrolling content left, a 384px sticky bid panel right (top offset 88px).
- **Forms:** single column, max 560px wide, labels above fields, 24px between fields, sticky footer with Back / primary action.
- **Tables:** 48px rows, 40px header row, numbers right-aligned.
- **Breakpoints:** 390 (mobile), 768 (tablet), 1024 (small desktop), 1440 (desktop). On mobile: 16px gutters, cards stack, filters move to a bottom sheet, the bid panel becomes a sticky bottom bar, the sidebar becomes a bottom tab bar. No horizontal page scroll, ever.
- **One primary action per screen.** It is the only orange button visible in the viewport.

## Elevation & Depth

Depth comes from borders and tone, not shadows. Most surfaces are flat white with a 1px #E2E8F0 border on the #F7F8FA canvas.

- **Level 0:** border only — cards, tables, form fields.
- **Level 1:** `0 1px 2px rgba(15,23,42,0.06)` — hovered cards, sticky bid panel.
- **Level 2:** `0 4px 12px rgba(15,23,42,0.08)` — dropdowns, popovers, sticky mobile bars.
- **Level 3:** `0 12px 32px rgba(15,23,42,0.12)` plus a rgba(15,23,42,0.4) scrim — modals and confirmation dialogs.

Motion is functional only: 150ms ease-out for hovers and state changes, 200ms for overlays. The single continuous animation in the product is the live-auction pulse dot. Respect reduced-motion preferences.

## Shapes

- **4px** — trust badges, small chips, checkboxes.
- **8px** — buttons, inputs, selects, toasts.
- **12px** — cards, panels, modals, image galleries.
- **Full (pill)** — auction status badges, the Demo Mode pill, avatars, filter chips.

Icons: Lucide-style line icons, 1.5px stroke, 16px inline / 20px in buttons and navigation. Material photos use 16:10 on cards and 4:3 in the gallery, 12px radius; failed images fall back to a canvas-tinted tile with a category icon, never a broken-image glyph.

## Components

- **Buttons.** Primary: action orange fill, white label, 40px (48px for "Place bid"). Secondary: white with 1px teal border and teal label. Ghost: text only. Danger: red fill, used only inside confirmation dialogs. Labels are verbs in sentence case ("Place bid", "Pay EMD", "Record decision"). Disabled buttons drop to 40% opacity and explain why on hover or in helper text.
- **Inputs.** 40px, white, 1px #7C8A9D border, 8px radius; 2px teal focus ring with 2px offset. Error: red border, red helper text with an alert icon, message states what happened and how to fix it. Currency inputs show a ₹ prefix and /MT suffix.
- **Lot card.** 16:10 image with status pill top-left and Lot Assurance shield top-right (assured lots only); title (H3), category · grade, location with pin, "~40 MT", current bid (Price-md) with bid count, countdown, and a seller track-record line when history exists.
- **Bid panel.** Sticky white card: "Current highest bid" label, Price-xl figure, reserve status pill, countdown, minimum next bid, EMD row with status, full-width 48px primary button, estimated total in caption text.
- **Lot Assurance summary card.** White card whose header band is pale teal (#EFF6F7) with a teal shield icon, title and one-line promise; a pale canvas footer states the claim rule. Rows answer, in plain language: what the seller declared, what evidence is attached, what is checked at lifting, the agreed tolerance, the remedy if outside tolerance, and how to claim. Each row ends with its trust-tier badge; illustrative values carry a "Demo policy" caption.
- **Status badges.** Live (orange tint + pulsing accent dot), Upcoming (grey), Closed · Reserve met (teal tint), Unsold (grey), Awarded/Won/Leading/Completed (green), Outbid/Awaiting action (amber), Rejected/Outside tolerance (red).
- **Transaction stepper.** Horizontal on desktop, vertical on mobile: Won → Balance paid → Lifting scheduled → Material checked → Completed. Done steps solid teal with a check, current step a dark-orange (#BD5418) ring with a bright-orange centre and bold label, future steps grey outline. A claim replaces the current step in amber with a flag icon.
- **Stat card.** White, 12px radius, overline label, H2 figure, one caption line of context; the one card needing attention gets a pale amber fill and an amber label with an alert icon. No charts or trend arrows.
- **Tables.** Grey overline header (#334155 text on #F1F4F7), 48px rows, hover tint #F7F8FA, right-aligned numbers, one text-link action per row.
- **Modals.** Max 480px (confirmation) or 640px (forms), 24px padding, title + one-line consequence + primary and secondary buttons. Consequential actions always confirm.
- **Toasts.** Dark slate, white text, bottom-centre, 4 seconds, for brief confirmations only. Important outcomes also appear on the page.
- **Banners.** Full-width tinted strip (success/warning/danger/info) with icon, one sentence and an optional action.
- **Empty states.** Simple line icon, one-line headline, one sentence of guidance, one button back to something useful ("Browse auctions").
- **Demo Mode pill.** White pill with a 1px dashed slate border, flask icon, "Demo Mode" in caption text; demo-only actions (simulate payment, close demo auction) use a dashed-border secondary button and a "Demo" caption.

## Do's and Don'ts

**Do**
- Make the next action obvious — one orange button per viewport.
- Tag every assured-lot fact with its trust tier.
- Write in plain language: "Pay EMD to start bidding", not "Initiate earnest money remittance".
- Write errors that answer: what happened, what it means, what to do next.
- Show units and Indian number formatting on every figure.
- Label sample data and simulated payments clearly.
- Keep 4.5:1 contrast for all text; use the darker action orange for any button with text.

**Don't**
- Don't say "Verified", "Guaranteed" or "Certified" unless that step has actually happened.
- Don't put any text on, or in, the bright accent orange (#E8772E).
- Don't use coloured left-border accents on cards.
- Don't use gradients, glassmorphism, neon, decorative illustrations, robot/AI imagery or stock handshake photos.
- Don't mark standard lots as risky — they just lack the assurance shield.
- Don't add testimonials, customer logos or live-looking marketplace statistics.
- Don't use more than one primary button, or red for anything that isn't an error or destructive action.
- Don't show a working bid button on a closed or upcoming auction.
