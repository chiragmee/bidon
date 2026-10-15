'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CategoryId, LotFilters, LotListResult, LotSort, StatusFilter } from '@auctionit/domain';
import { DEFAULT_STATUSES, policyFor } from '@auctionit/domain';
import { PageHeader, Container } from '@/components/layout/Shells';
import { Button, Dialog, EmptyState, ErrorState, LotCard, RetryIcon, Skeleton } from '@/components/ui';
import { useQuery } from '@/data';
import { cn } from '@/lib/cn';
import { activeCount, filtersFromParams, paramsFromFilters } from './filters';

const STATUS_LABEL: Record<StatusFilter, string> = { live: 'Live now', upcoming: 'Upcoming', closed: 'Closed' };
const SORT_LABEL: Record<LotSort, string> = { closing: 'Closing soonest', newest: 'Newest', bid: 'Highest current bid' };

/** Rendered twice (desktop rail, mobile sheet) — `idPrefix` keeps label/input ids unique. */
function FilterPanel({ f, facets, set, idPrefix }: { f: LotFilters; facets: LotListResult['facets'] | undefined; set: (patch: Partial<LotFilters>) => void; idPrefix: string }) {
  const statuses = f.statuses?.length ? f.statuses : DEFAULT_STATUSES;
  const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  return (
    <div className="flex flex-col gap-lg">
      <fieldset>
        <legend className="mb-xs text-overline uppercase text-text-secondary">Material category</legend>
        <div className="flex flex-col gap-1">
          {(facets?.categories ?? []).map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-xs rounded-md px-1 py-1 text-body-md hover:bg-surface-muted">
              <span className="flex items-center gap-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={f.categories?.includes(c.id) ?? false}
                  onChange={() => set({ categories: toggle(f.categories, c.id as CategoryId) })}
                />
                {c.label}
              </span>
              <span className="text-caption text-text-secondary">{c.count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-xs">
        <label htmlFor={`${idPrefix}-city`} className="text-overline uppercase text-text-secondary">
          Yard / plant location
        </label>
        <select
          id={`${idPrefix}-city`}
          className="h-10 rounded-md border border-border-control bg-surface px-3 text-body-md"
          value={f.city ?? ''}
          onChange={(e) => set({ city: e.target.value || undefined })}
        >
          <option value="">All locations</option>
          {(facets?.cities ?? []).map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-start gap-xs rounded-md bg-primary-container p-sm">
        <input
          id={`${idPrefix}-assured`}
          type="checkbox"
          aria-describedby={`${idPrefix}-assured-help`}
          className="mt-0.5 size-4 accent-primary"
          checked={!!f.assured}
          onChange={(e) => set({ assured: e.target.checked })}
        />
        <div>
          <label htmlFor={`${idPrefix}-assured`} className="block text-label-md text-on-primary-container">
            Lot Assurance only
          </label>
          <p id={`${idPrefix}-assured-help`} className="text-caption text-text-secondary">
            Lots with a structured declaration, evidence, a weighbridge rule and defined remedies.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-xs text-overline uppercase text-text-secondary">Auction status</legend>
        <div className="flex flex-col gap-1">
          {(['live', 'upcoming', 'closed'] as const).map((s) => (
            <label key={s} className="flex items-center justify-between gap-xs rounded-md px-1 py-1 text-body-md hover:bg-surface-muted">
              <span className="flex items-center gap-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={statuses.includes(s)}
                  onChange={() => {
                    const next = toggle(statuses, s);
                    set({ statuses: next.length === 0 ? [s === 'live' ? 'upcoming' : 'live'] : next });
                  }}
                />
                {STATUS_LABEL[s]}
              </span>
              <span className="text-caption text-text-secondary">{facets?.statuses[s] ?? ''}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-xs text-body-md">
        <input type="checkbox" className="size-4 accent-primary" checked={!!f.endingSoon} onChange={(e) => set({ endingSoon: e.target.checked })} />
        Ending within 24 hours
      </label>
    </div>
  );
}

export function Catalogue() {
  const params = useSearchParams();
  const pathname = usePathname();
  // Filters are local state so controls respond instantly; the URL mirrors them (shareable) and
  // changes from outside (back/forward) flow back in.
  const urlKey = params.toString();
  const [f, setF] = useState<LotFilters>(() => filtersFromParams(new URLSearchParams(urlKey)));
  const [seenUrl, setSeenUrl] = useState(urlKey);
  if (urlKey !== seenUrl) {
    setSeenUrl(urlKey);
    const fromUrl = filtersFromParams(new URLSearchParams(urlKey));
    if (paramsFromFilters(fromUrl) !== paramsFromFilters(f)) setF(fromUrl);
  }
  const [q, setQ] = useState(f.q ?? '');
  const [sheet, setSheet] = useState(false);

  // Native replaceState is synced with useSearchParams by Next, with no server round trip, so
  // filters respond instantly and the URL stays shareable.
  const apply = (next: LotFilters) => {
    setF(next);
    window.history.replaceState(null, '', `${pathname}${paramsFromFilters(next)}`);
  };
  const set = (patch: Partial<LotFilters>) => apply({ ...f, ...patch });
  const clearAll = () => {
    setQ('');
    apply({ sort: f.sort });
  };

  // Debounced keyword search → URL.
  useEffect(() => {
    if ((f.q ?? '') === q) return;
    const id = setTimeout(() => set({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [q]);
  // Keep the box in step when the URL changes elsewhere (chip removed, back button).
  const [urlQ, setUrlQ] = useState(f.q);
  if (f.q !== urlQ) {
    setUrlQ(f.q);
    setQ(f.q ?? '');
  }

  const key = paramsFromFilters(f);
  const res = useQuery(`lots${key}`, (ds) => ds.listLots(f), { pollMs: 15_000, keepPrevious: true });
  const data = res.data;
  const n = activeCount(f);

  const chips: { label: string; clear: () => void }[] = [
    ...(f.categories ?? []).map((c) => ({ label: policyFor(c).label, clear: () => set({ categories: f.categories?.filter((x) => x !== c) }) })),
    ...(f.city ? [{ label: f.city, clear: () => set({ city: undefined }) }] : []),
    ...(f.assured ? [{ label: 'Lot Assurance only', clear: () => set({ assured: false }) }] : []),
    ...(f.statuses?.length ? [{ label: f.statuses.map((s) => STATUS_LABEL[s]).join(' + '), clear: () => set({ statuses: [] }) }] : []),
    ...(f.endingSoon ? [{ label: 'Ending within 24h', clear: () => set({ endingSoon: false }) }] : []),
    ...(f.q ? [{ label: `“${f.q}”`, clear: () => (setQ(''), set({ q: undefined })) }] : []),
  ];

  return (
    <Container>
      <PageHeader overline="Auctions" title="Live and upcoming auctions">
        {data ? (
          <span aria-live="polite">
            Showing {data.items.length} of {data.total} lots
          </span>
        ) : (
          <span>Loading lots…</span>
        )}
      </PageHeader>

      <div className="mt-lg flex flex-col gap-sm sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
          <label htmlFor="q" className="sr-only">
            Search lots
          </label>
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by material, grade, location, seller or lot ID"
            className="h-10 w-full rounded-md border border-border-control bg-surface pl-9 pr-3 text-body-md"
          />
        </div>
        <div className="flex gap-sm">
          <label htmlFor="sort" className="sr-only">
            Sort by
          </label>
          <select id="sort" value={f.sort ?? 'closing'} onChange={(e) => set({ sort: e.target.value as LotSort })} className="h-10 flex-1 rounded-md border border-border-control bg-surface px-3 text-body-md sm:w-56">
            {(Object.keys(SORT_LABEL) as LotSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <Button className="lg:hidden" onClick={() => setSheet(true)} icon={<SlidersHorizontal aria-hidden />}>
            Filters{n ? ` (${n})` : ''}
          </Button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-sm flex flex-wrap items-center gap-xs">
          <span className="text-overline uppercase text-text-secondary">Active filters</span>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.clear}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface pl-sm pr-xs text-caption text-text hover:bg-surface-muted"
            >
              {c.label}
              <X className="size-3.5" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-caption font-medium text-primary underline">
            Clear filters
          </button>
        </div>
      )}

      <div className="mt-lg grid gap-lg lg:grid-cols-[280px_1fr]">
        <aside aria-label="Filters" className="hidden self-start rounded-lg border border-border bg-surface p-md lg:block">
          <div className="mb-md flex items-center justify-between">
            <p className="text-label-md text-text-strong">Filters</p>
            {n > 0 && (
              <button type="button" onClick={clearAll} className="text-caption font-medium text-primary underline">
                Clear filters
              </button>
            )}
          </div>
          <FilterPanel f={f} facets={data?.facets} set={set} idPrefix="rail" />
        </aside>

        <section aria-label="Results" aria-busy={res.loading} className="min-w-0">
          {res.error && !data ? (
            <ErrorState
              what="We couldn’t load auctions."
              meaning="Nothing has changed with your bids or deposits."
              next="Check your connection and try again."
              action={<Button onClick={res.reload} icon={<RetryIcon />}>Try again</Button>}
            />
          ) : !data ? (
            <div role="status" aria-label="Loading lots" className="grid gap-lg sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-[420px]" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState icon={SearchX} title="No lots match these filters" action={<Button onClick={clearAll}>Clear filters</Button>}>
              Try removing a category or location filter, or include upcoming and closed auctions.
            </EmptyState>
          ) : (
            <ul className={cn('grid gap-lg sm:grid-cols-2 xl:grid-cols-3', res.loading && 'opacity-70 transition-opacity')}>
              {data.items.map((lot) => (
                <li key={lot.id} className="flex min-w-0 flex-col">
                  <LotCard lot={lot} />
                </li>
              ))}
            </ul>
          )}
          {res.error && data && (
            <p role="alert" className="mt-sm text-caption text-danger">
              Couldn’t refresh just now — showing the last loaded results.{' '}
              <button type="button" className="underline" onClick={res.reload}>
                Retry
              </button>
            </p>
          )}
        </section>
      </div>

      <Dialog
        open={sheet}
        onClose={() => setSheet(false)}
        size="form"
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={clearAll}>
              Clear filters
            </Button>
            <Button variant="primary" onClick={() => setSheet(false)}>
              Show {data?.items.length ?? ''} lots
            </Button>
          </>
        }
      >
        <FilterPanel f={f} facets={data?.facets} set={set} idPrefix="sheet" />
      </Dialog>
    </Container>
  );
}
