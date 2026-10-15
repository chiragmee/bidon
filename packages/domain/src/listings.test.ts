import { describe, expect, it } from 'vitest';
import type { ListingDraft } from './listing';
import { deleteDraft, publishLot, registerSeller, saveDraft, type SellerRegistration } from './listings';
import { payEmd, placeBid } from './operations';
import { createSeed, type DemoState } from './seed';
import { sellerDashboard, sellerLot } from './sellerViews';
import type { LotMedia } from './types';
import { listLots, lotDetail } from './views';

const NOW = '2026-10-15T06:30:00.000Z';
const t = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();
const SURESH = { id: 'U-SURESH', role: 'seller' as const };
const RAHUL = { id: 'U-RAHUL', role: 'buyer' as const };

function ok<T>(r: { ok: true; state: DemoState; value: T } | { ok: false; error: { what: string } }) {
  if (!r.ok) throw new Error(r.error.what);
  return r;
}
const media = (kind: LotMedia['kind'], n: number): LotMedia[] =>
  Array.from({ length: n }, (_, i) => ({ id: `M-${kind}-${i}`, kind, url: '', caption: `${kind} ${i}`, stage: 'listing', uploadedAt: NOW }));

const step1: ListingDraft = { title: 'MS plate cuttings, fabrication yard', category: 'ferrous_hms', grade: 'MS plate cuttings', description: 'Plasma-cut offcuts.', yard: 'Raipur Yard #4', city: 'Raipur', state: 'Chhattisgarh' };
const step2: ListingDraft = { ...step1, estimatedQtyMt: 18, contaminationPct: 2, attributes: { form: 'Plate offcuts', thickness: '8–20 mm' } };
const step4: ListingDraft = { ...step2, reservePerMt: 33_000, startAt: t(1), endAt: t(26), assuranceEnabled: true, assuranceAgreed: true };

describe('journey B in the domain: draft → evidence → publish', () => {
  it('autosaves a draft, blocks publish with reasons, then publishes once valid', () => {
    let s = createSeed(NOW);
    const created = ok(saveDraft(s, { draft: step1 }, SURESH, NOW));
    s = created.state;
    const id = created.value.id;
    expect(id).toBe('LOT-2000');
    expect(created.value).toMatchObject({ status: 'draft', sellerCompanyId: 'C-BALAJI', reservePerMt: 0 });

    s = ok(saveDraft(s, { lotId: id, draft: step4 }, SURESH, NOW)).state;
    expect(s.lots.find((l) => l.id === id)?.emdAmount).toBe(50_000); // 7.5% of 33,000 × 18, rounded up
    const blocked = publishLot(s, id, SURESH, NOW);
    expect(blocked.ok ? 'ok' : blocked.error.code).toBe('cannot_publish');
    if (!blocked.ok) expect(blocked.error.what).toMatch(/at least 6 photos and 1 video/);
    expect(sellerLot(s, id, 'U-SURESH', NOW)?.blockers.map((b) => b.field)).toEqual(['assuranceEnabled']);

    s = ok(saveDraft(s, { lotId: id, draft: { ...step4, media: [...media('photo', 6), ...media('video', 1)] } }, SURESH, NOW)).state;
    const pub = ok(publishLot(s, id, SURESH, NOW));
    expect(pub.value).toMatchObject({ status: 'scheduled', publishedAt: NOW, assurance: { enabled: true, agreedAt: NOW } });
    expect(pub.state.notifications.at(-1)).toMatchObject({ userId: 'U-SURESH', kind: 'listing_published', href: `/seller/lots/${id}` });

    // Status follows start time; buyers see it in the catalogue.
    expect(listLots(pub.state, { statuses: ['upcoming'] }, NOW).items.map((i) => i.id)).toContain(id);
    expect(lotDetail(pub.state, id, RAHUL, t(2))?.status).toBe('live');
    expect(sellerDashboard(pub.state, 'U-SURESH', NOW)?.lots.find((l) => l.id === id)?.tab).toBe('scheduled');
  });

  it('a lot starting now is live immediately after publishing', () => {
    let s = createSeed(NOW);
    const r = ok(saveDraft(s, { draft: { ...step4, assuranceEnabled: false, startAt: NOW, endAt: t(3) } }, SURESH, NOW));
    s = ok(publishLot(r.state, r.value.id, SURESH, NOW)).state;
    expect(listLots(s, {}, NOW).items.find((i) => i.id === r.value.id)?.status).toBe('live');
  });

  it('standard categories cannot carry assurance, and drop it silently in storage', () => {
    const r = ok(saveDraft(createSeed(NOW), { draft: { ...step4, category: 'non_ferrous', attributes: { alloy: 'Cu', form: 'Wire' } } }, SURESH, NOW));
    expect(r.value.assurance.enabled).toBe(false);
    expect(r.value.declaration.contaminationPct).toBe(2);
  });
});

