import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerLotPage } from '@/components/seller/SellerLotPage';

export async function generateMetadata({ params }: PageProps<'/seller/lots/[id]'>): Promise<Metadata> {
  return { title: (await params).id };
}

export default async function Page({ params }: PageProps<'/seller/lots/[id]'>) {
  const { id } = await params;
  return (
    <Suspense>
      <SellerLotPage id={id} />
    </Suspense>
  );
}
