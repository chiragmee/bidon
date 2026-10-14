'use client';

import Link from 'next/link';
import { FileSearch, Gavel, Scale, Store } from 'lucide-react';
import { useState } from 'react';
import type { ClaimReviewView, LotMedia, OpsDecision } from '@auctionit/domain';
import { formatAge, formatINR, formatMt, formatPct, formatRemedyOutcome } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, ConfirmDialog, DemoPolicyCaption, EmptyState, ErrorState, Field, LotImage, RetryIcon, Skeleton, StatusBadge, Textarea, TrustBadge, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/SessionProvider';

function Column({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-md rounded-lg border border-border bg-surface p-md">
      <h2 className="flex items-center gap-xs text-h3 text-text-strong">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Files({ items, d }: { items: LotMedia[]; d: ClaimReviewView }) {
  if (items.length === 0) return <p className="text-caption text-text-secondary">No files attached.</p>;
  return (
    <ul className="grid grid-cols-3 gap-xs">
      {items.map((m) => (
        <li key={m.id}>
          <LotImage src={m.url || null} alt={m.caption} category={d.lot.category} ratio="1/1" sizes="120px" className="rounded-sm" />
          <span className="block truncate text-caption text-text-secondary" title={m.caption}>
            {m.caption}
          </span>
        </li>
      ))}
    </ul>
  );
}

const OUTCOMES: { id: OpsDecision['outcome']; label: string }[] = [
  { id: 'approve_adjustment', label: 'Approve price adjustment' },
  { id: 'approve_exit', label: 'Approve exit and refund' },
  { id: 'reject', label: 'Reject the claim' },
];

/** Three-column review (PHASES 5.3): declaration · lifting evidence · seller position, then a reasoned decision. */
export function ClaimReview({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const q = useQuery(`claim:${id}`, (s) => s.claimReview(id, viewer));
  const [outcome, setOutcome] = useState<OpsDecision['outcome'] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState what="We couldn’t load this claim." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (q.data === undefined) {
    return (
      <Container>
        <Skeleton className="h-[480px]" />
      </Container>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <Container>
        <EmptyState icon={FileSearch} title="Claim not found" headingLevel={1} action={<ButtonLink href="/ops">Back to the queue</ButtonLink>}>
          There’s no claim with ID {id}.
        </EmptyState>
      </Container>
    );
  }
  const { claim, tx, lot, tolerance } = d;
  const decidable = claim.status === 'under_review';
  const adjustmentAvailable = d.outcomes.approve_adjustment > 0;

  return (
    <Container className="flex flex-col gap-lg">
      <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
        <Link href="/ops" className="hover:text-primary hover:underline">
          Operations
        </Link>{' '}
        / Assurance queue / {claim.id}
      </nav>
      <header className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          <StatusBadge kind={decidable ? 'warning' : claim.status === 'resolved' ? 'success' : 'neutral'}>
            {decidable ? 'Under Operations review' : claim.status === 'resolved' ? 'Resolved' : claim.status === 'rejected' ? 'Rejected' : 'Waiting for the seller'}
          </StatusBadge>
          <span className="text-caption text-text-secondary">Open for {formatAge(d.ageMs)} · Sample data</span>
        </div>
        <h1 className="text-h1 text-text-strong">
          Claim {claim.id}: {lot.title}
        </h1>
        <p className="text-body-md text-text-secondary">
          <Link href={`/transactions/${tx.id}`} className="text-primary underline">
            {tx.id}
          </Link>{' '}
          · {d.buyer} (buyer) against {d.seller} (seller) · {formatINR(tx.pricePerMt, { perMt: true })}
        </p>
      </header>

      {done && <Banner tone="success" title="Decision recorded">{done}</Banner>}

      <div className="grid gap-md lg:grid-cols-3">
        <Column title="Seller declaration" icon={<Store className="size-5 text-primary" aria-hidden />}>
          <div className="flex flex-col gap-xs text-body-md">
            <TrustBadge tier="declared" className="self-start" />
            <p>
              {lot.grade} · {formatMt(lot.estimatedQtyMt, { estimate: true })}
            </p>
            {lot.declaration.contaminationPct !== null && <p>Contamination up to {formatPct(lot.declaration.contaminationPct)}</p>}
            <p className="text-text-secondary">“{lot.description}”</p>
          </div>
          <div className="flex flex-col gap-xs rounded-md bg-primary-container p-sm text-body-md text-on-primary-container">
            <p className="flex flex-wrap items-center gap-xs">
              Agreed tolerance: {tolerance.limit !== null ? `${tolerance.limit}${tolerance.unit === '%' ? '%' : '% variance'}` : 'judged on evidence'} <DemoPolicyCaption />
            </p>
          </div>
          <div className="flex flex-col gap-xs">
            <TrustBadge tier="evidence" className="self-start" />
            <Files items={d.listingEvidence.filter((m) => m.kind === 'photo').slice(0, 6)} d={d} />
          </div>
        </Column>

        <Column title="Lifting and buyer evidence" icon={<Scale className="size-5 text-primary" aria-hidden />}>
          {tx.weighbridge && (
            <div className="flex flex-col gap-xs text-body-md">
              <TrustBadge tier="confirmed" className="self-start" />
              <p>
                Weighbridge {tx.weighbridge.ticketRef}: net <strong>{formatMt(tx.weighbridge.measuredMt)}</strong>
                {tx.weighbridge.grossMt !== null && ` (gross ${formatMt(tx.weighbridge.grossMt)}, tare ${formatMt(tx.weighbridge.tareMt ?? 0)})`}
              </p>
            </div>
          )}
          {tx.condition && (
            <p className="text-body-md">
              Condition check: <strong>{formatPct(tx.condition.observedContaminationPct)}</strong> contamination observed
            </p>
          )}
          <div className="flex flex-col gap-xs rounded-md bg-surface-muted p-sm text-body-md">
            <p className="text-overline uppercase text-text-secondary">Claim · {claim.type}</p>
            <p>
              Expected {claim.expected}; observed <strong>{claim.observed}</strong>
            </p>
            {tolerance.within === false && (
              <StatusBadge kind="danger" className="self-start">
                Outside tolerance by {tolerance.excess}
                {tolerance.unit === '%' ? ' pts' : '%'}
              </StatusBadge>
            )}
            <p>“{claim.explanation}”</p>
            <p>
              Requested: <strong>{claim.requestedRemedy === 'price_adjustment' ? 'price adjustment' : 'exit and refund'}</strong>
            </p>
          </div>
          <Files items={d.buyerEvidence} d={d} />
        </Column>

        <Column title="Seller’s position" icon={<Gavel className="size-5 text-primary" aria-hidden />}>
          {claim.sellerResponse ? (
            <div className="flex flex-col gap-xs text-body-md">
              <StatusBadge kind={claim.sellerResponse.decision === 'dispute' ? 'warning' : 'success'} className="self-start">
                {claim.sellerResponse.decision === 'dispute' ? 'Disputed' : 'Accepted'} ·{' '}
                {new Date(claim.sellerResponse.respondedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </StatusBadge>
              <p>“{claim.sellerResponse.explanation}”</p>
              <Files items={d.sellerEvidence} d={d} />
            </div>
          ) : (
            <p className="text-body-md text-text-secondary">The seller hasn’t responded yet.</p>
          )}
        </Column>
      </div>

      {claim.opsDecision ? (
        <section aria-label="Decision" className="flex flex-col gap-xs rounded-lg border border-border bg-surface p-lg text-body-md">
          <h2 className="text-h3 text-text-strong">Decision</h2>
          <p>
            <strong>{OUTCOMES.find((o) => o.id === claim.opsDecision?.outcome)?.label}</strong>
            {claim.opsDecision.amount > 0 && ` · ${formatINR(claim.opsDecision.amount)} (simulated)`}
          </p>
          <p>“{claim.opsDecision.reason}”</p>
          <p className="text-caption text-text-secondary">
            {d.decidedBy} · {new Date(claim.opsDecision.decidedAt).toLocaleString('en-IN')}
          </p>
        </section>
      ) : decidable ? (
        <section aria-labelledby="decide-h" className="flex flex-col gap-md rounded-lg border border-border bg-surface p-lg">
          <h2 id="decide-h" className="text-h3 text-text-strong">Record a decision</h2>
          <fieldset className="grid gap-xs md:grid-cols-3">
            <legend className="sr-only">Outcome</legend>
            {OUTCOMES.map((o) => {
              const disabled = o.id === 'approve_adjustment' && !adjustmentAvailable;
              return (
                <label key={o.id} className={cn('flex items-start gap-xs rounded-md border p-sm', outcome === o.id ? 'border-primary bg-primary-container' : 'border-border', disabled && 'opacity-60')}>
                  <input type="radio" name="outcome" className="mt-1 accent-primary" disabled={disabled} checked={outcome === o.id} onChange={() => (setOutcome(o.id), setError(null))} />
                  <span>
                    <span className="block text-label-md text-text-strong">{o.label}</span>
                    <span className="block text-caption text-text-secondary">
                      {disabled ? 'No price adjustment applies to this claim type.' : formatRemedyOutcome(o.id, d.outcomes[o.id])}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <Field label="Reason for the decision" helper="Both parties see this. It’s recorded with your name and the time." error={error} required>
            <Textarea value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} placeholder="What the evidence shows and why this outcome follows from the agreed terms." />
          </Field>
          <div>
            <Button
              variant="primary"
              onClick={() => {
                if (!outcome) return setError('Choose an outcome.');
                if (reason.trim().length < 10) return setError('Write at least a sentence explaining the decision.');
                setConfirm(true);
              }}
            >
              Record decision
            </Button>
          </div>
        </section>
      ) : (
        <Banner tone="info">This claim is waiting for the seller’s response. Operations decides only disputed claims.</Banner>
      )}

      <section aria-labelledby="trail-h" className="flex flex-col gap-sm">
        <h2 id="trail-h" className="text-h3 text-text-strong">Audit trail</h2>
        <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
          {d.timeline.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-xs px-md py-sm text-body-md">
              <span>
                <span className="font-medium text-text-strong">{e.label}</span>
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

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title="Record this decision?"
        consequence={outcome ? `${formatRemedyOutcome(outcome, d.outcomes[outcome])}. The claim and transaction close, and both parties are notified. This can’t be undone in the demo.` : ''}
        confirmLabel="Record decision"
        onConfirm={async () => {
          if (!outcome) return;
          setBusy(true);
          const r = await ds.decideClaim(claim.id, { outcome, reason }, viewer);
          setBusy(false);
          setConfirm(false);
          if (r.ok) {
            const text = `${OUTCOMES.find((o) => o.id === outcome)?.label}. Buyer and seller have been notified.`;
            setDone(text);
            toast.show('Decision recorded.', 'success');
          } else {
            setError(`${r.error.what} ${r.error.next}`);
          }
          q.reload();
        }}
      />
    </Container>
  );
}
