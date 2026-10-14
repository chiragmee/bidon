'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleCheck, CircleX, FileSearch } from 'lucide-react';
import { useState } from 'react';
import type { ClaimType, LotMedia, RemedyKind, TxDetailView } from '@auctionit/domain';
import { checkTolerance, claimEligibility, exitRefund, formatINR, formatMt, formatPct, priceAdjustment } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, ConfirmDialog, DemoPolicyCaption, EmptyState, ErrorState, EvidenceUploader, Field, Input, RetryIcon, Skeleton, StatusBadge, Textarea, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/SessionProvider';

const TYPES: { id: ClaimType; label: string; help: string }[] = [
  { id: 'contamination', label: 'Contamination', help: 'More non-metallic material than agreed' },
  { id: 'quantity', label: 'Quantity', help: 'Measured weight far from the estimate' },
  { id: 'grade', label: 'Grade', help: 'Not the declared grade' },
  { id: 'condition', label: 'Condition', help: 'Form, sizing or other condition' },
];

function expectedFor(d: TxDetailView, type: ClaimType): string {
  const tol = d.policy.tolerance;
  if (type === 'contamination') return `Up to ${formatPct(d.lot.declaration.contaminationPct ?? 0)} declared; agreed limit ${formatPct(tol?.contaminationCeilingPct ?? 0)} (demo policy)`;
  if (type === 'quantity') return `${formatMt(d.tx.estimatedQtyMt, { estimate: true })} estimated; within ±${tol?.quantityVariancePct ?? 0}% (demo policy)`;
  if (type === 'grade') return d.lot.grade;
  return d.lot.attributes.form ?? d.lot.description;
}

function initialObserved(d: TxDetailView, type: ClaimType): string {
  if (type === 'contamination') return d.tx.condition ? String(d.tx.condition.observedContaminationPct) : '';
  if (type === 'quantity') return d.tx.weighbridge ? String(d.tx.weighbridge.measuredMt) : '';
  return '';
}

