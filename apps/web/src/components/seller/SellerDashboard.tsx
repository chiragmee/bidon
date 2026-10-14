'use client';

import { useSearchParams } from 'next/navigation';
import { Plus, Store } from 'lucide-react';
import { Container, PageHeader } from '@/components/layout/Shells';
import { TransactionCard } from '@/components/buyer/TransactionCard';
import { Banner, Button, ButtonLink, Card, EmptyState, ErrorState, RetryIcon, SampleDataCaption, Skeleton, StatCard, StatusBadge } from '@/components/ui';
import { useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';
import { SellerLotsTable } from './SellerLotsTable';

export function SellerDashboard() {
  const { viewer, session } = useSession();
  const welcome = useSearchParams().get('welcome') === '1';
  const q = useQuery(`seller-dash:${session.userId}`, (ds) => ds.sellerDashboard(viewer), { pollMs: 15_000 });

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState what="We couldn’t load your seller dashboard." meaning="Your lots and transactions are unchanged." next="Check your connection and try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (q.data === undefined) {
    return (
      <Container>
        <div role="status" aria-label="Loading dashboard" className="flex flex-col gap-lg">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      </Container>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <Container>
        <EmptyState icon={Store} title="Seller profile not found" headingLevel={1} action={<ButtonLink href="/sign-in?as=seller">Sign in as a seller</ButtonLink>}>
          This seller account no longer exists — the demo data may have been reset.
        </EmptyState>
      </Container>
    );
  }
  const toDo = d.transactions.filter((t) => t.yourTurn);

  return (
    <Container className="flex flex-col gap-xl">
      <PageHeader
        overline={<>{d.company.name} · <SampleDataCaption className="normal-case" /></>}
        title="Seller dashboard"
        actions={
          <ButtonLink href="/seller/lots/new" variant="primary" icon={<Plus aria-hidden />}>
            Create a new lot
          </ButtonLink>
        }
      >
        Your listings, auctions and sales.
      </PageHeader>

      {welcome && (
        <Banner tone="success" title="Your seller profile is ready (demo-approved)">
          Create a lot: describe the material, add evidence, set the reserve and dates, preview it as a buyer, then publish. No real business verification was carried out.
        </Banner>
      )}
      {d.claimsToAnswer.map((c) => (
        <Banner key={c.claimId} tone="warning" title={`Assurance claim ${c.claimId} needs your response`} action={<ButtonLink href={`/transactions/${c.txId}`}>Respond to claim</ButtonLink>}>
          {c.lotTitle} · {c.buyer} reports {c.observed}. Accept the remedy or dispute it with evidence.
        </Banner>
      ))}

      <section aria-label="Summary" className="grid gap-md sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Live" value={d.stats.live} caption="Bidding now" />
        <StatCard label="Upcoming" value={d.stats.upcoming} caption="Scheduled to open" />
        <StatCard label="Drafts" value={d.stats.drafts} caption="Not published" />
        <StatCard label="With buyers" value={d.stats.awaitingBuyer} caption="Payment, lifting or checks" />
        <StatCard label="Completed sales" value={d.stats.completed} caption="Sample data" />
        <StatCard label="Claims to answer" value={d.stats.claimsToAnswer} caption="Respond before Ops steps in" attention={d.stats.claimsToAnswer > 0} />
      </section>

      <Card className="flex flex-col gap-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-overline uppercase text-text-secondary">Your track record (shown to buyers)</p>
          <p className="text-h3 text-text-strong">{d.trackRecord.hasHistory ? d.trackRecordText : 'New seller'}</p>
          <p className="text-caption text-text-secondary">Updates automatically after every completed sale and resolved claim.</p>
        </div>
        <StatusBadge kind="neutral">{d.company.verification === 'demo_approved' ? 'Demo-approved (sample status)' : 'Pending'}</StatusBadge>
      </Card>

      {toDo.length > 0 && (
        <section aria-labelledby="todo-h" className="flex flex-col gap-sm">
          <h2 id="todo-h" className="text-h2 text-text-strong">Needs your action</h2>
          {toDo.map((t) => (
            <TransactionCard key={t.id} t={t} />
          ))}
        </section>
      )}

      <section aria-labelledby="lots-h" className="flex flex-col gap-sm">
        <h2 id="lots-h" className="text-h2 text-text-strong">Your lots</h2>
        <SellerLotsTable lots={d.lots} />
      </section>

      {d.transactions.length > toDo.length && (
        <section aria-labelledby="open-h" className="flex flex-col gap-sm">
          <h2 id="open-h" className="text-h2 text-text-strong">Sales in progress</h2>
          {d.transactions
            .filter((t) => !t.yourTurn)
            .map((t) => (
              <TransactionCard key={t.id} t={t} />
            ))}
        </section>
      )}
    </Container>
  );
}

export function SellerLots() {
  const { viewer, session } = useSession();
  const q = useQuery(`seller-lots:${session.userId}`, (ds) => ds.sellerDashboard(viewer), { pollMs: 15_000 });
  return (
    <Container className="flex flex-col gap-lg">
      <PageHeader title="My lots" actions={<ButtonLink href="/seller/lots/new" variant="primary" icon={<Plus aria-hidden />}>Create a new lot</ButtonLink>}>
        Drafts, scheduled, live and closed auctions.
      </PageHeader>
      {q.error && !q.data ? (
        <ErrorState what="We couldn’t load your lots." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      ) : !q.data ? (
        <Skeleton className="h-96" />
      ) : (
        <SellerLotsTable lots={q.data.lots} />
      )}
    </Container>
  );
}
