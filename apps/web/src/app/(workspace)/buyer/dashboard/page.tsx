import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BuyerDashboard } from '@/components/buyer/BuyerDashboard';

export const metadata: Metadata = { title: 'Buyer dashboard' };

export default function BuyerDashboardPage() {
  return (
    <Suspense>
      <BuyerDashboard />
    </Suspense>
  );
}