function Form({ d }: { d: TxDetailView }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [type, setType] = useState<ClaimType>('contamination');
  const [observedValue, setObservedValue] = useState(() => initialObserved(d, 'contamination'));
  const [observed, setObserved] = useState('');
  const [explanation, setExplanation] = useState('');
  const liftingIds = [...(d.tx.condition?.photoMediaIds ?? []), ...(d.tx.weighbridge?.ticketMediaId ? [d.tx.weighbridge.ticketMediaId] : [])];
  const [include, setInclude] = useState<string[]>(liftingIds);
  const [files, setFiles] = useState<LotMedia[]>([]);
  const [remedy, setRemedy] = useState<RemedyKind | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const numeric = type === 'contamination' || type === 'quantity';
  const value = numeric ? parseFloat(observedValue) : 0;
  const mediaIds = [...include, ...files.map((f) => f.id)];
  const draft = { type, observedValue: Number.isFinite(value) ? value : 0, mediaIds };
  const { eligible, checks } = claimEligibility(d.lot, d.tx, draft);
  const tol = numeric && Number.isFinite(value) ? checkTolerance(d.lot, type, value) : null;
  const adjustment = priceAdjustment(d.lot, d.tx, type, draft.observedValue);
  const exit = exitRefund(d.tx);
  const adjustmentAvailable = type === 'contamination' && adjustment > 0;

  function review() {
    const e: Record<string, string> = {};
    if (numeric && !Number.isFinite(value)) e.observedValue = type === 'contamination' ? 'Enter the contamination you observed, in %.' : 'Enter the quantity you measured, in MT.';
    if (!observed.trim()) e.observed = 'Describe what you observed in a few words.';
    if (!explanation.trim()) e.explanation = 'Add a short explanation of what you found.';
    if (!remedy) e.remedy = 'Choose the remedy you’re asking for.';
    if (remedy === 'price_adjustment' && !adjustmentAvailable) e.remedy = 'A price adjustment applies only to contamination outside tolerance. Choose exit and refund.';
    setErrors(e);
    if (Object.keys(e).length === 0 && eligible) setConfirm(true);
  }

  async function submit() {
    setBusy(true);
    setFailure(null);
    const r = await ds.submitClaim(
      d.tx.id,
      { type, observedValue: draft.observedValue, observed: observed.trim(), expected: expectedFor(d, type), explanation, requestedRemedy: remedy ?? 'exit_refund', mediaIds: include },
      viewer,
      files,
    );
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return setFailure(`${r.error.what} ${r.error.next}`);
    toast.show(`Claim ${r.data.id} submitted. The seller has been asked to respond.`, 'success');
    router.push(`/transactions/${d.tx.id}`);
  }

  return (
    <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="flex min-w-0 flex-col gap-lg"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
      >
        {failure && <Banner tone="danger" title="The claim wasn’t submitted">{failure}</Banner>}
        <fieldset>
          <legend className="text-label-md text-text-strong">What’s wrong?</legend>
          <div className="mt-xs grid gap-xs sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.id} className={cn('flex items-start gap-xs rounded-md border p-sm', type === t.id ? 'border-primary bg-primary-container' : 'border-border bg-surface')}>
                <input
                  type="radio"
                  name="type"
                  className="mt-1 accent-primary"
                  checked={type === t.id}
                  onChange={() => {
                    setType(t.id);
                    setObservedValue(initialObserved(d, t.id));
                    if (t.id !== 'contamination' && remedy === 'price_adjustment') setRemedy(null);
                  }}
                />
                <span>
                  <span className="block text-label-md text-text-strong">{t.label}</span>
                  <span className="block text-caption text-text-secondary">{t.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Card className="flex flex-col gap-xs bg-surface-muted">
          <p className="text-overline uppercase text-text-secondary">Expected (from the listing)</p>
          <p className="text-body-md text-text-strong">{expectedFor(d, type)}</p>
        </Card>

        {numeric && (
          <Field label={type === 'contamination' ? 'Observed contamination (%)' : 'Measured quantity (MT)'} helper="Prefilled from the lifting check where recorded." error={errors.observedValue} required>
            <Input inputMode="decimal" value={observedValue} onChange={(e) => setObservedValue(e.target.value)} />
          </Field>
        )}
        {tol && tol.within !== null && (
          <p className="flex flex-wrap items-center gap-xs text-body-md">
            {tol.within ? <StatusBadge kind="success">Within tolerance</StatusBadge> : <StatusBadge kind="danger">Outside tolerance</StatusBadge>}
            {type === 'contamination' && tol.limit !== null && <span className="text-text-secondary">{formatPct(value)} vs {formatPct(tol.limit)} limit</span>}
            <DemoPolicyCaption />
          </p>
        )}
        <Field label="What you observed" helper="For example: 14% slag and debris below the top layer." error={errors.observed} required>
          <Input value={observed} onChange={(e) => setObserved(e.target.value)} />
        </Field>
        <Field label="Short explanation" error={errors.explanation} required>
          <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Where in the pile, how you checked, anything the seller should know." />
        </Field>

        {liftingIds.length > 0 && (
          <fieldset className="flex flex-col gap-xs">
            <legend className="text-label-md text-text-strong">Include lifting records</legend>
            {d.tx.media
              .filter((m) => liftingIds.includes(m.id))
              .map((m) => (
                <label key={m.id} className="flex items-center gap-xs text-body-md">
                  <input type="checkbox" className="size-4 accent-primary" checked={include.includes(m.id)} onChange={(e) => setInclude(e.target.checked ? [...include, m.id] : include.filter((x) => x !== m.id))} />
                  {m.caption}
                </label>
              ))}
          </fieldset>
        )}
        <EvidenceUploader
          label="More evidence"
          helper="Timestamped photos from the yard before loading finished. Location data is attached as-is; it isn’t checked."
          stage="claim"
          value={files}
          onChange={setFiles}
          category={d.lot.category}
        />

        <fieldset className="flex flex-col gap-xs">
          <legend className="text-label-md text-text-strong">Requested remedy</legend>
          {(
            [
              ['price_adjustment', 'Price adjustment', adjustmentAvailable ? `Deduct ${formatINR(adjustment)} — the excess over the limit × measured MT × your price (demo policy).` : 'Only for contamination outside tolerance. Quantity is already priced by the weighbridge.', !adjustmentAvailable],
              ['exit_refund', 'Exit and refund', `Leave the deal: ${formatINR(exit)} EMD and balance returned (simulated). The seller keeps the material.`, false],
            ] as const
          ).map(([id, label, help, disabled]) => (
            <label key={id} className={cn('flex items-start gap-xs rounded-md border p-sm', remedy === id ? 'border-primary bg-primary-container' : 'border-border bg-surface', disabled && 'opacity-60')}>
              <input type="radio" name="remedy" className="mt-1 accent-primary" disabled={disabled} checked={remedy === id} onChange={() => setRemedy(id)} />
              <span>
                <span className="block text-label-md text-text-strong">{label}</span>
                <span className="block text-caption text-text-secondary">{help}</span>
              </span>
            </label>
          ))}
          {errors.remedy && <p className="text-caption text-danger">{errors.remedy}</p>}
        </fieldset>

        <div className="flex flex-wrap gap-sm">
          <Button type="submit" variant="primary" disabled={!eligible} disabledReason="Fix the items marked ✗ in the checklist first.">
            Review and submit claim
          </Button>
          <ButtonLink href={`/transactions/${d.tx.id}`} variant="ghost">
            Cancel
          </ButtonLink>
        </div>
      </form>

      <aside aria-label="Eligibility" className="lg:sticky lg:top-[88px] lg:self-start">
        <Checklist checks={checks} eligible={eligible} />
      </aside>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title="Submit this claim?"
        consequence={`The seller is asked to accept or dispute it. If they dispute it, AuctionIT Operations decides on the evidence. Remedy requested: ${remedy === 'price_adjustment' ? `price adjustment of ${formatINR(adjustment)}` : `exit with ${formatINR(exit)} refunded`} (simulated).`}
        confirmLabel="Submit claim"
        onConfirm={submit}
      />
    </div>
  );
}

function Checklist({ checks, eligible }: { checks: ReturnType<typeof claimEligibility>['checks']; eligible: boolean }) {
  return (
    <Card className="flex flex-col gap-sm">
      <h2 className="text-h3 text-text-strong">Claim eligibility</h2>
      <ul className="flex flex-col gap-sm">
        {checks.map((c) => (
          <li key={c.rule} className="flex gap-xs text-body-md">
            {c.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="met" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-label="not met" />}
            <span>
              <span className={cn('block', c.passed ? 'text-text' : 'font-medium text-danger')}>{c.label}</span>
              {!c.passed && (
                <span className="block text-caption text-text-secondary">
                  {c.what} {c.next}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className={cn('text-caption', eligible ? 'text-success' : 'text-text-secondary')} aria-live="polite">
        {eligible ? 'All conditions met — you can submit.' : 'A claim needs every condition met.'}
      </p>
    </Card>
  );
}

/** /transactions/[id]/claim — eligibility first, then the SPEC §16.4 form. */
export function ClaimPage({ id }: { id: string }) {
  const { viewer, session } = useSession();
  const q = useQuery(`claimform:${id}:${session.userId}`, (s) => s.transactionDetail(id, viewer));
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
        <Skeleton className="h-96" />
      </Container>
    );
  }
  const d = q.data;
  if (!d || d.as !== 'buyer') {
    return (
      <Container>
        <EmptyState icon={FileSearch} title="Only the buyer can raise a claim" headingLevel={1} action={<ButtonLink href={d ? `/transactions/${d.tx.id}` : '/'}>Back</ButtonLink>}>
          Claims are raised by the buyer on their own transaction.
        </EmptyState>
      </Container>
    );
  }
  // State rules (assured, open transaction, lifting started, before loading complete) gate the form.
  const stateChecks = d.eligibility.checks;
  const blocked = stateChecks.some((c) => !c.passed);
  const openClaim = d.claim && (d.claim.status === 'open' || d.claim.status === 'under_review');

  return (
    <Container className="flex flex-col gap-lg">
      <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
        <Link href={`/transactions/${d.tx.id}`} className="hover:text-primary hover:underline">
          Transaction {d.tx.id}
        </Link>{' '}
        / Raise claim
      </nav>
      <PageHeader overline="Lot Assurance" title="Raise an assurance claim">
        {d.lot.title} · {d.tx.id} · Seller: {d.seller}
      </PageHeader>
      {openClaim ? (
        <Banner tone="info" title={`Claim ${d.claim?.id} is already open`} action={<ButtonLink href={`/transactions/${d.tx.id}`}>View its progress</ButtonLink>}>
          One claim at a time per transaction.
        </Banner>
      ) : blocked ? (
        <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_340px]">
          <Banner tone="warning" title="A claim isn’t available for this transaction" action={<ButtonLink href={`/transactions/${d.tx.id}`}>Back to the transaction</ButtonLink>}>
            {stateChecks.filter((c) => !c.passed).map((c) => `${c.what} ${c.next}`).join(' ')}
          </Banner>
          <Checklist checks={stateChecks} eligible={false} />
        </div>
      ) : (
        <Form d={d} />
      )}
    </Container>
  );
}
