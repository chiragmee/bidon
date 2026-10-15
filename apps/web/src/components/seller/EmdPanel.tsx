'use client';

import { useState } from 'react';
import { formatINR, type EmdView } from '@auctionit/domain';
import { PaymentHistory, PaymentStatusBadge, SubmissionDetails } from '@/components/payments/PaymentRecord';
import { Banner, Button, Card, Dialog, Field, Input, Textarea, useToast } from '@/components/ui';
import { useData } from '@/data';
import { useSession } from '@/lib/SessionProvider';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The seller's side of offline EMDs (docs/PHASE1_MVP.md): check each reported payment against your bank account,
 * confirm or reject it with a reason, and record refunds you make.
 */
export function EmdPanel({ emds, onChanged, title = 'EMD payments' }: { emds: EmdView[]; onChanged: () => void; title?: string }) {
  if (emds.length === 0) return null;
  const order = { submitted: 0, refund_due: 1, rejected: 2, confirmed: 3, refunded: 4, forfeited: 5 } as const;
  return (
    <Card className="flex flex-col gap-md p-lg">
      <div>
        <h2 className="text-h3 text-text-strong">{title}</h2>
        <p className="text-body-md text-text-secondary">
          Buyers pay EMDs into your account and report them here. Check your statement before confirming — a buyer can bid only once you confirm. Bid ON doesn’t see or
          move the money.
        </p>
      </div>
      <ul className="flex flex-col gap-md">
        {[...emds]
          .sort((a, b) => order[a.status] - order[b.status])
          .map((e) => (
            <EmdRow key={e.id} e={e} onChanged={onChanged} />
          ))}
      </ul>
    </Card>
  );
}

function EmdRow({ e, onChanged }: { e: EmdView; onChanged: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState('');
  const [refundedOn, setRefundedOn] = useState(today());
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'confirmed' | 'rejected') {
    setBusy(true);
    setError(null);
    const r = await ds.decideEmd(e.id, { decision, reason }, viewer);
    setBusy(false);
    if (!r.ok) return setError(`${r.error.what} ${r.error.next}`);
    setRejecting(false);
    toast.show(decision === 'confirmed' ? `EMD from ${e.buyer} confirmed.` : `EMD report from ${e.buyer} rejected.`, 'success');
    onChanged();
  }

  async function refund() {
    setBusy(true);
    setError(null);
    const r = await ds.recordEmdRefund(e.id, { amount: e.amount, refundedOn, reference, note: '' }, viewer);
    setBusy(false);
    if (!r.ok) return setError(`${r.error.what} ${r.error.next}`);
    setRefunding(false);
    toast.show(`Refund to ${e.buyer} recorded.`, 'success');
    onChanged();
  }

  return (
    <li className="flex flex-col gap-sm rounded-md border border-border p-md" aria-label={`EMD from ${e.buyer}`}>
      <div className="flex flex-wrap items-center justify-between gap-xs">
        <p className="text-label-md text-text-strong">
          {e.buyer} · {formatINR(e.amount)}
          {e.mode === 'simulated' && <span className="text-caption text-text-secondary"> · sample record</span>}
        </p>
        <PaymentStatusBadge status={e.status} />
      </div>
      {e.payment && <SubmissionDetails s={e.payment} />}
      {e.refund && (
        <p className="text-body-md text-text">
          Refund recorded: {formatINR(e.refund.amount)} on {e.refund.refundedOn}, ref {e.refund.reference}.
        </p>
      )}
      {e.status === 'submitted' && (
        <div className="flex flex-wrap gap-xs">
          <Button variant="primary" loading={busy && !rejecting} onClick={() => void decide('confirmed')}>
            Confirm receipt
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(true)} disabled={busy}>
            Not received
          </Button>
        </div>
      )}
      {e.status === 'refund_due' && (
        <div>
          <Button onClick={() => setRefunding(true)}>Record refund</Button>
        </div>
      )}
      {error && <Banner tone="danger" title={error} />}
      <PaymentHistory events={e.history} />

      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        dismissible={!busy}
        title={`Reject ${e.buyer}’s EMD report?`}
        description="The buyer sees your reason and can correct the details or pay again. They can’t bid until you confirm an EMD."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void decide('rejected')}>
              Reject report
            </Button>
          </>
        }
      >
        <Field label="What doesn’t match?" required helper="For example: “No credit with this UTR”.">
          <Textarea value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      </Dialog>
      <Dialog
        open={refunding}
        onClose={() => setRefunding(false)}
        dismissible={!busy}
        title={`Record the EMD refund to ${e.buyer}`}
        description={`Record it once you have sent ${formatINR(e.amount)} back. The buyer is notified with the reference.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRefunding(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void refund()}>
              Record refund
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <Field label="Date refunded" required>
            <Input type="date" value={refundedOn} max={today()} onChange={(ev) => setRefundedOn(ev.target.value)} />
          </Field>
          <Field label="Bank reference (UTR)" required>
            <Input value={reference} onChange={(ev) => setReference(ev.target.value)} autoComplete="off" />
          </Field>
        </div>
      </Dialog>
    </li>
  );
}
