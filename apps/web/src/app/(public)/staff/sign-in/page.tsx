'use client';

import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/AuthForms';
import { Container, PageHeader } from '@/components/layout/Shells';
import { ButtonLink } from '@/components/ui';
import { AUTH_ENABLED } from '@/lib/flags';

/** Separate entry for AuctionIT Operations staff (D-102); linked from the footer, not the main header. */
export default function StaffSignInPage() {
  if (AUTH_ENABLED) {
    return (
      <Suspense>
        <SignInForm staff />
      </Suspense>
    );
  }
  // Presenter controls: staff use the sample Operations account from the sign-in page.
  return (
    <Container className="flex max-w-[640px] flex-col gap-md">
      <PageHeader overline="AuctionIT staff" title="Staff sign-in">
        In this demo, Operations uses the sample Operations account.
      </PageHeader>
      <div>
        <ButtonLink href="/sign-in">Choose a sample account</ButtonLink>
      </div>
    </Container>
  );
}
