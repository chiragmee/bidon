import type { Metadata } from 'next';
import { SellerOnboarding } from '@/components/onboarding/SellerOnboarding';

export const metadata: Metadata = { title: 'Create a seller account' };

export default function SellerOnboardingPage() {
  return <SellerOnboarding />;
}
