import type { Metadata } from 'next';
import { ClaimReview } from '@/components/ops/ClaimReview';

export async function generateMetadata({ params }: PageProps<'/ops/claims/[id]'>): Promise<Metadata> {
  return { title: `Claim ${(await params).id}` };
}

export default async function ClaimReviewPage({ params }: PageProps<'/ops/claims/[id]'>) {
  return <ClaimReview id={(await params).id} />;
}
