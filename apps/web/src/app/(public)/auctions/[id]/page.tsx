import type { Metadata } from 'next';
import { LotDetail } from '@/components/lot/LotDetail';

export async function generateMetadata({ params }: PageProps<'/auctions/[id]'>): Promise<Metadata> {
  return { title: (await params).id };
}

export default async function LotPage({ params }: PageProps<'/auctions/[id]'>) {
  const { id } = await params;
  return <LotDetail id={id} />;
}
