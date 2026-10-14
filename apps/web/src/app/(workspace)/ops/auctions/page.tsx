import type { Metadata } from 'next';
import { OpsAuctions } from '@/components/ops/OpsOverview';

export const metadata: Metadata = { title: 'Auctions · Operations' };

export default function OpsAuctionsPage() {
  return <OpsAuctions />;
}
