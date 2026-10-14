import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EditLotPage } from '@/components/seller/WizardPages';

export const metadata: Metadata = { title: 'Edit lot' };

export default async function Page({ params }: PageProps<'/seller/lots/[id]/edit'>) {
  const { id } = await params;
  return (
    <Suspense>
      <EditLotPage id={id} />
    </Suspense>
  );
}
