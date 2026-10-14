import type { Metadata } from 'next';
import { OpsOverview } from '@/components/ops/OpsOverview';

export const metadata: Metadata = { title: 'Operations' };

export default function OpsPage() {
  return <OpsOverview />;
}
