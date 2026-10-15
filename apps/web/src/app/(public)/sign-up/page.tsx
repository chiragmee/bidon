import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignUpForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Create an account' };

export default function Page() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
