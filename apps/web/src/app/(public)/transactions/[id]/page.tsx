import type { Metadata } from 'next';
import { TransactionPreview } from '@/components/transaction/TransactionPreview';

export async function generateMetadata({ params }: PageProps<'/transactions/[id]'>): Promise<Metadata> {
  return { title: (await params).id };
}

export default async function TransactionPage({ params }: PageProps<'/transactions/[id]'>) {
  return <TransactionPreview id={(await params).id} />;
}
