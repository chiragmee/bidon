import { MapPinOff } from 'lucide-react';
import { PublicShell } from '@/components/layout/Shells';
import { Container } from '@/components/layout/Shells';
import { ButtonLink, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <PublicShell>
      <Container>
        <EmptyState icon={MapPinOff} title="Page not found" action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
          The link may be wrong or the page may have moved.
        </EmptyState>
      </Container>
    </PublicShell>
  );
}
