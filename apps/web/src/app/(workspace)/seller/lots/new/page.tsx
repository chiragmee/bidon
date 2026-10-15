import type { Metadata } from 'next';
import { NewLotPage } from '@/components/seller/WizardPages';

export const metadata: Metadata = { title: 'Create auction' };

export default function Page() {
  return <NewLotPage />;
}
