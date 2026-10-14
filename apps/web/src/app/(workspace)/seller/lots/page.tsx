import type { Metadata } from 'next';
import { SellerLots } from '@/components/seller/SellerDashboard';

export const metadata: Metadata = { title: 'My lots' };

export default function SellerLotsPage() {
  return <SellerLots />;
}
