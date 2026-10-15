'use client';

import Link from 'next/link';
import { ChevronRight, FileSearch, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatINR, formatMt, TX_STEPS, type TxDetailView } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, EmptyState, ErrorState, RetryIcon, SampleDataCaption, Skeleton, StatusBadge, Stepper, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { ClaimPanel } from './ClaimPanel';
import { BalancePanel, CompletePanel, ConditionCard, FinalPanel, LiftingPanel, Reconciliation, WeighbridgeCard, type RunAction } from './TxPanels';

function Summary({ d }: { d: TxDetailView }) {
  const rows: [string, string][] = [
    ['Winning bid', formatINR(d.tx.pricePerMt, { perMt: true })],
    ['Estimated quantity', formatMt(d.tx.estimatedQtyMt, { estimate: true })],
    ['EMD (simulated)', `${formatINR(d.tx.emdAmount)}${d.emdStatus ? ` · ${d.emdStatus === 'succeeded' ? 'held' : d.emdStatus}` : ''}`],
    ['Balance paid (simulated)', d.tx.balancePaid ? formatINR(d.tx.balancePaid) : '—'],
    ['Measured quantity', d.tx.weighbridge ? formatMt(d.tx.weighbridge.measuredMt) : 'At lifting'],
    ['Final value', d.tx.finalPayable !== null ? formatINR(d.tx.finalPayable) : 'After completion'],
  ];
  return (
    <Card>
      <h2 className="mb-xs text-h3 text-text-strong">Summary</h2>
      <dl className="flex flex-col gap-xs text-body-md">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-sm">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="text-right text-text-strong">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Timeline({ d }: { d: TxDetailView }) {
  return (
    <Card>
      <h2 className="mb-sm text-h3 text-text-strong">Timeline</h2>
      <ol className="flex flex-col gap-sm border-l-2 border-border pl-md">
        {d.timeline.map((e) => (
          <li key={e.id} className="relative text-body-md">
            <span aria-hidden className="absolute -left-[calc(var(--spacing-md)+5px)] top-1.5 size-2 rounded-full bg-primary" />
            <p className="text-label-md text-text-strong">{e.label}</p>
            <p className="text-caption text-text-secondary">
              {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {e.actor}
            </p>
            {e.reason && <p className="text-caption text-text">“{e.reason}”</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** /transactions/[id] — one page for buyer, seller and Operations, each with their own actions (PHASES 5.1). */
export function TransactionWorkspace({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer, session } = useSession();
  const toast = useToast();
  const q = useQuery(`txd:${id}:${session.userId}`, (s) => s.transactionDetail(id, viewer), { pollMs: 5000, keepPrevious: true });
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  const report = (text: string, ok: boolean) => {
    setOutcome({ ok, text });
    if (ok) toast.show(text, 'success');
    q.reload();
  };

  const run: RunAction = async (action, { media, success }) => {
    const r = await ds.txAction(id, action, viewer, media);
    if (r.ok) report(success, true);
    else setOutcome({ ok: false, text: `${r.error.what} ${r.error.next}` });
    return r.ok;
  };

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState what="We couldn’t load this transaction." meaning="Nothing about it has changed." next="Check your connection and try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (q.data === undefined) {
    return (
      <Container>
        <div role="status" aria-label="Loading transaction" className="flex flex-col gap-md">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      </Container>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <Container>
        <EmptyState icon={FileSearch} title="Transaction not available" headingLevel={1} action={<ButtonLink href={HOME[session.role]}>Back to dashboard</ButtonLink>}>
          Either {id} doesn’t exist, or you aren’t the buyer, the seller or Operations on it.
        </EmptyState>
      </Container>
    );
  }

  const { tx } = d;
  const action = d.yourTurn ? d.next?.action : null;
  const showChecks = tx.liftingConfirmedAt !== null;
  const back = d.as === 'ops' ? { href: '/ops', label: 'Operations' } : d.as === 'buyer' ? { href: '/buyer/dashboard', label: 'Dashboard' } : { href: '/seller/dashboard', label: 'Seller dashboard' };

  return (
    <Container className="flex flex-col gap-lg">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-caption text-text-secondary">
        <Link href={back.href} className="hover:text-primary hover:underline">
          {back.label}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page">Transaction {tx.id}</span>
      </nav>

      <header className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          <StatusBadge kind={d.stepper.claim ? 'warning' : tx.status === 'defaulted' ? 'danger' : d.stepper.done ? 'success' : d.yourTurn ? 'warning' : 'neutral'}>{d.statusLabel}</StatusBadge>
          {d.sample && <SampleDataCaption />}
        </div>
        <h1 className="text-h1 text-text-strong">
          {d.lot.title} · {tx.id}
        </h1>
        <p className="flex flex-wrap items-center gap-x-sm gap-y-1 text-body-md text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {d.lot.location.yard}
          </span>
          <span>Buyer: {d.buyer}</span>
          <span>Seller: {d.seller}</span>
          <Link href={`/auctions/${d.lot.id}`} className="text-primary underline">
            {d.lot.id}
          </Link>
        </p>
      </header>

      <Card className="p-lg">
        <Stepper steps={TX_STEPS} current={d.stepper.current} claim={d.stepper.claim} claimLabel="Assurance claim" captions={d.captions} label={`${tx.id} progress`} />
      </Card>

      <div ref={outcomeRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {outcome && <Banner tone={outcome.ok ? 'success' : 'danger'}>{outcome.text}</Banner>}
      </div>

      {d.next && !d.yourTurn && !d.stepper.done && (
        <p className="text-body-md text-text-secondary">
          Next step: {d.next.label.toLowerCase()} — {d.next.role === 'ops' ? 'Operations' : `the ${d.next.role}`}.
        </p>
      )}

      <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-lg">
          <FinalPanel d={d} />
          <ClaimPanel d={d} onDone={report} primary={d.yourTurn && (action === 'respond_claim' || action === 'decide_claim')} />
          <CompletePanel d={d} run={run} />
          {showChecks && (
            <>
              <p className="rounded-md border border-dashed border-border-control px-md py-sm text-body-md text-text-secondary">
                The weighbridge measurement (quantity) and the visual condition check are two separate records — one doesn’t confirm the other.
              </p>
              <WeighbridgeCard d={d} run={run} primary={action === 'record_weighbridge'} />
              {d.assured && <ConditionCard d={d} run={run} primary={action === 'record_condition'} />}
              <Reconciliation d={d} />
            </>
          )}
          {tx.status !== 'defaulted' && <LiftingPanel d={d} run={run} primary={action === 'propose_lifting' || action === 'confirm_lifting'} />}
          <BalancePanel d={d} run={run} primary={action === 'pay_balance'} />
        </div>
        <aside className="flex flex-col gap-lg" aria-label="Transaction details">
          <Summary d={d} />
          <Timeline d={d} />
        </aside>
      </div>
    </Container>
  );
}
