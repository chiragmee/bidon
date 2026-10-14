import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Catalogue } from '@/components/catalogue/Catalogue';

export const metadata: Metadata = { title: 'Auctions' };

export default function AuctionsPage() {
  return (
    <Suspense>
      <Catalogue />
    </Suspense>
  );
}
