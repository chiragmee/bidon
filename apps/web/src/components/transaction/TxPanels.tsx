'use client';

import Link from 'next/link';
import { CircleCheck, Scale, ScanEye } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { LotMedia, TxAction, TxDetailView } from '@auctionit/domain';
import { formatINR, formatMt, formatPct } from '@auctionit/domain';
import {
  Banner,
  Button,
  ButtonLink,
  ConfirmDialog,
  Countdown,
  DemoPolicyCaption,
  Dialog,
  EvidenceUploader,
  Field,
  Input,
  LotImage,
  StatusBadge,
  Textarea,
  TrustBadge,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { PaymentForm, PaymentInstructions } from '@/components/payments/PaymentForm';
import { PaymentHistory, PaymentStatusBadge, SubmissionDetails } from '@/components/payments/PaymentRecord';
import { useData } from '@/data';
import { useSession } from '@/lib/SessionProvider';

export type RunAction = (action: TxAction, opts: { media?: LotMedia[]; success: string }) => Promise<boolean>;

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function Panel({ title, icon, done, children, aside, className }: { title: string; icon?: ReactNode; done?: boolean; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-md rounded-lg border border-border bg-surface p-lg', className)} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-xs">
        <h2 className="flex items-center gap-xs text-h3 text-text-strong">
          {icon}
          {title}
          {done && <CircleCheck className="size-5 text-success" aria-label="done" />}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-surface-muted px-md py-sm text-body-md text-text-secondary">{children}</p>;
}

// ── 1. Balance ───────────────────────────────────────────────────────────────

export function BalancePanel({ d, run, primary }: { d: TxDetailView; run: RunAction; primary: boolean }) {
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { tx } = d;
  const paid = tx.balancePaidAt !== null;
  const report = d.balancePayment;
  const pending = !!report && !report.decision;
  const awaiting = tx.status === 'won_awaiting_balance';
  const sampleRecord = paid && !report;

  return (
    <Panel title="Balance payment" done={paid}>
      <dl className="grid gap-xs text-body-md sm:grid-cols-2">
        <div className="flex justify-between gap-sm sm:block">
          <dt className="text-text-secondary">Estimated value</dt>
          <dd className="text-text-strong">
            {formatMt(tx.estimatedQtyMt, { estimate: true })} × {formatINR(tx.pricePerMt, { perMt: true })} = {formatINR(d.estimatedTotal, { estimate: true })}
          </dd>
        </div>
        <div className="flex justify-between gap-sm sm:block">
          <dt className="text-text-secondary">EMD (counts toward the price)</dt>
          <dd className="text-text-strong">
            {formatINR(tx.emdAmount)}
            {d.emd?.mode === 'simulated' ? ' (sample record)' : ''}
          </dd>
        </div>
        <div className="flex justify-between gap-sm sm:block">
          <dt className="text-text-secondary">{paid ? 'Balance confirmed by seller' : 'Balance due'}</dt>
          <dd className="text-price-md text-text-strong">{formatINR(paid ? tx.balancePaid : d.balanceDue)}</dd>
        </div>
        <div className="flex justify-between gap-sm sm:block">
          <dt className="text-text-secondary">{paid ? 'Confirmed on' : 'Pay by'}</dt>
          <dd className="text-text">
            {paid ? when(tx.balancePaidAt) : when(tx.paymentDeadline)}
            {!paid && !d.deadlinePassed && (
              <span className="ml-xs">
                <Countdown to={tx.paymentDeadline} prefix="in" />
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-caption text-text-secondary">
        {sampleRecord
          ? 'Sample record: this balance was recorded as paid without a payment report.'
          : 'The buyer pays the seller directly and reports it here; it counts once the seller confirms receiving it. AuctionIT doesn’t collect or check money. The final amount is settled on the weighbridge quantity after lifting.'}
      </p>

      {report && (pending || paid) && (
        <div className="flex flex-col gap-xs rounded-md border border-border p-md">
          <div className="flex flex-wrap items-center justify-between gap-xs">
            <p className="text-label-md text-text-strong">Reported payment</p>
            <PaymentStatusBadge status={report.decision?.decision ?? 'submitted'} />
          </div>
          <SubmissionDetails s={report.submission} />
        </div>
      )}

      {awaiting && d.as === 'buyer' &&
        (pending ? (
          <Waiting>Reported. Waiting for the seller to confirm receiving it — you’ll be notified.</Waiting>
        ) : (
          <div className="flex flex-col gap-md">
            {report?.decision?.decision === 'rejected' && (
              <Banner tone="danger" title="The seller couldn’t match your last report">
                “{report.decision.reason}” Check the details and report the payment again.
              </Banner>
            )}
            <PaymentInstructions amount={d.balanceDue} payee={d.paymentInstructions} deadline={`Pay by ${when(tx.paymentDeadline)}.`} />
            <PaymentForm
              formId="balance-form"
              amount={d.balanceDue}
              onSubmit={async (payment) => {
                const ok = await run({ type: 'submit_balance_payment', payment }, { success: 'Balance payment reported. The seller has been asked to confirm it.' });
                return ok ? null : { kind: 'rule', code: 'not_saved', what: 'The payment wasn’t reported.', next: 'See the message above and try again.' };
              }}
            />
            <div>
              <Button variant={primary ? 'primary' : 'secondary'} type="submit" form="balance-form">
                Report balance payment
              </Button>
            </div>
          </div>
        ))}
      {awaiting && d.as === 'seller' &&
        (pending ? (
          <div className="flex flex-wrap gap-xs">
            <Button
              variant={primary ? 'primary' : 'secondary'}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await run({ type: 'confirm_balance_payment' }, { success: 'Receipt confirmed. The buyer can now propose a lifting date.' });
                setBusy(false);
              }}
            >
              Confirm receipt of {formatINR(report.submission.amount)}
            </Button>
            <Button variant="ghost" onClick={() => setRejectOpen(true)} disabled={busy}>
              Not received
            </Button>
          </div>
        ) : (
          <Waiting>Waiting for the buyer to pay {formatINR(d.balanceDue)} and report it by {when(tx.paymentDeadline)}. Check your account when they do.</Waiting>
        ))}
      {awaiting && d.as === 'ops' &&
        (pending ? (
          <Waiting>The buyer reported a payment; the seller hasn’t confirmed it yet. A default can’t be marked meanwhile.</Waiting>
        ) : d.deadlinePassed ? (
          <Banner tone="warning" title="Payment deadline has passed" action={<Button onClick={() => setDefaultOpen(true)}>Mark as defaulted</Button>}>
            The buyer didn’t pay by {when(tx.paymentDeadline)}. Under the provisional policy the EMD of {formatINR(tx.emdAmount)} is forfeited to the seller if marked defaulted.
          </Banner>
        ) : (
          <Waiting>The buyer has until {when(tx.paymentDeadline)} to pay. Operations can mark a default only after that (provisional policy).</Waiting>
        ))}
      <PaymentHistory events={d.paymentHistory} people={d.people} />

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        dismissible={!busy}
        title="Reject the reported payment?"
        description="The buyer sees your reason and can correct the details or pay again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await run({ type: 'reject_balance_payment', reason: rejectReason }, { success: 'Payment report rejected. The buyer has been told why.' });
                setBusy(false);
                if (ok) setRejectOpen(false);
              }}
            >
              Reject payment
            </Button>
          </>
        }
      >
        <Field label="What doesn’t match?" required helper="For example: “No credit with this UTR” or “Only ₹5,00,000 received”.">
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Field>
      </Dialog>
      <Dialog
        open={defaultOpen}
        onClose={() => setDefaultOpen(false)}
        dismissible={!busy}
        title="Mark this transaction as defaulted?"
        description="The buyer missed the payment deadline. This ends the transaction, forfeits the EMD to the seller (provisional policy) and notifies both parties."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDefaultOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await run({ type: 'mark_defaulted', reason }, { success: `${tx.id} marked defaulted.` });
                setBusy(false);
                if (ok) setDefaultOpen(false);
              }}
            >
              Mark defaulted
            </Button>
          </>
        }
      >
        <Field label="Reason (recorded in the audit trail)" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Balance not paid within 72 hours of winning." />
        </Field>
      </Dialog>
    </Panel>
  );
}

