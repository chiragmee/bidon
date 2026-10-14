# Decisions log

One line each: ID · date · decision — why.

- D-001 · 2026-10-15 · Repo layout matches CLAUDE.md: spec at `docs/SPEC.md`, Stitch designs unzipped to `design/stitch/` — so the paths CLAUDE.md references are real.
- D-002 · 2026-10-15 · Removed `design.md_1.md` / `design.md_2.md` from the Stitch export — byte-identical to root `DESIGN.md`.
- D-003 · 2026-10-15 · Stitch's auto-generated `industrial_trust_exchange/DESIGN.md` kept as `design/stitch/SUPERSEDED-stitch-generated-DESIGN.md` for reference only — root `DESIGN.md` is the design authority.
- D-004 · 2026-10-15 · Original zip kept locally but git-ignored — contents are committed unzipped; avoids a 9 MB duplicate in history.
- D-005 · 2026-10-15 · Stitch copy rewritten where it breaks honesty rules: drop "Verified", "Certified", "guarantee", "escrow", "NABL Accredited", "EXIF/Geotag verified", "Tier 1/2/3", "RTGS", "MCA/GSTN verified", "Synced via API"; use the three trust tags and "Demo policy"/"Sample data"/"Simulated" — CLAUDE.md honesty rules and DESIGN.md Don'ts outrank Stitch copy.
- D-006 · 2026-10-15 · Canonical seed in PLAN §4 resolves Stitch contradictions (LOT-0891 ~40 vs ~45 MT, ₹34,500 vs ₹36,200; TX-1042 shown on the live lot; balance ₹12,96,000 vs ₹14,40,000 − EMD): TX-1042 moves to its own awarded lot LOT-2025-0873; balance = est. qty × rate − EMD = ₹13,40,000.
- D-007 · 2026-10-15 · Ops overview metrics come from the seed and are labelled "Sample data", not the Stitch figures (87.4% North Star, 184 completed) — avoids live-looking statistics (DESIGN.md Don'ts, §23).
- D-008 · 2026-10-15 · Proposed price-adjustment remedy (demo policy): deduction = (observed − tolerance) pts × measured MT × rate — payable is based on measured quantity (CLAUDE.md). For CLM-1042-01: 6% × 38.6 × ₹36,000 = ₹83,376 (Stitch showed ₹86,400 using 40 MT). Approved with plan 2026-10-15.
- D-009 · 2026-10-15 · Build journeys on `DemoDataSource` first (phases 4–6), then the HTTP/Supabase path (phase 7) — keeps a demoable app at every checkpoint; both share `packages/domain` so they cannot diverge.
