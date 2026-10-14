'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Gavel, Inbox } from 'lucide-react';
import type { BuyerBidRow } from '@auctionit/domain';
import { formatINR } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Countdown, EmptyState, ErrorState, RetryIcon, SampleDataCaption, Skeleton, StatCard, StatusBadge } from '@/components/ui';
import { useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';
import { TransactionCard } from './TransactionCard';

const BID_BADGE = {
  leading: { kind: 'success', label: 'Leading' },
  outbid: { kind: 'warning', label: 'Outbid' },
  won: { kind: 'success', label: 'Won' },
  closed_not_won: { kind: 'neutral', label: 'Closed without winning' },
  none: { kind: 'neutral', label: '—' },
} as const;

function BidsTable({ rows }: { rows: BuyerBidRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full text-body-md">
          <thead className="bg-surface-muted text-overline uppercase text-on-trust-declared">
            <tr>
              <th scope="col" className="h-10 px-md text-left">Lot</th>
              <th scope="col" className="px-md text-right">Current highest</th>
              <th scope="col" className="px-md text-right">Your bid</th>
              <th scope="col" className="px-md text-left">Status</th>
              <th scope="col" className="px-md text-left">Closes</th>
              <th scope="col" className="px-md text-right"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lotId} className="h-12 border-t border-border hover:bg-canvas">
                <td className="px-md">
                  <span className="block text-text-strong">{r.title}</span>
                  <span className="text-caption text-text-secondary">{r.lotId}</span>
                </td>
                <td className="px-md text-right">{formatINR(r.highestBidPerMt, { perMt: true })}</td>
                <td className="px-md text-right">{formatINR(r.myBidPerMt, { perMt: true })}</td>
                <td className="px-md">
                  <StatusBadge kind={BID_BADGE[r.bidStatus].kind}>{BID_BADGE[r.bidStatus].label}</StatusBadge>
                </td>
                <td className="px-md">{r.status === 'live' ? <Countdown to={r.endAt} prefix="In" /> : <span className="text-caption text-text-secondary">Closed</span>}</td>
                <td className="px-md text-right">
                  <Link href={`/auctions/${r.lotId}`} className="text-label-md text-primary underline">
                    {r.bidStatus === 'outbid' ? 'Bid again' : 'View lot'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-sm md:hidden">
        {rows.map((r) => (
          <li key={r.lotId}>
            <Link href={`/auctions/${r.lotId}`} className="flex flex-col gap-xs rounded-lg border border-border bg-surface p-md">
              <div className="flex items-start justify-between gap-xs">
                <span className="text-label-md text-text-strong">{r.title}</span>
                <StatusBadge kind={BID_BADGE[r.bidStatus].kind}>{BID_BADGE[r.bidStatus].label}</StatusBadge>
              </div>
              <span className="text-caption text-text-secondary">
                Highest {formatINR(r.highestBidPerMt, { perMt: true })} · yours {formatINR(r.myBidPerMt, { perMt: true })}
              </span>
              {r.status === 'live' && <Countdown to={r.endAt} />}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function BuyerDashboard() {
  const { viewer, session } = useSession();
  const welcome = useSearchParams().get('welcome') === '1';
  const q = useQuery(`buyer-dash:${session.userId}`, (ds) => ds.buyerDashboard(viewer), { pollMs: 15_000 });

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState
          what="We couldn’t load your dashboard."
          meaning="Your bids, deposits and transactions are unchanged."
          next="Check your connection and try again."
          action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>}
        />
      </Container>
    );
  }
  if (q.data === undefined) {
    return (
      <Container>
        <div role="status" aria-label="Loading dashboard" className="flex flex-col gap-lg">
          <Skeleton className="h-10 w-1/2" />
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-48" />
        </div>
      </Container>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <Container>
        <EmptyState icon={Inbox} title="Buyer profile not found" headingLevel={1} action={<ButtonLink href="/sign-in">Sign in</ButtonLink>}>
          This buyer account no longer exists — the demo data may have been reset. Sign in again to continue.
        </EmptyState>
      </Container>
    );
  }
  const urgent = d.transactions.find((t) => t.yourTurn);

  return (
    <Container className="flex flex-col gap-xl">
      <PageHeader overline={<>{d.buyer.company} · <SampleDataCaption className="normal-case" /></>} title={`Welcome, ${d.buyer.name.split(' ')[0]}`}>
        Your bids, won lots and transactions in one place.
      </PageHeader>

      {welcome && (
        <Banner tone="success" title="Your buyer profile is ready (demo-approved)" action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
          Find a lot → review the evidence → pay the EMD (simulated) → bid. If you win, pay the balance, schedule lifting and complete the purchase from here.
        </Banner>
      )}

      {urgent?.next && (
        <Banner tone="warning" title={`Next step on ${urgent.id}: ${urgent.next.label}`} action={<ButtonLink href={`/transactions/${urgent.id}`} variant="primary">Open {urgent.id}</ButtonLink>}>
          {urgent.lotTitle} · with {urgent.counterparty}
        </Banner>
      )}

      <section aria-label="Summary" className="grid gap-md sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Active bids" value={d.stats.activeBids} caption={`${d.stats.leading} leading · ${d.stats.outbid} outbid`} />
        <StatCard label="Closing soon" value={d.stats.closingSoon} caption="Your live auctions ending within 3 hours" />
        <StatCard label="Won — next step" value={d.stats.wonNextStep} caption="Balance payment due" attention={d.stats.wonNextStep > 0} />
        <StatCard label="In progress" value={d.stats.inProgress} caption="Paid, lifting or under review" />
        <StatCard label="Completed" value={d.stats.completed} caption="Finished purchases" />
      </section>

      <section aria-labelledby="bids-h" className="flex flex-col gap-sm">
        <h2 id="bids-h" className="text-h2 text-text-strong">Active bidding</h2>
        {d.activeBids.length === 0 ? (
          <EmptyState icon={Gavel} title="No active bids" action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
            Find a live lot, pay the EMD (simulated) and place your first bid.
          </EmptyState>
        ) : (
          <BidsTable rows={d.activeBids} />
        )}
      </section>

      <section aria-labelledby="tx-h" className="flex flex-col gap-sm">
        <h2 id="tx-h" className="text-h2 text-text-strong">Won lots and transactions</h2>
        <p className="text-body-md text-text-secondary">Won → Balance payment → Lifting → Quantity and condition check → Complete, or raise an assurance claim.</p>
        {d.transactions.length === 0 ? (
          <EmptyState icon={Inbox} title="No transactions in progress" action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
            When you win an auction, its payment and lifting steps appear here.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {d.transactions.map((t) => (
              <TransactionCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      {(d.completed.length > 0 || d.closedBids.length > 0) && (
        <section aria-labelledby="history-h" className="flex flex-col gap-sm">
          <h2 id="history-h" className="text-h2 text-text-strong">History</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {d.completed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-xs px-md py-sm text-body-md">
                <Link href={`/transactions/${t.id}`} className="text-text-strong hover:text-primary hover:underline">
                  {t.lotTitle} <span className="text-caption text-text-secondary">· {t.id}</span>
                </Link>
                <StatusBadge kind={t.status === 'defaulted' ? 'danger' : 'success'}>{t.statusLabel}</StatusBadge>
              </li>
            ))}
            {d.closedBids.map((r) => (
              <li key={r.lotId} className="flex flex-wrap items-center justify-between gap-xs px-md py-sm text-body-md">
                <Link href={`/auctions/${r.lotId}`} className="text-text-strong hover:text-primary hover:underline">
                  {r.title} <span className="text-caption text-text-secondary">· {r.lotId}</span>
                </Link>
                <StatusBadge kind="neutral">Closed without winning</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