// ── 2. Lifting arrangement ───────────────────────────────────────────────────

export function LiftingPanel({ d, run, primary }: { d: TxDetailView; run: RunAction; primary: boolean }) {
  const { tx } = d;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [vehicle, setVehicle] = useState(tx.liftingVehicle ?? '');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const scheduled = tx.liftingConfirmedAt !== null;
  const showForm = d.as === 'buyer' && (tx.status === 'balance_paid' || (tx.status === 'lifting_proposed' && editing));
  if (tx.status === 'won_awaiting_balance') return null;

  async function propose() {
    setBusy(true);
    const ok = await run(
      { type: 'propose_lifting', at: new Date(`${date}T10:00:00+05:30`).toISOString(), vehicle },
      { success: 'Lifting date proposed. The seller will confirm it.' },
    );
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <Panel title="Lifting arrangement" done={scheduled}>
      {tx.liftingProposedFor && !showForm && (
        <p className="text-body-md text-text">
          {scheduled ? 'Confirmed' : 'Proposed'}: <strong>{new Date(tx.liftingProposedFor).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</strong> · vehicle{' '}
          <strong>{tx.liftingVehicle}</strong> · {d.lot.location.yard}
        </p>
      )}
      {showForm && (
        <form
          className="grid gap-md sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void propose();
          }}
        >
          <Field label="Lifting date" required>
            <Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Vehicle number" required>
            <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="MH 04 GP 8812" />
          </Field>
          <Button type="submit" variant={primary ? 'primary' : 'secondary'} loading={busy}>
            Propose lifting date
          </Button>
        </form>
      )}
      {tx.status === 'balance_paid' && d.as !== 'buyer' && <Waiting>Waiting for the buyer to propose a lifting date.</Waiting>}
      {tx.status === 'lifting_proposed' && d.as === 'seller' && (
        <div>
          <Button variant={primary ? 'primary' : 'secondary'} onClick={() => setConfirm(true)}>
            Confirm lifting date
          </Button>
        </div>
      )}
      {tx.status === 'lifting_proposed' && d.as === 'buyer' && !editing && (
        <div className="flex flex-wrap items-center gap-sm">
          <Waiting>Waiting for the seller to confirm.</Waiting>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Change date
          </Button>
        </div>
      )}
      {tx.status === 'lifting_proposed' && d.as === 'ops' && <Waiting>Waiting for the seller to confirm the proposed date.</Waiting>}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title="Confirm the lifting date?"
        consequence={`The buyer’s vehicle ${tx.liftingVehicle ?? ''} will be expected at ${d.lot.location.yard} on ${tx.liftingProposedFor ? new Date(tx.liftingProposedFor).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}.`}
        confirmLabel="Confirm lifting date"
        onConfirm={async () => {
          setBusy(true);
          const ok = await run({ type: 'confirm_lifting' }, { success: 'Lifting date confirmed. The buyer has been notified.' });
          setBusy(false);
          if (ok) setConfirm(false);
        }}
      />
    </Panel>
  );
}

