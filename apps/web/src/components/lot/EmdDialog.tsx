'use client';

import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import type { LotDetailView } from '@auctionit/domain';
import { formatMt } from '@auctionit/domain';
import { PaymentForm, PaymentInstructions } from '@/components/payments/PaymentForm';
import { PaymentHistory, PaymentStatusBadge, SubmissionDetails } from '@/components/payments/PaymentRecord';
import { Banner, Button, Dialog } from '@/components/ui';
import { useData } from '@/data';
import { useSession } from '@/lib/SessionProvider';

/**
 * EMD paid outside Bid ON (SPEC §10.1, docs/PHASE1_MVP.md): where to pay, then the buyer reports the payment.
 * It allows bidding only once the lot's seller confirms receiving it. A rejected report shows the seller's reason
 * and can be corrected.
 */
export function EmdDialog({ d, open, onClose, onSubmitted }: { d: LotDetailView; open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [sent, setSent] = useState(false);
  const emd = d.viewer.emd;
  const waiting = emd?.status === 'submitted';
  const close = () => {
    onClose();
    setTimeout(() => setSent(false), 200);
  };
  const closesAt = new Date(d.lot.endAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog
      open={open}
      onClose={close}
      size="form"
      title={sent || waiting ? 'EMD payment reported' : emd?.status === 'rejected' ? 'Correct your EMD payment details' : 'Pay the EMD, then report it'}
      description={`${d.lot.title} · ${formatMt(d.lot.estimatedQtyMt, { estimate: true })} · ${d.lot.id}`}
      footer={
        sent || waiting ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Not now
            </Button>
            <Button variant="primary" type="submit" form="emd-form">
              Report EMD payment
            </Button>
          </>
        )
      }
    >
      {sent || waiting ? (
        <div className="flex flex-col gap-sm text-body-md" aria-live="polite">
          <p className="flex items-center gap-xs text-text">
            <CircleCheck className="size-5 text-success" aria-hidden />
            The seller has been asked to confirm receiving it. You can bid once they do — you’ll be notified.
          </p>
          {emd?.payment && <SubmissionDetails s={emd.payment} />}
          {emd && <PaymentStatusBadge status={emd.status} />}
        </div>
      ) : (
        <div className="flex flex-col gap-md text-body-md">
          {emd?.status === 'rejected' && emd.decision && (
            <Banner tone="danger" title="The seller couldn’t match your last report">
              “{emd.decision.reason}” Check the details below and report the payment again.
            </Banner>
          )}
          <p className="text-text">
            An earnest money deposit shows you’re a serious bidder. It’s needed once per lot. If you don’t win, the seller refunds it and records the
            refund here; if you win, it counts towards the price.
          </p>
          <PaymentInstructions amount={d.lot.emdAmount} payee={d.viewer.paymentInstructions} deadline={`Report it early: the seller must confirm it before bidding closes on ${closesAt}.`} />
          <PaymentForm
            formId="emd-form"
            amount={d.lot.emdAmount}
            onSubmit={async (input) => {
              const r = await ds.submitEmd(d.lot.id, input, viewer);
              if (!r.ok) return r.error;
              setSent(true);
              onSubmitted();
              return null;
            }}
          />
          <p className="text-caption text-text-secondary">
            Refund and forfeiture rules are provisional policy (for example, forfeiture if a winner doesn’t pay by the deadline), not yet approved Bid ON terms.
          </p>
          {emd && emd.history.length > 0 && <PaymentHistory events={emd.history} />}
        </div>
      )}
    </Dialog>
  );
}
