import type { Metadata } from 'next';
import { EligibilityQueue } from '@/components/ops/EligibilityReview';

export const metadata: Metadata = { title: 'Account eligibility' };

export default function Page() {
  return <EligibilityQueue />;
}