// ── 3A. Weighbridge measurement ──────────────────────────────────────────────

export function WeighbridgeCard({ d, run, primary }: { d: TxDetailView; run: RunAction; primary: boolean }) {
  const { tx, lot } = d;
  const wb = tx.weighbridge;
  const [form, setForm] = useState({ weighbridge: `${lot.location.city} certified weighbridge`, ticketRef: '', gross: '', tare: '', measured: '' });
  const [files, setFiles] = useState<LotMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const canRecord = !wb && d.as === 'buyer' && tx.status === 'lifting_scheduled';
  const gross = parseFloat(form.gross);
  const tare = parseFloat(form.tare);
  const net = Number.isFinite(gross) && Number.isFinite(tare) ? Math.round((gross - tare) * 100) / 100 : null;
  const measured = form.measured ? parseFloat(form.measured) : (net ?? NaN);

  return (
    <Panel
      title="Quantity — weighbridge measurement"
      icon={<Scale className="size-5 text-primary" aria-hidden />}
      done={!!wb}
      aside={wb ? <TrustBadge tier="confirmed" /> : undefined}
    >
      {wb ? (
        <>
          <dl className="grid gap-sm text-body-md sm:grid-cols-3">
            <div>
              <dt className="text-caption text-text-secondary">Weighbridge</dt>
              <dd className="text-text-strong">{wb.weighbridge}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Ticket reference</dt>
              <dd className="font-medium text-text-strong">{wb.ticketRef}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Measured at</dt>
              <dd className="text-text-strong">{when(wb.measuredAt)}</dd>
            </div>
            {wb.grossMt !== null && (
              <div>
                <dt className="text-caption text-text-secondary">Gross / tare</dt>
                <dd className="text-text">
                  {formatMt(wb.grossMt)} / {formatMt(wb.tareMt ?? 0)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-caption text-text-secondary">Net measured</dt>
              <dd className="text-price-md text-text-strong">{formatMt(wb.measuredMt)}</dd>
            </div>
            {d.ticket && (
              <div>
                <dt className="text-caption text-text-secondary">Ticket file</dt>
                <dd className="text-text">{d.ticket.caption}</dd>
              </div>
            )}
          </dl>
          {d.quantity && (
            <p className="flex flex-wrap items-center gap-xs rounded-md bg-primary-container px-md py-sm text-body-md text-on-primary-container">
              Estimated {formatMt(tx.estimatedQtyMt, { estimate: true })} → measured <strong>{formatMt(wb.measuredMt)}</strong> (
              {((wb.measuredMt / tx.estimatedQtyMt - 1) * 100).toFixed(1)}%).
              {d.quantity.within !== null && (
                <StatusBadge kind={d.quantity.within ? 'success' : 'danger'}>
                  {d.quantity.within ? 'Within' : 'Outside'} ±{d.quantity.limit}% quantity tolerance
                </StatusBadge>
              )}
            </p>
          )}
        </>
      ) : canRecord ? (
        <form
          className="flex flex-col gap-md"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await run(
              {
                type: 'record_weighbridge',
                ticketRef: form.ticketRef,
                weighbridge: form.weighbridge,
                grossMt: Number.isFinite(gross) ? gross : null,
                tareMt: Number.isFinite(tare) ? tare : null,
                measuredMt: Number.isFinite(measured) ? measured : 0,
                ticketMediaId: files[0]?.id ?? null,
              },
              { media: files, success: 'Weighbridge measurement recorded. Payable is now based on the measured quantity.' },
            );
            setBusy(false);
          }}
        >
          <p className="text-body-md text-text-secondary">Record the ticket from the mutually agreed certified weighbridge. You’ll pay for this measured quantity.</p>
          <div className="grid gap-md sm:grid-cols-2">
            <Field label="Weighbridge" required>
              <Input value={form.weighbridge} onChange={(e) => setForm({ ...form, weighbridge: e.target.value })} />
            </Field>
            <Field label="Ticket reference" required>
              <Input value={form.ticketRef} onChange={(e) => setForm({ ...form, ticketRef: e.target.value })} placeholder="WB-2025-10429" />
            </Field>
            <Field label="Gross weight (MT)" helper="Truck + material">
              <Input inputMode="decimal" value={form.gross} onChange={(e) => setForm({ ...form, gross: e.target.value })} />
            </Field>
            <Field label="Tare weight (MT)" helper="Empty truck">
              <Input inputMode="decimal" value={form.tare} onChange={(e) => setForm({ ...form, tare: e.target.value })} />
            </Field>
            <Field label="Net measured quantity (MT)" helper={net !== null ? `Gross − tare = ${net} MT` : 'Enter it directly, or gross and tare.'} required>
              <Input inputMode="decimal" value={form.measured} placeholder={net !== null ? String(net) : ''} onChange={(e) => setForm({ ...form, measured: e.target.value })} />
            </Field>
          </div>
          <EvidenceUploader label="Weighbridge ticket" helper="A photo or scan of the ticket." stage="lifting" kinds={['photo', 'document']} value={files} onChange={setFiles} min={1} category={lot.category} />
          <div>
            <Button type="submit" variant={primary ? 'primary' : 'secondary'} loading={busy}>
              Record measurement
            </Button>
          </div>
        </form>
      ) : (
        <Waiting>{tx.status === 'lifting_scheduled' ? 'The buyer records the weighbridge ticket at lifting.' : 'Recorded once lifting is scheduled.'}</Waiting>
      )}
    </Panel>
  );
}

// ── 3B. Visual condition check ───────────────────────────────────────────────

export function ConditionCard({ d, run, primary }: { d: TxDetailView; run: RunAction; primary: boolean }) {
  const { tx, lot, policy } = d;
  const c = tx.condition;
  const [observed, setObserved] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<LotMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const limit = policy.tolerance?.contaminationCeilingPct ?? null;
  const value = parseFloat(observed);
  const canRecord = !c && d.as === 'buyer' && tx.status === 'lifting_scheduled';
  const verdict = (v: number) =>
    limit === null ? null : v <= limit ? (
      <StatusBadge kind="success">Within tolerance (≤ {formatPct(limit)})</StatusBadge>
    ) : (
      <StatusBadge kind="danger">Outside tolerance — {formatPct(v - limit)} over the {formatPct(limit)} limit</StatusBadge>
    );

  return (
    <Panel title="Condition — visual check" icon={<ScanEye className="size-5 text-primary" aria-hidden />} done={!!c} aside={c ? <TrustBadge tier="confirmed" /> : undefined}>
      <div className="grid gap-md md:grid-cols-2">
        <div className="flex flex-col gap-xs rounded-md bg-surface-muted p-md">
          <div className="flex items-center justify-between gap-xs">
            <p className="text-label-md text-text-strong">Seller declaration</p>
            <TrustBadge tier="declared" />
          </div>
          <p className="text-body-md">
            {lot.grade}; contamination up to {formatPct(lot.declaration.contaminationPct ?? 0)}.
          </p>
          {limit !== null && (
            <p className="flex flex-wrap items-center gap-xs text-caption text-text-secondary">
              Agreed tolerance: up to {formatPct(limit)} <DemoPolicyCaption />
            </p>
          )}
          <ul className="mt-xs grid grid-cols-3 gap-xs" aria-label="Listing reference photos">
            {d.listingPhotos.slice(0, 3).map((m) => (
              <li key={m.id}>
                <LotImage src={m.url} alt={m.caption} category={lot.category} ratio="1/1" sizes="100px" className="rounded-sm" />
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-sm">
          {c ? (
            <>
              <p className="text-caption text-text-secondary">Observed at lifting · {when(c.checkedAt)}</p>
              <p className="text-price-md text-text-strong">{formatPct(c.observedContaminationPct)} contamination</p>
              {verdict(c.observedContaminationPct)}
              {c.notes && <p className="text-body-md text-text">“{c.notes}”</p>}
              <ul className="grid grid-cols-3 gap-xs" aria-label="Lifting photos">
                {d.liftingPhotos.map((m) => (
                  <li key={m.id}>
                    <LotImage src={m.url || null} alt={m.caption} category={lot.category} ratio="1/1" sizes="100px" className="rounded-sm" />
                    <span className="block truncate text-caption text-text-secondary">{m.caption}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : canRecord ? (
            <form
              className="flex flex-col gap-md"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                await run(
                  { type: 'record_condition', observedContaminationPct: Number.isFinite(value) ? value : NaN, notes, photoMediaIds: files.map((f) => f.id) },
                  { media: files, success: 'Condition check recorded.' },
                );
                setBusy(false);
              }}
            >
              <Field label="Observed contamination (%)" helper="Your estimate from inspecting the material as it’s loaded." required>
                <Input inputMode="decimal" value={observed} onChange={(e) => setObserved(e.target.value)} />
              </Field>
              {Number.isFinite(value) && verdict(value)}
              <Field label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you saw, where in the pile." />
              </Field>
              <EvidenceUploader label="Timestamped lifting photos" stage="lifting" kinds={['photo']} value={files} onChange={setFiles} min={1} category={lot.category} />
              <div>
                <Button type="submit" variant={primary ? 'primary' : 'secondary'} loading={busy}>
                  Record condition check
                </Button>
              </div>
            </form>
          ) : (
            <Waiting>{tx.status === 'lifting_scheduled' ? 'The buyer records the visual check at lifting.' : 'Recorded at lifting.'}</Waiting>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export function Reconciliation({ d }: { d: TxDetailView }) {
  const r = d.reconciliation;
  if (!r || !d.tx.weighbridge) return null;
  return (
    <Panel title="Financial reconciliation">
      <p className="text-body-md">
        <span className="font-medium text-text-strong">
          {formatMt(d.tx.weighbridge.measuredMt)} × {formatINR(d.tx.pricePerMt, { perMt: true })} = {formatINR(r.payable)}
        </span>
        {r.adjustment > 0 && <> − {formatINR(r.adjustment)} assurance adjustment</>}
      </p>
      <p className="text-body-md text-text-secondary">
        Paid so far {formatINR(r.paid)} (EMD + balance).{' '}
        {d.tx.resolution === 'exit_refund' ? (
          <strong className="text-success">Buyer exited: {formatINR(d.remedies.exitRefund)} to be returned by the seller.</strong>
        ) : r.difference < 0 ? (
          <strong className="text-success">Refund due to the buyer: {formatINR(-r.difference)}.</strong>
        ) : r.difference > 0 ? (
          <strong className="text-warning">The buyer owes {formatINR(r.difference)} more.</strong>
        ) : (
          'Nothing further to settle.'
        )}
      </p>
    </Panel>
  );
}

// ── Decision after checks ────────────────────────────────────────────────────

export function CompletePanel({ d, run }: { d: TxDetailView; run: RunAction }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (d.tx.status !== 'material_checked') return null;
  const outside = d.contamination?.within === false || d.quantity?.within === false;
  if (d.as !== 'buyer') return <Waiting>Material checked. Waiting for the buyer to complete the transaction or raise a claim.</Waiting>;
  const claimHref = `/transactions/${d.tx.id}/claim`;
  return (
    <Panel title="Complete or raise a claim">
      {outside ? (
        <Banner tone="warning" title="The lifting check is outside the agreed tolerance">
          You can raise a Lot Assurance claim before loading is complete, or accept the material and complete.
        </Banner>
      ) : (
        <p className="text-body-md text-text">The measurement and condition check are recorded{d.assured ? ' and within tolerance' : ''}. Completing finalises billing on the measured quantity.</p>
      )}
      <div className="flex flex-wrap gap-sm">
        {outside && d.assured ? (
          <>
            <ButtonLink href={claimHref} variant="primary">
              Raise assurance claim
            </ButtonLink>
            <Button onClick={() => setConfirm(true)}>Complete anyway</Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={() => setConfirm(true)}>
              Complete transaction
            </Button>
            {d.assured && <ButtonLink href={claimHref}>Raise assurance claim</ButtonLink>}
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title="Complete this transaction?"
        consequence={`Billing is finalised at ${formatMt(d.tx.weighbridge?.measuredMt ?? 0)} — ${formatINR(d.reconciliation?.payable ?? 0)}. Loading is marked complete, which closes the claim window.`}
        confirmLabel="Complete transaction"
        onConfirm={async () => {
          setBusy(true);
          const ok = await run({ type: 'complete' }, { success: 'Transaction completed.' });
          setBusy(false);
          if (ok) setConfirm(false);
        }}
      />
    </Panel>
  );
}

// ── Final states ─────────────────────────────────────────────────────────────

export function FinalPanel({ d }: { d: TxDetailView }) {
  const { tx } = d;
  if (tx.status === 'defaulted') {
    return (
      <Banner tone="danger" title="This transaction defaulted">
        The balance wasn’t paid by the deadline. The EMD of {formatINR(tx.emdAmount)} was {d.emdStatus === 'forfeited' ? 'forfeited' : 'handled'} under the provisional policy.
      </Banner>
    );
  }
  if (tx.status !== 'completed' && tx.status !== 'resolved') return null;
  const title =
    tx.resolution === 'exit_refund'
      ? 'Resolved: buyer exited with a refund'
      : tx.resolution === 'price_adjustment'
        ? 'Completed with a Lot Assurance price adjustment'
        : tx.resolution === 'claim_rejected'
          ? 'Completed on the original terms (claim rejected)'
          : 'Transaction completed';
  return (
    <section aria-label="Outcome" className="flex flex-col gap-sm rounded-lg border border-success/30 bg-success-container p-lg">
      <p className="flex items-center gap-xs text-h3 text-success">
        <CircleCheck className="size-5" aria-hidden />
        {title}
      </p>
      <dl className="grid gap-sm text-body-md sm:grid-cols-3">
        <div>
          <dt className="text-caption text-text-secondary">Final quantity</dt>
          <dd className="text-price-md text-text-strong">{formatMt(tx.finalQtyMt ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Final value</dt>
          <dd className="text-price-md text-text-strong">{formatINR(tx.finalPayable ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Closed on</dt>
          <dd className="text-text-strong">{when(tx.completedAt)}</dd>
        </div>
      </dl>
      <p className="text-body-md">
        <Link href={d.as === 'ops' ? '/ops' : d.as === 'buyer' ? '/buyer/dashboard' : '/seller/dashboard'} className="font-medium text-primary underline">
          Back to {d.as === 'ops' ? 'Operations' : 'your dashboard'}
        </Link>{' '}
        — the history lists this transaction.
      </p>
    </section>
  );
}

// ── Refunds (arranged outside AuctionIT, recorded by the seller) ────────────

export function RefundPanel({ d, run, onChanged }: { d: TxDetailView; run: RunAction; onChanged: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [amount, setAmount] = useState(String(d.refundDue || ''));
  const [refundedOn, setRefundedOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [emdError, setEmdError] = useState<string | null>(null);
  const emdDue = d.emd?.status === 'refund_due';
  if (d.refundDue <= 0 && d.refunds.length === 0 && !emdDue && d.emd?.status !== 'refunded') return null;
  const seller = d.as === 'seller';

  return (
    <Panel title="Refunds" done={d.refundDue === 0 && !emdDue}>
      <p className="text-body-md text-text-secondary">
        Refunds are made by the seller outside AuctionIT and recorded here with the bank reference, so both sides see the same record.
      </p>
      {d.refundDue > 0 && <Banner tone="warning" title={`${formatINR(d.refundDue)} is owed back to the buyer`}>{seller ? 'Record the refund once you have made it.' : 'The seller records the refund here once made.'}</Banner>}
      {emdDue && (
        <Banner
          tone="warning"
          title={`The EMD of ${formatINR(d.tx.emdAmount)} is owed back to the buyer`}
          action={
            seller && d.emd ? (
              <Button
                loading={busy}
                onClick={async () => {
                  if (!d.emd) return;
                  setBusy(true);
                  setEmdError(null);
                  const r = await ds.recordEmdRefund(d.emd.id, { amount: d.emd.amount, refundedOn, reference, note }, viewer);
                  setBusy(false);
                  if (r.ok) onChanged();
                  else setEmdError(`${r.error.what} ${r.error.next}`);
                }}
              >
                Record EMD refund
              </Button>
            ) : undefined
          }
        >
          {seller ? 'Fill in the date and bank reference below, then record it.' : 'The seller records the refund here once made.'}
          {emdError && <span className="mt-xs block text-danger">{emdError}</span>}
        </Banner>
      )}
      {d.emd?.refund && <p className="text-body-md text-text">EMD refund recorded: {formatINR(d.emd.refund.amount)} on {d.emd.refund.refundedOn}, ref {d.emd.refund.reference}.</p>}
      {d.refunds.length > 0 && (
        <ul className="flex flex-col gap-1 text-body-md">
          {d.refunds.map((r, i) => (
            <li key={i}>
              Refund recorded: {formatINR(r.amount)} on {r.refundedOn}, ref {r.reference}
              {r.note ? ` — ${r.note}` : ''}
            </li>
          ))}
        </ul>
      )}
      {seller && (d.refundDue > 0 || emdDue) && (
        <div className="grid gap-md sm:grid-cols-2">
          {d.refundDue > 0 && (
            <Field label="Amount refunded (₹)" required>
              <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
          )}
          <Field label="Date refunded" required>
            <Input type="date" value={refundedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setRefundedOn(e.target.value)} />
          </Field>
          <Field label="Bank reference (UTR)" required>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {d.refundDue > 0 && (
            <div>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await run({ type: 'record_refund', refund: { amount: Number(amount), refundedOn, reference, note } }, { success: 'Refund recorded. The buyer has been notified.' });
                  setBusy(false);
                }}
              >
                Record refund
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
