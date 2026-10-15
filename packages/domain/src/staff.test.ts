import { describe, expect, it } from 'vitest';
import { accountView, addDocument, canViewDocument, eligibilityQueue, eligibilityReview, reviewEligibility, saveEligibility, submitEligibility, type EligibilityInput } from './eligibility';
import { publishLot, saveDraft } from './listings';
import { registerBuyer } from './operations';
import { INDIAN_STATES, REGIONS, regionOf, stateFromGstin } from './regions';
import { createSeed, type DemoState } from './seed';
import { appointReviewer, removeReviewer, setApplicationState, setReviewerRegions, staffAccess, teamView } from './staff';
import type { ListingDraft } from './listing';
import type { DocumentKind, LotMedia } from './types';

const NOW = '2026-10-16T06:30:00.000Z';
const ADMIN = { id: 'U-DEVENDRA', role: 'ops' as const };

function must<T>(r: { ok: true; value: T; state: DemoState } | { ok: false; error: { code: string; what: string } }) {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.what}`);
  return r;
}
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

const app = (state: string, n: string): EligibilityInput => ({
  entityType: 'proprietorship',
  legalName: `Applicant ${n}`,
  pan: `AAAPN${n}K`,
  gstin: '',
  registrationNumber: '',
  registeredAddress: 'Plot 4, Industrial Area, Some City 400001',
  state,
  representative: { name: 'A Person', designation: 'Proprietor' },
  sellerDeclaration: null,
  bankDetails: null,
});
const DOCS: DocumentKind[] = ['pan_card', 'constitution', 'address_proof', 'representative_id'];

/** A buyer from `state` who has submitted a complete application. */
function submitted(s: DemoState, state: string, n: string) {
  const r = must(registerBuyer(s, { name: `Buyer ${n}`, email: `b${n}@x.example`, phone: `98765${n}0`, companyName: `Co ${n}`, businessType: 'Scrap trader / stockist', city: 'City', state: 'Somewhere', industry: 'Steel', materials: ['Ferrous / HMS'] }, NOW));
  const actor = { id: r.value.user.id, role: 'buyer' as const };
  let st = must(saveEligibility(r.state, app(state, n), actor, NOW)).state;
  for (const k of DOCS) st = must(addDocument(st, { kind: k, fileName: `${k}.pdf`, contentType: 'application/pdf', size: 1, path: `p/${n}/${k}` }, actor, NOW)).state;
  st = must(submitEligibility(st, actor, NOW)).state;
  return { st, actor, companyId: r.value.company.id };
}

function withReviewers() {
  let s = createSeed(NOW);
  s = must(appointReviewer(s, { name: 'Wasim West', email: 'west@auctionit.example', regions: ['west'], authUserId: null }, ADMIN, NOW)).state;
  const west = s.users.at(-1)!.id;
  s = must(appointReviewer(s, { name: 'Sunita South', email: 'south@auctionit.example', regions: ['south', 'central'], authUserId: null }, ADMIN, NOW)).state;
  const south = s.users.at(-1)!.id;
  return { s, west, south };
}

describe('regions', () => {
  it('every state and UT maps to exactly one of the five regions; eastern states are Central', () => {
    expect(INDIAN_STATES).toHaveLength(36);
    expect(new Set(INDIAN_STATES.map((s) => s.code)).size).toBe(36);
    expect(new Set(INDIAN_STATES.map((s) => s.gst)).size).toBe(36);
    for (const s of INDIAN_STATES) expect(REGIONS).toContain(s.region);
    expect(['BR', 'JH', 'OD', 'WB'].map(regionOf)).toEqual(['central', 'central', 'central', 'central']);
    expect(regionOf('MH')).toBe('west');
    expect(regionOf('AS')).toBe('north_east');
    expect(regionOf('')).toBeNull();
  });

  it('the GSTIN’s first two digits give the state', () => {
    expect(stateFromGstin('27AABCN1234F1Z5')?.code).toBe('MH');
    expect(stateFromGstin('29AAACB1234C1Z1')?.code).toBe('KA');
    expect(stateFromGstin('')).toBeNull();
  });
});

describe('staff: admin and regional reviewers', () => {
  it('the state of the registered address is required to submit', () => {
    const r = must(registerBuyer(createSeed(NOW), { name: 'X', email: 'x@x.example', phone: '9876500000', companyName: 'X Co', businessType: 'Scrap trader / stockist', city: 'C', state: 'S', industry: 'Steel', materials: ['Ferrous / HMS'] }, NOW));
    const actor = { id: r.value.user.id, role: 'buyer' as const };
    const st = must(saveEligibility(r.state, app('', '1234'), actor, NOW)).state;
    expect(accountView(st, actor.id)?.problems.map((p) => p.field)).toContain('state');
    const bad = must(saveEligibility(r.state, app('ZZ', '1234'), actor, NOW)).state;
    expect(accountView(bad, actor.id)?.eligibility.state).toBe('');
  });

  it('a reviewer sees, opens and decides only applications from their regions; the admin sees all', () => {
    const { s, west, south } = withReviewers();
    const mh = submitted(s, 'MH', '1001');
    const ka = submitted(mh.st, 'KA', '1002');
    const st = ka.st;
    const ids = (v: string) => eligibilityQueue(st, v).waiting.map((r) => r.companyId);
    expect(ids('U-DEVENDRA')).toEqual([mh.companyId, ka.companyId]);
    expect(ids(west)).toEqual([mh.companyId]);
    expect(ids(south)).toEqual([ka.companyId]);
    expect(eligibilityQueue(st, west).waiting[0]).toMatchObject({ region: 'west', regionLabel: 'West', stateName: 'Maharashtra' });
    expect(eligibilityReview(st, ka.companyId, west)).toBeNull();
    expect(eligibilityReview(st, ka.companyId, south)?.regionLabel).toBe('South');

    const wrong = reviewEligibility(st, ka.companyId, { decision: 'approved', reason: '' }, { id: west, role: 'ops' }, NOW);
    expect(code(wrong)).toBe('other_region');
    expect(code(reviewEligibility(st, ka.companyId, { decision: 'approved', reason: '' }, { id: south, role: 'ops' }, NOW))).toBe('ok');

    const doc = st.documents.find((d) => d.companyId === ka.companyId)!;
    expect(canViewDocument(st, doc.id, { id: west, role: 'ops' })).toBe(false);
    expect(canViewDocument(st, doc.id, { id: south, role: 'ops' })).toBe(true);
    expect(canViewDocument(st, doc.id, { id: 'U-DEVENDRA', role: 'ops' })).toBe(true);
  });

  it('new-application alerts go to the admin and that region’s reviewers only', () => {
    const { s, west, south } = withReviewers();
    const { st, companyId } = submitted(s, 'MH', '1001');
    const to = st.notifications.filter((n) => n.kind === 'eligibility_submitted' && n.href.endsWith(companyId)).map((n) => n.userId).sort();
    expect(to).toEqual(['U-DEVENDRA', west].sort());
    expect(to).not.toContain(south);
  });

  it('an application without a state is the admin’s alone, and the admin can set it', () => {
    const { s, west } = withReviewers();
    const sub = submitted(s, 'MH', '1001');
    const companyId = sub.companyId;
    let st = sub.st;
    st.companies.find((c) => c.id === companyId)!.eligibility!.state = ''; // registered before regions existed
    expect(eligibilityQueue(st, west).waiting).toHaveLength(0);
    expect(eligibilityQueue(st, 'U-DEVENDRA').waiting[0]).toMatchObject({ region: null, regionLabel: 'Region not set' });
    expect(code(setApplicationState(st, companyId, 'GJ', { id: west, role: 'ops' }, NOW))).toBe('forbidden');
    st = must(setApplicationState(st, companyId, 'GJ', ADMIN, NOW)).state;
    expect(eligibilityQueue(st, west).waiting.map((r) => r.companyId)).toEqual([companyId]);
  });

  it('only the admin appoints, changes and removes reviewers; a removed reviewer loses access', () => {
    const { s, west } = withReviewers();
    const byReviewer = appointReviewer(s, { name: 'New One', email: 'n@auctionit.example', regions: ['north'], authUserId: null }, { id: west, role: 'ops' }, NOW);
    expect(code(byReviewer)).toBe('forbidden');
    expect(code(appointReviewer(s, { name: 'Rahul', email: 'rahul.sharma@vardhan.example', regions: ['north'], authUserId: null }, ADMIN, NOW))).toBe('duplicate_account');
    expect(code(appointReviewer(s, { name: 'Again', email: 'west@auctionit.example', regions: ['north'], authUserId: null }, ADMIN, NOW))).toBe('already_staff');
    expect(code(appointReviewer(s, { name: 'No region', email: 'nr@auctionit.example', regions: [], authUserId: null }, ADMIN, NOW))).toBe('invalid_input');

    let st = must(setReviewerRegions(s, west, ['west', 'north', 'bogus'], ADMIN, NOW)).state;
    expect(staffAccess(st, west)?.regions).toEqual(['north', 'west']);
    expect(code(setReviewerRegions(st, 'U-DEVENDRA', ['west'], ADMIN, NOW))).toBe('forbidden');

    st = must(removeReviewer(st, west, ADMIN, NOW)).state;
    expect(staffAccess(st, west)).toBeNull();
    expect(eligibilityQueue(st, west).waiting).toEqual([]);
    expect(code(removeReviewer(st, 'U-DEVENDRA', ADMIN, NOW))).toBe('forbidden');
    // Re-appointing a removed reviewer brings them back with the new regions.
    st = must(appointReviewer(st, { name: 'Wasim West', email: 'west@auctionit.example', regions: ['north_east'], authUserId: null }, ADMIN, NOW)).state;
    expect(staffAccess(st, west)).toMatchObject({ level: 'reviewer', regions: ['north_east'] });
  });

  it('an ops profile with no level or regions sees nothing (fails closed)', () => {
    const s = createSeed(NOW);
    s.users.push({ id: 'U-NOLEVEL', name: 'No Level', email: 'nl@auctionit.example', role: 'ops', companyId: null, title: '' });
    const { st } = submitted(s, 'MH', '1001');
    expect(eligibilityQueue(st, 'U-NOLEVEL').waiting).toEqual([]);
  });

  it('team view: members, waiting per region and regions nobody covers', () => {
    const { s, west } = withReviewers();
    const { st } = submitted(s, 'MH', '1001');
    const team = teamView(st, 'U-DEVENDRA')!;
    expect(team.members.map((m) => [m.name, m.level, m.waiting])).toEqual([
      ['Devendra Nath', 'admin', 1],
      ['Sunita South', 'reviewer', 0],
      ['Wasim West', 'reviewer', 1],
    ]);
    expect(team.waitingByRegion.west).toBe(1);
    expect(team.uncovered).toEqual(['north', 'north_east']);
    expect(teamView(st, west)).toBeNull();
  });
});

describe('review happens once', () => {
  it('an approved account can’t be edited or resubmitted, and a seller publishes any number of lots without review', () => {
    const { s } = withReviewers();
    const { st: applied, actor, companyId } = submitted(s, 'MH', '1001');
    const st = must(reviewEligibility(applied, companyId, { decision: 'approved', reason: '' }, ADMIN, NOW)).state;
    expect(code(saveEligibility(st, app('MH', '1001'), actor, NOW))).toBe('not_editable');
    expect(code(submitEligibility(st, actor, NOW))).toBe('not_editable');
    expect(accountView(st, actor.id)).toMatchObject({ status: 'approved', editable: false, problems: [] });
    expect(eligibilityQueue(st, 'U-DEVENDRA').waiting).toEqual([]);

    // A sample approved seller publishes three lots in a row; none of them creates a review item.
    const seller = { id: 'U-SURESH', role: 'seller' as const };
    let cur = st;
    const before = cur.notifications.filter((n) => n.kind === 'eligibility_submitted').length;
    for (let i = 0; i < 3; i++) {
      const d = must(saveDraft(cur, { draft: draft(i) }, seller, NOW));
      cur = must(publishLot(d.state, d.value.id, seller, NOW)).state;
    }
    expect(cur.notifications.filter((n) => n.kind === 'eligibility_submitted').length).toBe(before);
  });
});

function draft(i: number): ListingDraft {
  const t = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();
  const media = (kind: LotMedia['kind'], n: number): LotMedia[] => Array.from({ length: n }, (_, k) => ({ id: `M-${i}-${kind}-${k}`, kind, url: '', caption: `${kind} ${k}`, stage: 'listing', uploadedAt: NOW }));
  return {
    title: `MS plate cuttings, lot ${i}`,
    category: 'ferrous_hms',
    grade: 'MS plate cuttings',
    description: 'Plasma-cut offcuts.',
    yard: 'Raipur Yard #4',
    city: 'Raipur',
    state: 'Chhattisgarh',
    estimatedQtyMt: 18,
    contaminationPct: 2,
    attributes: { form: 'Plate offcuts', thickness: '8–20 mm' },
    reservePerMt: 33_000,
    startAt: t(1),
    endAt: t(26),
    media: [...media('photo', 6), ...media('video', 1)],
  };
}
