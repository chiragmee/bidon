'use client';

import { useState } from 'react';
import { formatINR, PAYMENT_METHODS, type PaymentDecision, type PaymentEvent, type PaymentSubmission, type RefundRecord } from '@auctionit/domain';
import { Button, StatusBadge } from '@/components/ui';
import { useData } from '@/data';
import { useSession } from '@/lib/SessionProvider';

const method = (m: string) => PAYMENT_METHODS.find((x) => x.id === m)?.label ?? m;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Opens a private receipt through a short-lived link (only the payer and the receiving seller may). */
export function ReceiptLink({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-xs">
      <Button
        variant="ghost"
        onClick={async () => {
          setMsg(null);
          const r = await ds.documentUrl(id, viewer);
          if (!r.ok) setMsg(r.error.what);
          else if (r.data.url) window.open(r.data.url, '_blank', 'noopener');
          else setMsg('The file isn’t stored on this device.');
        }}
      >
        Open receipt
      </Button>
      {msg && <span className="text-caption text-text-secondary">{msg}</span>}
    </span>
  );
}

export function SubmissionDetails({ s }: { s: PaymentSubmission }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-1 text-body-md">
      <dt className="text-text-secondary">Amount</dt>
      <dd className="tabular-nums text-text">{formatINR(s.amount)}</dd>
      <dt className="text-text-secondary">Paid by</dt>
      <dd className="text-text">
        {method(s.method)} on {new Date(s.paidOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </dd>
      <dt className="text-text-secondary">Reference</dt>
      <dd className="text-text">{s.reference}</dd>
      <dt className="text-text-secondary">From</dt>
      <dd className="text-text">{s.payerName}</dd>
      {s.receiptDocumentId && (
        <>
          <dt className="text-text-secondary">Receipt</dt>
          <dd>
            <ReceiptLink id={s.receiptDocumentId} />
          </dd>
        </>
      )}
    </dl>
  );
}

/** Status words that never claim Bid ON moved or verified money. */
export function PaymentStatusBadge({ status }: { status: 'submitted' | 'confirmed' | 'rejected' | 'refund_due' | 'refunded' | 'forfeited' }) {
  const map = {
    submitted: ['warning', 'Reported — awaiting seller'],
    confirmed: ['success', 'Receipt confirmed by seller'],
    rejected: ['danger', 'Not confirmed by seller'],
    refund_due: ['warning', 'Refund due from seller'],
    refunded: ['neutral', 'Refund recorded by seller'],
    forfeited: ['danger', 'Forfeited'],
  } as const;
  const [kind, text] = map[status];
  return <StatusBadge kind={kind}>{text}</StatusBadge>;
}

/** The shared history: who reported, confirmed, rejected or refunded, and when. */
export function PaymentHistory({ events, people }: { events: PaymentEvent[]; people?: Record<string, string> }) {
  if (!events.length) return null;
  const who = (id: string) => people?.[id] ?? 'the seller';
  return (
    <ol className="flex flex-col gap-1 text-caption text-text-secondary">
      {events.map((e, i) => (
        <li key={i}>
          {e.type === 'submitted' && `${when(e.submission.submittedAt)} · Reported ${formatINR(e.submission.amount)} by ${method(e.submission.method)}, ref ${e.submission.reference}`}
          {e.type === 'decided' && `${when(e.decision.decidedAt)} · ${decisionText(e.decision)} by ${who(e.decision.decidedBy)}`}
          {e.type === 'refund_recorded' && `${when(e.refund.recordedAt)} · ${refundText(e.refund)} recorded by ${who(e.refund.recordedBy)}`}
        </li>
      ))}
    </ol>
  );
}

const decisionText = (d: PaymentDecision) => (d.decision === 'confirmed' ? 'Receipt confirmed' : `Rejected: “${d.reason}”`);
const refundText = (r: RefundRecord) => `Refund of ${formatINR(r.amount)} on ${r.refundedOn}, ref ${r.reference}`;
