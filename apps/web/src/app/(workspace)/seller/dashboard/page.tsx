import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerDashboard } from '@/components/seller/SellerDashboard';

export const metadata: Metadata = { title: 'Seller dashboard' };

export default function SellerDashboardPage() {
  return (
    <Suspense>
      <SellerDashboard />
    </Suspense>
  );
}
