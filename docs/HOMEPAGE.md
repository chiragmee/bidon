# Homepage and help pages — Phase 1 information architecture (2026-10-15)

Why: the old landing page mixed a process diagram ("How a lot moves"), demo entry cards, a full Lot Assurance section and
featured lots with no images and no clear path for a first-time buyer or seller. Phase 1 needs: what Bid ON is, what
is on sale, how to start (sign up → get approved → trade), and why it can be trusted — once each, without repetition.

## Pages and what each one owns

| Page | Owns | Does not repeat |
|---|---|---|
| `/` Home | Value proposition, live auctions, categories, 4-step start for buyers and sellers, why Bid ON, one call to action | Detailed rules, documents, payment mechanics, Lot Assurance detail |
| `/how-it-works` (new) | The full Phase 1 process for buyers and sellers, documents for approval, deposits and payments, how auctions close, lifting and weighbridge, FAQ | Lot Assurance detail (links to it) |
| `/lot-assurance` | The optional assurance layer for eligible steel lots | General process |
| `/auctions` | Finding lots | — |

## Home, top to bottom

1. **Hero** — headline, one sentence, primary "Browse auctions", secondary "Start selling"; yard photograph.
2. **Trust strip** — four short facts: approved businesses only · payments go straight to the seller · highest bid meeting the reserve wins · quantity settled at the weighbridge.
3. **Live and upcoming auctions** — real lots; a useful empty state when none are open.
4. **What's traded** — photo cards linking to the filtered catalogue.
5. **How to start** — Buyers / Sellers tabs, four steps each, photo; link to `/how-it-works`.
6. **Why Bid ON** — four pillars beside a weighbridge photograph.
7. **Lot Assurance** — one compact band linking to `/lot-assurance`.
8. **Call to action** — create a buyer or seller account.

Header (guest): Auctions · How it works · Lot Assurance · Sell on Bid ON; Sign in; Create account.
Footer: three short columns; one line on money; sample-data note only in demo mode.

Images: from the approved Stitch designs (`design/stitch/*`), downloaded into `apps/web/public/images/home` and
`public/demo-images`; images with design-tool UI baked in were excluded. No fees are mentioned (not decided — D-097).
