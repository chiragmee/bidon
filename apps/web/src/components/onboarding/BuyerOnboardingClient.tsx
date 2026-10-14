'use client';

import dynamic from 'next/dynamic';
import { Container } from '@/components/layout/Shells';
import { Skeleton } from '@/components/ui';

/** Client-only: the form restores a saved draft from sessionStorage on first render. */
export const BuyerOnboardingClient = dynamic(() => import('./BuyerOnboarding').then((m) => m.BuyerOnboarding), {
  ssr: false,
  loading: () => (
    <Container className="max-w-[640px]">
      <div role="status" aria-label="Loading form" className="flex flex-col gap-md">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    </Container>
  ),
});
