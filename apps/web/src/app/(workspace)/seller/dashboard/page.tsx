import type { Metadata } from 'next';
import { ComingSoon } from '@/components/layout/ComingSoon';

export const metadata: Metadata = { title: 'Seller dashboard' };

export default function SellerDashboardPage() {
  return (
    <ComingSoon title="The seller dashboard" phase={4}>
      Creating lots, the listing wizard and lot management are built in Phase 4. You can still browse auctions, including Shree Balaji Steels’ lots.
    </ComingSoon>
  );
}
