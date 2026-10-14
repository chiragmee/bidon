'use client';

import { useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Suspense } from 'react';
import type { Role } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Button, ButtonLink, EmptyState } from '@/components/ui';
import { ROLE_LABEL } from '@/data';
import { demoSessionFor, HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

function Denied() {
  const params = useSearchParams();
  const need = params.get('need') as Role | 'signed_in' | null;
  const from = params.get('from') ?? '/';
  const { session, signInAs } = useSession();
  const needLabel = need === 'signed_in' ? 'a signed-in account' : need ? `the ${ROLE_LABEL[need]} role` : 'a different role';
  return (
    <Container>
      <EmptyState
        icon={ShieldAlert}
        title="You don’t have access to this page"
        action={
          <div className="flex flex-wrap justify-center gap-xs">
            {need && need !== 'signed_in' && need !== 'guest' && (
              <Button variant="primary" onClick={() => signInAs(demoSessionFor(need), from.startsWith('/') ? from : '/')}>
                Continue as demo {ROLE_LABEL[need].toLowerCase()}
              </Button>
            )}
            <ButtonLink href={HOME[session.role]}>Go to my {session.role === 'guest' ? 'home page' : 'dashboard'}</ButtonLink>
          </div>
        }
      >
        {from} needs {needLabel}. You’re viewing as {ROLE_LABEL[session.role]}. Switch to the right demo account to continue.
      </EmptyState>
    </Container>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense>
      <Denied />
    </Suspense>
  );
}
