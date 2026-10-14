import { describe, expect, it } from 'vitest';
import { activeCount, filtersFromParams, paramsFromFilters } from './filters';

describe('catalogue filters ↔ URL', () => {
  it('round-trips every filter', () => {
    const qs = '?q=hms&cat=ferrous_hms%2Cmixed_steel&city=Raipur&assured=1&status=live%2Cclosed&soon=1&sort=bid';
    const f = filtersFromParams(new URLSearchParams(qs));
    expect(f).toEqual({ q: 'hms', categories: ['ferrous_hms', 'mixed_steel'], city: 'Raipur', assured: true, statuses: ['live', 'closed'], endingSoon: true, sort: 'bid' });
    expect(paramsFromFilters(f)).toBe(qs);
    expect(activeCount(f)).toBe(6);
  });
  it('drops unknown values and defaults', () => {
    const f = filtersFromParams(new URLSearchParams('cat=gold&status=bogus&sort=price'));
    expect(f).toMatchObject({ categories: [], statuses: [], sort: undefined, assured: false });
    expect(paramsFromFilters({ sort: 'closing' })).toBe('');
  });
});
