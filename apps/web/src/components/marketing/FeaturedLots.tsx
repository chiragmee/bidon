'use client';

import { Gavel } from 'lucide-react';
import { ButtonLink, LotCard, Skeleton, ErrorState, Button, RetryIcon } from '@/components/ui';
import { useQuery } from '@/data';
import { signUpHref } from '@/lib/links';

const FEATURED = ['LOT-2025-0891', 'LOT-2025-0899', 'LOT-2025-0905', 'LOT-2025-0910'];

/** Live and upcoming lots, soonest first (seeded sample lots in demo mode), or what happens next when there are none. */
export function FeaturedLots() {
  const q = useQuery('featured', (ds) => ds.listLots({ statuses: ['live', 'upcoming'] }));
  if (q.error && !q.data) {
    return (
      <ErrorState
        what="We couldn’t load the featured lots."
        next="Try again, or open the full auction list."
        action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>}
      />
    );
  }
  if (!q.data) {
    return (
      <div role="status" aria-label="Loading featured lots" className="grid gap-lg sm:grid-cols-2 lg:grid-cols-4">
        {FEATURED.map((id) => (
          <Skeleton key={id} className="h-[420px]" />
        ))}
      </div>
    );
  }
  const items = q.data.items;
  if (items.length === 0) {
    // The marketplace is new: say what happens next instead of showing an empty grid.
    return (
      <div className="flex flex-col items-start gap-sm rounded-lg border border-dashed border-border-strong bg-surface p-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-container text-primary">
            <Gavel className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-h3 text-text-strong">No auctions are open right now</p>
            <p className="text-body-md text-text-secondary">
              Approved sellers publish new lots here. Create your account and get approved now, so you’re ready to bid when they go live.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-xs">
          <ButtonLink href={signUpHref('buyer')}>Create a buyer account</ButtonLink>
          <ButtonLink href={signUpHref('seller')} variant="ghost">
            List your material
          </ButtonLink>
        </div>
      </div>
    );
  }
  const picked = [...FEATURED.flatMap((id) => items.filter((i) => i.id === id)), ...items.filter((i) => !FEATURED.includes(i.id))].slice(0, 4);
  return (
    <ul className="grid gap-lg sm:grid-cols-2 lg:grid-cols-4">
      {picked.map((lot, i) => (
        // Phones show two; "See all auctions" covers the rest.
        <li key={lot.id} className={i < 2 ? 'flex min-w-0' : 'hidden min-w-0 sm:flex'}>
          <div className="flex w-full min-w-0 flex-col">
            <LotCard lot={lot} />
          </div>
        </li>
      ))}
    </ul>
  );
}
