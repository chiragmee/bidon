import type { Metadata } from 'next';
import { ListingPreview } from '@/components/seller/ListingPreview';

export const metadata: Metadata = { title: 'Preview lot' };

export default async function Page({ params }: PageProps<'/seller/lots/[id]/preview'>) {
  return <ListingPreview id={(await params).id} />;
}
