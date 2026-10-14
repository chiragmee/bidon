import type { Metadata } from 'next';
import { TransactionWorkspace } from '@/components/transaction/TransactionWorkspace';

export async function generateMetadata({ params }: PageProps<'/transactions/[id]'>): Promise<Metadata> {
  return { title: (await params).id };
}

export default async function TransactionPage({ params }: PageProps<'/transactions/[id]'>) {
  return <TransactionWorkspace id={(await params).id} />;
}
