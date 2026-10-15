import type { Metadata } from 'next';
import { EligibilityReviewPage } from '@/components/ops/EligibilityReview';

export const metadata: Metadata = { title: 'Review application' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <EligibilityReviewPage id={(await params).id} />;
}