describe('editing rules (§14)', () => {
  function published() {
    const s = createSeed(NOW);
    const r = ok(saveDraft(s, { draft: { ...step4, assuranceEnabled: false } }, SURESH, NOW));
    return { s: ok(publishLot(r.state, r.value.id, SURESH, NOW)).state, id: r.value.id };
  }

  it('scheduled lots can be edited before opening, but must stay valid', () => {
    const { s, id } = published();
    expect(ok(saveDraft(s, { lotId: id, draft: { ...step4, assuranceEnabled: false, reservePerMt: 34_000 } }, SURESH, NOW)).value.reservePerMt).toBe(34_000);
    const bad = saveDraft(s, { lotId: id, draft: { ...step4, assuranceEnabled: false, reservePerMt: 0 } }, SURESH, NOW);
    expect(bad.ok ? 'ok' : bad.error.code).toBe('invalid');
  });

  it('live lots cannot be edited and say why; bids and winners never', () => {
    const { s, id } = published();
    const live = saveDraft(s, { lotId: id, draft: step4 }, SURESH, t(2));
    expect(live.ok ? 'ok' : live.error.what).toMatch(/Live auctions cannot be edited/);
    const view = sellerLot(s, id, 'U-SURESH', t(2))!;
    expect(view.edit.details?.code).toBe('not_editable');
    expect(view.edit.bids?.what).toMatch(/cannot be changed by anyone/);
    // A bid on the live lot keeps it that way.
    let st = ok(payEmd(s, { lotId: id, outcome: 'success' }, RAHUL, t(2))).state;
    st = ok(placeBid(st, { lotId: id, amountPerMt: 33_500, clientRequestId: 'x', seenHighestPerMt: null }, RAHUL, t(2))).state;
    expect(sellerDashboard(st, 'U-SURESH', t(2))?.lots.find((l) => l.id === id)).toMatchObject({ tab: 'live', bidCount: 1, highestBidPerMt: 33_500 });
  });

  it.each([
    [{ id: 'U-RAHUL', role: 'buyer' as const }, 'forbidden'],
    [{ id: 'U-IMRAN', role: 'seller' as const }, 'not_owner'],
  ])('%o cannot edit Shree Balaji’s draft', (actor, code) => {
    const r = saveDraft(createSeed(NOW), { lotId: 'LOT-2025-0920', draft: step1 }, actor, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });

  it('publish and delete guards', () => {
    const s = createSeed(NOW);
    const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);
    expect(code(publishLot(s, 'NOPE', SURESH, NOW))).toBe('not_found');
    expect(code(publishLot(s, 'LOT-2025-0920', { id: 'U-IMRAN', role: 'seller' }, NOW))).toBe('forbidden');
    expect(code(publishLot(s, 'LOT-2025-0891', SURESH, NOW))).toBe('already_published');
    expect(code(saveDraft(s, { lotId: 'NOPE', draft: step1 }, SURESH, NOW))).toBe('not_found');
    expect(code(deleteDraft(s, 'LOT-2025-0891', SURESH, NOW))).toBe('not_draft');
    expect(code(deleteDraft(s, 'NOPE', SURESH, NOW))).toBe('not_found');
    const del = ok(deleteDraft(s, 'LOT-2025-0920', SURESH, NOW));
    expect(del.state.lots.some((l) => l.id === 'LOT-2025-0920')).toBe(false);
    expect(sellerLot(s, 'LOT-2025-0891', 'U-IMRAN', NOW)).toBeNull();
  });
});

describe('seller dashboard (seed)', () => {
  it('Shree Balaji: tabs, stats, track record and the lifting confirmation to do', () => {
    const d = sellerDashboard(createSeed(NOW), 'U-SURESH', NOW)!;
    expect(d.company.name).toBe('Shree Balaji Steels');
    expect(d.tabs).toEqual({ drafts: 1, scheduled: 1, live: 1, closed: 9 });
    expect(d.stats).toMatchObject({ live: 1, upcoming: 1, drafts: 1, completed: 6, claimsToAnswer: 0 });
    expect(d.trackRecordText).toBe('6 completed sales · 1 resolved claim');
    expect(d.transactions[0]).toMatchObject({ id: 'TX-1045', yourTurn: true });
    expect(d.lots.find((l) => l.id === 'LOT-2025-0920')?.blockers).toBeGreaterThan(0);
    expect(sellerDashboard(createSeed(NOW), 'U-RAHUL', NOW)).toBeNull();
  });
});

describe('registerSeller (§12.1)', () => {
  const good: SellerRegistration = {
    name: 'Kavita Rao',
    companyName: 'Rao Metal Works',
    businessType: 'Fabricator',
    yard: 'Plot 12, MIDC',
    city: 'Nagpur',
    state: 'Maharashtra',
    categories: ['ferrous_hms'],
    email: 'kavita@raometal.example',
    phone: '98765 43210',
  };
  it('creates a real (non-sample) seller, active without document checks, who can then list', () => {
    const r = ok(registerSeller(createSeed(NOW), good, NOW));
    expect(r.value.company).toMatchObject({ kind: 'seller', verification: 'demo_approved', sample: false, yard: 'Plot 12, MIDC' });
    const d = sellerDashboard(r.state, r.value.user.id, NOW)!;
    expect(d.trackRecord.hasHistory).toBe(false);
    expect(d.lots).toEqual([]);
    expect(saveDraft(r.state, { draft: step1 }, { id: r.value.user.id, role: 'seller' }, NOW).ok).toBe(true);
  });
  it.each([
    [{ companyName: '', categories: [] }, 'incomplete_profile'],
    [{ email: 'x@y' }, 'invalid_email'],
    [{ phone: '123' }, 'invalid_phone'],
    [{ email: 'suresh@balajisteels.example' }, 'duplicate_email'],
  ] as const)('%o → %s', (patch, code) => {
    const r = registerSeller(createSeed(NOW), { ...good, ...patch } as SellerRegistration, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe(code);
  });
  it('a seller without a company cannot create lots', () => {
    const s = createSeed(NOW);
    s.users.push({ id: 'U-X', name: 'X', email: 'x@x.example', role: 'seller', companyId: null, title: '' });
    const r = saveDraft(s, { draft: step1 }, { id: 'U-X', role: 'seller' }, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe('no_company');
  });
});
