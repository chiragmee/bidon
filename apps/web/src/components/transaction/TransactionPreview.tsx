'use client';

import { FileSearch } from 'lucide-react';
import { formatINR, formatMt, TX_STEPS } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, EmptyState, ErrorState, RetryIcon, Skeleton, StatusBadge, Stepper } from '@/components/ui';
import { useQuery } from '@/data';
import { HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

/**
 * Phase 3 placeholder for /transactions/[id] (PHASES 3.7 allows it): shows the real status and
 * next step read-only. The working post-win workflow arrives in Phase 5.
 */
export function TransactionPreview({ id }: { id: string }) {
  const { viewer, session } = useSession();
  const q = useQuery(`tx:${id}:${session.userId}`, (ds) => ds.transactionSummary(id, viewer));

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState what="We couldn’t load this transaction." next="Try again in a moment." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (q.data === undefined) {
    return (
      <Container>
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }
  const t = q.data;
  if (!t) {
    return (
      <Container>
        <EmptyState icon={FileSearch} title="Transaction not available" action={<ButtonLink href={HOME[session.role]}>Back to dashboard</ButtonLink>}>
          Either {id} doesn’t exist, or you aren’t the buyer, the seller or Operations on it.
        </EmptyState>
      </Container>
    );
  }
  return (
    <Container className="flex flex-col gap-lg">
      <PageHeader overline={`Transaction ${t.id}`} title={t.lotTitle}>
        {t.lotId} · {formatINR(t.pricePerMt, { perMt: true })} · {formatMt(t.estimatedQtyMt, { estimate: true })} · with {t.counterparty}
      </PageHeader>
      <Card className="p-lg">
        <Stepper steps={TX_STEPS} current={t.stepper.done ? 6 : t.stepper.current} claim={t.stepper.claim} claimLabel="Claim under review" />
      </Card>
      <Card className="flex flex-col gap-sm">
        <div className="flex flex-wrap items-center gap-xs">
          <StatusBadge kind={t.stepper.claim ? 'warning' : t.stepper.done ? 'success' : 'neutral'}>{t.statusLabel}</StatusBadge>
        </div>
        {t.next && (
          <p className="text-body-md text-text">
            Next step: <strong>{t.next.label}</strong> {t.yourTurn ? '(you)' : `(${t.next.role === 'ops' ? 'Operations' : `the ${t.next.role}`})`}
          </p>
        )}
      </Card>
      <Banner tone="info" title="The full transaction workflow arrives in Phase 5">
        Paying the balance, scheduling lifting, recording the weighbridge and condition checks, and claims will work here. Until then this page
        shows the real status read-only.
      </Banner>
      <div>
        <ButtonLink href={`/auctions/${t.lotId}`}>View the lot</ButtonLink>
      </div>
    </Container>
  );
}
