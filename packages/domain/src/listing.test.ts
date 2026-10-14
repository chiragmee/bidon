import { describe, expect, it } from 'vitest';
import { at, bid, lot, media, T0 } from './fixtures';
import { canSellerEdit, draftFromLot, evidenceShortfall, publishBlockers, validateListingStep, type ListingDraft } from './listing';

const valid: ListingDraft = draftFromLot(lot({ startAt: at(60), endAt: at(300) }));

describe('validateListingStep', () => {
  it('a complete draft passes every step', () => {
    for (const s of [1, 2, 3, 4] as const) expect(validateListingStep(s, valid, T0)).toEqual({});
  });

  it('step 1 requires every basic field', () => {
    const e = validateListingStep(1, {}, T0);
    expect(Object.keys(e).sort()).toEqual(['category', 'city', 'description', 'grade', 'state', 'title', 'yard']);
    expect(validateListingStep(1, { ...valid, title: 'Scrap' }, T0).title).toMatch(/8 characters/);
  });

  it('step 2 validates quantity, contamination and category fields', () => {
    expect(validateListingStep(2, { ...valid, estimatedQtyMt: 0 }, T0).estimatedQtyMt).toBeTruthy();
    expect(validateListingStep(2, { ...valid, estimatedQtyMt: 20_000 }, T0).estimatedQtyMt).toMatch(/10,000/);
    expect(validateListingStep(2, { ...valid, contaminationPct: null }, T0).contaminationPct).toBeTruthy();
    expect(validateListingStep(2, { ...valid, contaminationPct: 120 }, T0).contaminationPct).toMatch(/0 and 100/);
    expect(validateListingStep(2, { ...valid, attributes: {} }, T0)['attributes.form']).toBeTruthy();
  });

  it('step 2 skips contamination for categories without it', () => {
    const e = validateListingStep(2, { category: 'machinery', estimatedQtyMt: 5, attributes: { make: 'HMT', condition: 'Working' } }, T0);
    expect(e).toEqual({});
  });

  it('step 4: reserve and EMD must be positive whole rupees', () => {
    expect(validateListingStep(4, { ...valid, reservePerMt: 0 }, T0).reservePerMt).toBeTruthy();
    expect(validateListingStep(4, { ...valid, reservePerMt: 10.5 }, T0).reservePerMt).toBeTruthy();
    expect(validateListingStep(4, { ...valid, emdAmount: -5 }, T0).emdAmount).toBeTruthy();
  });

  it('step 4: end must be after start; start not in the past', () => {
    expect(validateListingStep(4, { ...valid, endAt: valid.startAt }, T0).endAt).toMatch(/after the opening/);
    expect(validateListingStep(4, { ...valid, startAt: at(-30) }, T0).startAt).toMatch(/past/);
    expect(validateListingStep(4, { ...valid, startAt: undefined, endAt: undefined }, T0)).toMatchObject({
      startAt: expect.any(String),
      endAt: expect.any(String),
    });
  });

  it('step 4: assurance needs an eligible category, evidence and agreement', () => {
    expect(validateListingStep(4, { ...valid, category: 'non_ferrous' }, T0).assuranceEnabled).toMatch(/only available/);
    expect(validateListingStep(4, { ...valid, media: media('photo', 3) }, T0).assuranceEnabled).toMatch(/6 photos/);
    expect(validateListingStep(4, { ...valid, assuranceAgreed: false }, T0).assuranceAgreed).toBeTruthy();
    expect(validateListingStep(4, { ...valid, assuranceEnabled: false, media: [] }, T0)).toEqual({});
  });
});

describe('evidenceShortfall', () => {
  it('null when met or when the category has no requirement', () => {
    expect(evidenceShortfall('ferrous_hms', [...media('photo', 6), ...media('video', 1)])).toBeNull();
    expect(evidenceShortfall('non_ferrous', [])).toBeNull();
  });
  it('counts only listing-stage media', () => {
    expect(evidenceShortfall('ferrous_hms', [...media('photo', 6, 'lifting'), ...media('video', 1)])).toMatch(/0 photos and 1 video/);
  });
  it('uses singular wording for one', () => {
    expect(evidenceShortfall('mixed_steel', media('photo', 1))).toMatch(/1 photo and 0 videos/);
  });
});

describe('publishBlockers', () => {
  it('empty for a valid draft; lists step + field for an incomplete one', () => {
    expect(publishBlockers(valid, T0)).toEqual([]);
    const b = publishBlockers({ ...valid, title: '', reservePerMt: 0 }, T0);
    expect(b.map((x) => [x.step, x.field])).toEqual([
      [1, 'title'],
      [4, 'reservePerMt'],
    ]);
  });
});

describe('canSellerEdit', () => {
  const S = 'U-SELLER';
  it('never another seller’s lot', () => {
    expect(canSellerEdit(lot(), [], 'U-OTHER', 'details', T0)?.code).toBe('not_owner');
  });
  it('never bids or winner', () => {
    expect(canSellerEdit(lot({ status: 'draft' }), [], S, 'bids', T0)?.code).toBe('not_editable');
    expect(canSellerEdit(lot({ status: 'draft' }), [], S, 'winner', T0)?.code).toBe('not_editable');
  });
  it('drafts are fully editable', () => {
    expect(canSellerEdit(lot({ status: 'draft' }), [], S, 'reserve', T0)).toBeNull();
  });
  it('scheduled: editable, except reserve once bids exist', () => {
    const sched = lot({ startAt: at(60) });
    expect(canSellerEdit(sched, [], S, 'reserve', T0)).toBeNull();
    expect(canSellerEdit(sched, [bid(33_000)], S, 'reserve', T0)?.what).toMatch(/reserve/);
    expect(canSellerEdit(sched, [bid(33_000)], S, 'details', T0)).toBeNull();
  });
  it('live: nothing, with an explanation', () => {
    expect(canSellerEdit(lot(), [], S, 'details', T0)?.what).toMatch(/Live auctions/);
  });
  it('closed: final', () => {
    expect(canSellerEdit(lot({ status: 'awarded' }), [], S, 'details', T0)?.what).toMatch(/closed/);
  });
});
