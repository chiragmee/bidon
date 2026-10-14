'use client';

import Link from 'next/link';
import { Inbox, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { OpsAuctionRow, OpsOverviewView } from '@auctionit/domain';
import { formatAge, formatINR } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { AuctionStatusBadge, Banner, Button, ButtonLink, ConfirmDialog, Countdown, EmptyState, ErrorState, RetryIcon, Skeleton, StatCard, StatusBadge, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';

const th = 'h-10 px-md text-left';

export function AuctionsTable({ rows, onClosed }: { rows: OpsAuctionRow[]; onClosed: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [target, setTarget] = useState<OpsAuctionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      {result && <Banner tone={result.ok ? 'success' : 'danger'} className="mb-sm">{result.text}</Banner>}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[760px] text-body-md">
          <thead className="bg-surface-muted text-overline uppercase text-on-trust-declared">
            <tr>
              <th scope="col" className={th}>Lot</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className="px-md text-right">Highest / reserve</th>
              <th scope="col" className="px-md text-right">Bids</th>
              <th scope="col" className={th}>Result</th>
              <th scope="col" className="px-md text-right"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lotId} className="h-12 border-t border-border hover:bg-canvas">
                <td className="px-md">
                  <Link href={`/auctions/${r.lotId}`} className="text-text-strong hover:text-primary hover:underline">{r.title}</Link>
                  <span className="block text-caption text-text-secondary">{r.lotId} · {r.seller}</span>
                </td>
                <td className="px-md">
                  <div className="flex flex-col items-start gap-0.5">
                    <AuctionStatusBadge status={r.status} />
                    {r.status === 'live' && <Countdown to={r.endAt} />}
                  </div>
                </td>
                <td className="px-md text-right">
                  {r.highestBidPerMt !== null ? formatINR(r.highestBidPerMt, { perMt: true }) : '—'}
                  <span className="block text-caption text-text-secondary">reserve {formatINR(r.reservePerMt, { perMt: true })}</span>
                </td>
                <td className="px-md text-right">{r.bidCount}</td>
                <td className="px-md">
                  {r.status === 'live' ? (r.reserveMet ? 'Reserve met so far' : 'Reserve not met yet') : r.transactionId ? (
                    <Link href={`/transactions/${r.transactionId}`} className="text-primary underline">{r.transactionId}</Link>
                  ) : r.status === 'closed_unsold' ? 'Unsold — no bid met the reserve' : '—'}
                </td>
                <td className="px-md text-right">
                  {r.status === 'live' && (
                    <Button variant="demo" onClick={() => setTarget(r)}>
                      Close now
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        busy={busy}
        tone="demo"
        title={`Close ${target?.lotId ?? ''} now?`}
        consequence="Demo control: ends bidding immediately. The winner is the highest stored bid that meets the reserve; if none does, the lot closes unsold."
        confirmLabel="Close auction"
        onConfirm={async () => {
          if (!target) return;
          setBusy(true);
          const r = await ds.closeDemoAuction(target.lotId, viewer);
          setBusy(false);
          setTarget(null);
          const text = r.ok
            ? r.data.transactionId
              ? `${target.lotId} closed — reserve met. Transaction ${r.data.transactionId} started.`
              : `${target.lotId} closed unsold — no bid met the reserve.`
            : `${r.error.what} ${r.error.next}`;
          setResult({ ok: r.ok, text });
          if (r.ok) toast.show(text, 'success');
          onClosed();
        }}
      />
    </>
  );
}

function Queue({ rows, empty }: { rows: OpsOverviewView['queue']; empty: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={Inbox} title={empty}>
        Normal transactions complete without Operations. Disputed claims appear here.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[900px] text-body-md">
        <thead className="bg-surface-muted text-overline uppercase text-on-trust-declared">
          <tr>
            <th scope="col" className={th}>Claim / lot</th>
            <th scope="col" className={th}>Buyer → seller</th>
            <th scope="col" className={th}>Discrepancy</th>
            <th scope="col" className={th}>Tolerance</th>
            <th scope="col" className={th}>Remedy asked</th>
            <th scope="col" className={th}>Seller</th>
            <th scope="col" className="px-md text-right">Open for</th>
            <th scope="col" className="px-md text-right"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.claimId} className="h-12 border-t border-border hover:bg-canvas">
              <td className="px-md py-xs">
                <span className="block font-medium text-text-strong">{r.claimId}</span>
                <span className="block text-caption text-text-secondary">{r.lotTitle} · {r.txId}</span>
              </td>
              <td className="px-md text-caption">{r.buyer} → {r.seller}</td>
              <td className="px-md">
                {r.discrepancy}
                <span className="block text-caption text-text-secondary">{r.evidenceCount} evidence files</span>
              </td>
              <td className="px-md text-caption">{r.tolerance}</td>
              <td className="px-md">{r.requestedRemedy}</td>
              <td className="px-md">
                <StatusBadge kind={r.sellerResponse === 'Disputed' ? 'warning' : r.sellerResponse === 'Accepted' ? 'success' : 'neutral'}>{r.sellerResponse}</StatusBadge>
              </td>
              <td className="px-md text-right">{formatAge(r.ageMs)}</td>
              <td className="px-md text-right">
                <Link href={`/ops/claims/${r.claimId}`} className="text-label-md text-primary underline">
                  {r.status === 'under_review' ? 'Review' : 'View'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpsOverview() {
  const { viewer } = useSession();
  const q = useQuery('ops-overview', (ds) => ds.opsOverview(viewer), { pollMs: 10_000 });
  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState what="We couldn’t load the Operations overview." next="Try again in a moment." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (!q.data) {
    return (
      <Container>
        <div role="status" aria-label="Loading overview" className="flex flex-col gap-lg">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      </Container>
    );
  }
  const o = q.data;
  const firstReview = o.queue.find((r) => r.status === 'under_review');

  return (
    <Container className="flex flex-col gap-xl">
      <PageHeader overline="Operations · Sample data" title="Operations overview">
        AuctionIT handles exceptions — it doesn’t inspect every lot. Normal transactions finish without anyone here.
      </PageHeader>

      {firstReview && (
        <Banner tone="warning" title={`${o.queue.filter((r) => r.status === 'under_review').length} disputed claim needs a decision`} action={<ButtonLink href={`/ops/claims/${firstReview.claimId}`} variant="primary">Review {firstReview.claimId}</ButtonLink>}>
          {firstReview.lotTitle} · {firstReview.discrepancy} · open for {formatAge(firstReview.ageMs)}
        </Banner>
      )}

      <section aria-label="Summary" className="grid gap-md sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Live auctions" value={o.stats.live} caption="Sample data" />
        <StatCard label="Closed auctions" value={o.stats.closed} caption="Sample data" />
        <StatCard label="Awaiting action" value={o.stats.awaitingAction} caption="Open transactions" />
        <StatCard label="Open claims" value={o.stats.openClaims} caption="Waiting on seller or Operations" attention={o.stats.openClaims > 0} />
        <StatCard label="Completed" value={o.stats.completed} caption="Sample data" />
      </section>

      <section aria-labelledby="metrics-h" className="flex flex-col gap-sm">
        <div className="flex flex-wrap items-end justify-between gap-xs">
          <h2 id="metrics-h" className="text-h2 text-text-strong">Outcome metrics</h2>
          <StatusBadge kind="neutral">Simulated — computed from demo data</StatusBadge>
        </div>
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border-control bg-surface p-md">
            <p className="text-overline uppercase text-text-secondary">{o.baseline.label}</p>
            <p className="text-h2 text-text-strong">{o.baseline.value}</p>
            <p className="text-caption text-text-secondary">{o.baseline.caption}</p>
          </div>
          {o.metrics.map((m) => (
            <StatCard key={m.label} label={m.label} value={m.value} caption={m.caption} />
          ))}
        </div>
        <p className="text-caption text-text-secondary">These figures show how the workflow connects to the business outcome. They are not live AuctionIT results and don’t prove that Lot Assurance works.</p>
      </section>

      <section aria-labelledby="queue-h" className="flex flex-col gap-sm">
        <h2 id="queue-h" className="flex items-center gap-xs text-h2 text-text-strong">
          <ShieldCheck className="size-6 text-primary" aria-hidden />
          Assurance queue
        </h2>
        <Queue rows={o.queue} empty="No open claims" />
      </section>

      <section aria-labelledby="tx-h" className="flex flex-col gap-sm">
        <h2 id="tx-h" className="text-h2 text-text-strong">Transactions awaiting action</h2>
        {o.transactions.length === 0 ? (
          <p className="text-body-md text-text-secondary">No open transactions.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {o.transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-xs px-md py-sm text-body-md">
                <span>
                  <Link href={`/transactions/${t.id}`} className="font-medium text-text-strong hover:text-primary hover:underline">
                    {t.id} · {t.lotTitle}
                  </Link>
                  <span className="block text-caption text-text-secondary">
                    {t.buyer} → {t.seller} · {t.waitingOn ?? t.statusLabel}
                  </span>
                </span>
                {t.overdue ? <StatusBadge kind="danger">Payment overdue</StatusBadge> : <StatusBadge kind="neutral">{t.statusLabel}</StatusBadge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="auctions-h" className="flex flex-col gap-sm">
        <div className="flex flex-wrap items-end justify-between gap-xs">
          <h2 id="auctions-h" className="text-h2 text-text-strong">Auctions</h2>
          <Link href="/ops/auctions" className="text-label-md text-primary underline">All auctions and results</Link>
        </div>
        <AuctionsTable rows={o.auctions.filter((a) => a.status === 'live').concat(o.auctions.filter((a) => a.status !== 'live').slice(0, 3))} onClosed={q.reload} />
      </section>

      <section aria-labelledby="decided-h" className="flex flex-col gap-sm">
        <h2 id="decided-h" className="text-h2 text-text-strong">Recently decided claims</h2>
        <Queue rows={o.decided} empty="No decided claims yet" />
      </section>

      <section aria-labelledby="audit-h" className="flex flex-col gap-sm">
        <h2 id="audit-h" className="text-h2 text-text-strong">Audit trail</h2>
        <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
          {o.recent.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-xs px-md py-sm text-body-md">
              <span>
                <span className="font-medium text-text-strong">{e.label}</span> · {e.entity}
                <span className="block text-caption text-text-secondary">
                  {e.actor}
                  {e.reason ? ` — “${e.reason}”` : ''}
                </span>
              </span>
              <span className="text-caption text-text-secondary">{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}

export function OpsAuctions() {
  const { viewer } = useSession();
  const q = useQuery('ops-auctions', (ds) => ds.opsOverview(viewer), { pollMs: 10_000 });
  return (
    <Container className="flex flex-col gap-lg">
      <PageHeader overline="Operations" title="Auctions and results">
        Live auctions close automatically at their end time. “Close now” is a demo control; results always come from stored bids and the reserve.
      </PageHeader>
      {q.error && !q.data ? (
        <ErrorState what="We couldn’t load auctions." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      ) : !q.data ? (
        <Skeleton className="h-96" />
      ) : (
        <AuctionsTable rows={q.data.auctions} onClosed={q.reload} />
      )}
    </Container>
  );
}
