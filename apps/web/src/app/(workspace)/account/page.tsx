import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountPage } from '@/components/account/AccountPage';

export const metadata: Metadata = { title: 'Account and verification' };

export default function Page() {
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
