'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Container, PageHeader } from '@/components/layout/Shells';
import { RoleEntry } from '@/components/marketing/RoleEntry';
import { Banner, ButtonLink, Card } from '@/components/ui';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { Button } from '@/components/ui';
import { SignInForm } from '@/components/auth/AuthForms';
import { AUTH_ENABLED } from '@/lib/flags';

function SignIn() {
  const params = useSearchParams();
  const next = params.get('next');
  const as = params.get('as');
  const { signInAs } = useSession();
  return (
    <Container className="flex max-w-[960px] flex-col gap-lg">
      <PageHeader title="Sign in">
        Password sign-in isn’t available yet. Continue with one of the sample accounts below, or create your own buyer or seller profile.
      </PageHeader>
      {next && (
        <Card className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-md text-text">Sign in as a buyer to bid, then you’ll return to the lot.</p>
          <Button variant="primary" onClick={() => signInAs(demoSessionFor('buyer'), next.startsWith('/') ? next : '/')}>
            Continue as buyer
          </Button>
        </Card>
      )}
      {as === 'seller' && (
        <Banner tone="info" title="Selling surplus on AuctionIT">
          Sellers list a lot with a structured declaration and evidence, set a reserve and auction dates, and track bids to completion. Create a seller
          profile below, or continue with the sample seller account.
        </Banner>
      )}
      <RoleEntry highlight={as === 'seller' ? 'seller' : next ? 'buyer' : null} />
      <Card className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label-md text-text-strong">New buyer?</p>
          <p className="text-body-md text-text-secondary">Create a buyer profile in three short steps. It’s active straight away; business documents aren’t checked yet.</p>
        </div>
        <ButtonLink href="/onboarding/buyer">Create a buyer account</ButtonLink>
      </Card>
      <Card className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label-md text-text-strong">Selling surplus?</p>
          <p className="text-body-md text-text-secondary">Create a seller profile in one short form. It’s active straight away; business documents aren’t checked yet.</p>
        </div>
        <ButtonLink href="/onboarding/seller">Create a seller account</ButtonLink>
      </Card>
    </Container>
  );
}

export default function SignInPage() {
  // Live site: email and password. Presenter controls only: one-click sample accounts.
  return <Suspense>{AUTH_ENABLED ? <SignInForm /> : <SignIn />}</Suspense>;
}
