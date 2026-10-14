'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Container, PageHeader } from '@/components/layout/Shells';
import { RoleEntry } from '@/components/marketing/RoleEntry';
import { Banner, ButtonLink, Card } from '@/components/ui';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { Button } from '@/components/ui';

function SignIn() {
  const params = useSearchParams();
  const next = params.get('next');
  const as = params.get('as');
  const { signInAs } = useSession();
  return (
    <Container className="flex max-w-[960px] flex-col gap-lg">
      <PageHeader overline="Demo environment" title="Sign in">
        There are no passwords in this demo. Pick a sample account to continue.
      </PageHeader>
      {next && (
        <Card className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-md text-text">Sign in as the demo buyer to bid, then you’ll return to the lot.</p>
          <Button variant="primary" onClick={() => signInAs(demoSessionFor('buyer'), next.startsWith('/') ? next : '/')}>
            Continue as demo buyer
          </Button>
        </Card>
      )}
      {as === 'seller' && (
        <Banner tone="info" title="Selling surplus on AuctionIT">
          Sellers list a lot with a structured declaration and evidence, set a reserve and auction dates, and track bids to completion. Explore the
          seller side with the sample account below.
        </Banner>
      )}
      <RoleEntry highlight={as === 'seller' ? 'seller' : next ? 'buyer' : null} />
      <Card className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label-md text-text-strong">New buyer?</p>
          <p className="text-body-md text-text-secondary">Create a buyer profile in three short steps. In this demo it’s marked demo-approved, not KYC-checked.</p>
        </div>
        <ButtonLink href="/onboarding/buyer">Create a buyer account</ButtonLink>
      </Card>
    </Container>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
