'use client';

import { LotCard, Skeleton, ErrorState, Button, RetryIcon } from '@/components/ui';
import { useQuery } from '@/data';

const FEATURED = ['LOT-2025-0891', 'LOT-2025-0899', 'LOT-2025-0905', 'LOT-2025-0910'];

/** Seeded lots with varied categories and statuses; assured and standard side by side (§7). */
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
  const picked = [...FEATURED.flatMap((id) => items.filter((i) => i.id === id)), ...items.filter((i) => !FEATURED.includes(i.id))].slice(0, 4);
  return (
    <ul className="grid gap-lg sm:grid-cols-2 lg:grid-cols-4">
      {picked.map((lot) => (
        <li key={lot.id} className="flex">
          <div className="flex w-full flex-col">
            <LotCard lot={lot} />
          </div>
        </li>
      ))}
    </ul>
  );
}
