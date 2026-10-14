import type { Metadata } from 'next';
import { BuyerOnboardingClient } from '@/components/onboarding/BuyerOnboardingClient';

export const metadata: Metadata = { title: 'Create a buyer account' };

export default function BuyerOnboardingPage() {
  return <BuyerOnboardingClient />;
}
