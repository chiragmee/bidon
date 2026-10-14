import { Construction } from 'lucide-react';
import { Container } from '@/components/layout/Shells';
import { ButtonLink, EmptyState } from '@/components/ui';

/** Honest placeholder for an area a later phase builds — never a fake, half-working screen. */
export function ComingSoon({ title, phase, children }: { title: string; phase: number; children: React.ReactNode }) {
  return (
    <Container>
      <EmptyState icon={Construction} title={`${title} arrives in Phase ${phase}`} action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
        {children}
      </EmptyState>
    </Container>
  );
}
