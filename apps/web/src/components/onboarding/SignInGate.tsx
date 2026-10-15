import { UserRoundPlus } from 'lucide-react';
import { Container } from '@/components/layout/Shells';
import { ButtonLink, EmptyState } from '@/components/ui';
import { AUTH_ENABLED } from '@/lib/flags';
import { HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

/**
 * Live site: the business profile is created after the sign-in exists and its email is verified. Returns the
 * screen to show instead of the form, or null when the form applies.
 */
export function useSignInGate(role: 'buyer' | 'seller') {
  const { auth, session } = useSession();
  if (!AUTH_ENABLED) return null;
  if (!auth?.signedIn) {
    return (
      <Container>
        <EmptyState
          icon={UserRoundPlus}
          headingLevel={1}
          title="Create your sign-in first"
          action={<ButtonLink href={`/sign-up?as=${role}`} variant="primary">Create an account</ButtonLink>}
        >
          You’ll choose a password and verify your email, then add your business details here.
        </EmptyState>
      </Container>
    );
  }
  if (session.role !== 'guest') {
    return (
      <Container>
        <EmptyState icon={UserRoundPlus} headingLevel={1} title="You already have an account" action={<ButtonLink href={HOME[session.role]} variant="primary">Go to your dashboard</ButtonLink>}>
          Each sign-in holds one AuctionIT account, as a buyer or a seller.
        </EmptyState>
      </Container>
    );
  }
  return null;
}
