import type { Metadata } from 'next';
import { ClaimPage } from '@/components/transaction/ClaimForm';

export const metadata: Metadata = { title: 'Raise an assurance claim' };

export default async function RaiseClaimPage({ params }: PageProps<'/transactions/[id]/claim'>) {
  return <ClaimPage id={(await params).id} />;
}
