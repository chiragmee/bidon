import type { CategoryId, LotFilters, LotSort, StatusFilter } from '@auctionit/domain';
import { CATEGORIES } from '@auctionit/domain';

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
const STATUSES = new Set<string>(['live', 'upcoming', 'closed']);
const SORTS = new Set<string>(['closing', 'newest', 'bid']);

/** Filters live in the URL so a filtered view can be shared and survives reload (PHASES 3.2). */
export function filtersFromParams(p: URLSearchParams): LotFilters {
  const list = (k: string) => (p.get(k) ?? '').split(',').filter(Boolean);
  const sort = p.get('sort');
  return {
    q: p.get('q') ?? undefined,
    categories: list('cat').filter((c): c is CategoryId => CATEGORY_IDS.has(c)),
    city: p.get('city') ?? undefined,
    assured: p.get('assured') === '1',
    statuses: list('status').filter((s): s is StatusFilter => STATUSES.has(s)),
    endingSoon: p.get('soon') === '1',
    sort: sort && SORTS.has(sort) ? (sort as LotSort) : undefined,
  };
}

export function paramsFromFilters(f: LotFilters): string {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set('q', f.q.trim());
  if (f.categories?.length) p.set('cat', f.categories.join(','));
  if (f.city) p.set('city', f.city);
  if (f.assured) p.set('assured', '1');
  if (f.statuses?.length) p.set('status', f.statuses.join(','));
  if (f.endingSoon) p.set('soon', '1');
  if (f.sort && f.sort !== 'closing') p.set('sort', f.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Number of user-applied filters (search and sort excluded). */
export function activeCount(f: LotFilters): number {
  return (f.categories?.length ?? 0) + (f.city ? 1 : 0) + (f.assured ? 1 : 0) + (f.statuses?.length ? 1 : 0) + (f.endingSoon ? 1 : 0);
}
