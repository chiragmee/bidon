'use client';

import { useState } from 'react';
import { formatINR, PAYMENT_METHODS, type PaymentInput, type PaymentMethod } from '@auctionit/domain';
import { Banner, Field, Input, Select } from '@/components/ui';
import { useData, type DsError } from '@/data';
import { useSession } from '@/lib/SessionProvider';

export interface PayeeDetails {
  payee: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string | null;
}

/** Where to pay — the seller's bank details from their reviewed application. */
export function PaymentInstructions({ amount, payee, deadline }: { amount: number; payee: PayeeDetails | null; deadline?: string }) {
  return (
    <div className="flex flex-col gap-xs rounded-md bg-surface-muted p-md text-body-md">
      <p className="text-overline uppercase text-text-secondary">Amount to pay</p>
      <p className="text-price-md text-text-strong">{formatINR(amount)}</p>
      {payee ? (
        <dl className="mt-xs grid grid-cols-[auto_1fr] gap-x-md gap-y-1">
          <dt className="text-text-secondary">Pay to</dt>
          <dd className="text-text">{payee.payee}</dd>
          <dt className="text-text-secondary">Bank</dt>
          <dd className="text-text">{payee.bankName}</dd>
          <dt className="text-text-secondary">Account</dt>
          <dd className="tabular-nums text-text">{payee.accountNumber}</dd>
          <dt className="text-text-secondary">IFSC</dt>
          <dd className="text-text">{payee.ifsc}</dd>
          {payee.upiId && (
            <>
              <dt className="text-text-secondary">UPI</dt>
              <dd className="text-text">{payee.upiId}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-text-secondary">The seller’s bank details aren’t on file. Contact AuctionIT support for payment instructions.</p>
      )}
      <p className="text-caption text-text-secondary">
        Accepted: {PAYMENT_METHODS.map((m) => m.label).join(', ')}. Pay from your business account.{deadline ? ` ${deadline}` : ''}
      </p>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Report a payment made outside AuctionIT. Nothing is charged here: the receiving seller checks their account and
 * confirms or rejects the report. Used for the EMD and the winning balance.
 */
export function PaymentForm({
  amount,
  formId,
  onSubmit,
}: {
  amount: number;
  formId: string;
  /** Returns the refusal to show, or null on success. */
  onSubmit: (input: PaymentInput) => Promise<DsError | null>;
}) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [method, setMethod] = useState<PaymentMethod>('neft');
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [receipt, setReceipt] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<DsError | null>(null);
  const label = PAYMENT_METHODS.find((m) => m.id === method)?.referenceLabel ?? 'Reference';

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    const r = await ds.uploadDocument(file, 'payment_receipt', viewer);
    setUploading(false);
    if (r.ok) setReceipt({ id: r.data.id, name: r.data.fileName });
    else setError(r.error);
  }

  return (
    <form
      id={formId}
      className="flex flex-col gap-md"
      onSubmit={async (e) => {
        e.preventDefault();
        if (uploading) return;
        setError(null);
        const err = await onSubmit({ amount, method, paidOn, reference, payerName, receiptDocumentId: receipt?.id ?? null });
        if (err) setError(err);
      }}
    >
      <div className="grid gap-md sm:grid-cols-2">
        <Field label="Paid by" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date paid" required>
          <Input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label={label} required helper="The seller matches this against their bank statement.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Paid from (account name)" required>
          <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} autoComplete="organization" />
        </Field>
      </div>
      <Field label="Receipt or bank confirmation" helper={receipt ? `Attached: ${receipt.name}` : 'Optional. PDF or image, up to 10 MB. Only you and the seller can open it.'}>
        <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
      </Field>
      <p className="text-caption text-text-secondary">
        AuctionIT doesn’t collect or check payments. Reporting it here tells the seller to look for it; it counts only once they confirm receiving it.
      </p>
      {error && (
        <Banner tone="danger" title={error.what}>
          {error.next}
        </Banner>
      )}
    </form>
  );
}
