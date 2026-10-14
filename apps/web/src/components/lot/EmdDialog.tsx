'use client';

import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import type { LotDetailView } from '@auctionit/domain';
import { formatINR, formatMt } from '@auctionit/domain';
import { Banner, Button, Dialog } from '@/components/ui';
import { useData, type DsError } from '@/data';
import { useSession } from '@/lib/SessionProvider';

type Phase = 'choose' | 'success' | 'failed';

/**
 * Simulated EMD (SPEC §10.1): explains the deposit, makes clear nothing is charged, and lets the
 * presenter show both success and failure. Success hands straight over to the bid dialog.
 */
export function EmdDialog({ d, open, onClose, onPaid }: { d: LotDetailView; open: boolean; onClose: () => void; onPaid: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [phase, setPhase] = useState<Phase>('choose');
  const [busy, setBusy] = useState<'success' | 'failure' | null>(null);
  const [error, setError] = useState<DsError | null>(null);
  const [reference, setReference] = useState('');

  const close = () => {
    onClose();
    setTimeout(() => (setPhase('choose'), setError(null)), 200);
  };

  async function pay(outcome: 'success' | 'failure') {
    setBusy(outcome);
    setError(null);
    const r = await ds.payEmd(d.lot.id, outcome, viewer);
    setBusy(null);
    if (r.ok) {
      setReference(r.data.reference);
      setPhase('success');
    } else if (r.error.code === 'payment_failed') {
      setPhase('failed');
    } else if (r.error.code === 'already_paid') {
      onPaid();
    } else {
      setError(r.error);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!busy}
      title={phase === 'success' ? 'EMD recorded' : phase === 'failed' ? 'Payment failed' : 'Pay EMD to start bidding'}
      description={phase === 'choose' ? `${d.lot.title} · ${formatMt(d.lot.estimatedQtyMt, { estimate: true })} · ${d.lot.id}` : undefined}
      footer={
        phase === 'success' ? (
          <Button variant="primary" onClick={onPaid}>
            Continue to bid
          </Button>
        ) : phase === 'failed' ? (
          <>
            <Button variant="ghost" onClick={close}>
              Not now
            </Button>
            <Button variant="primary" onClick={() => setPhase('choose')}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <Button variant="demo" onClick={() => pay('failure')} loading={busy === 'failure'} disabled={!!busy}>
              Simulate a failed payment
            </Button>
            <Button variant="primary" onClick={() => pay('success')} loading={busy === 'success'} disabled={!!busy}>
              Pay {formatINR(d.lot.emdAmount)} (simulated)
            </Button>
          </>
        )
      }
    >
      {phase === 'choose' && (
        <div className="flex flex-col gap-md text-body-md">
          <div className="rounded-md bg-surface-muted p-md">
            <p className="text-overline uppercase text-text-secondary">EMD for this lot</p>
            <p className="text-price-md text-text-strong">{formatINR(d.lot.emdAmount)}</p>
          </div>
          <p className="text-text">
            An earnest money deposit shows you’re a serious bidder. It’s needed once per lot before you can bid. If you don’t win, it’s
            refunded; if you win, it counts towards the price.
          </p>
          <p className="text-caption text-text-secondary">
            Refund and forfeiture rules here are demo policy (for example, forfeiture if a winner doesn’t pay by the deadline), not approved AuctionIT terms.
          </p>
          <Banner tone="info">Demo payment — no real money will be charged.</Banner>
          {error && (
            <Banner tone="danger" title={error.what}>
              {error.next}
            </Banner>
          )}
        </div>
      )}
      {phase === 'success' && (
        <div className="flex flex-col items-start gap-sm text-body-md" aria-live="polite">
          <p className="flex items-center gap-xs text-success">
            <CircleCheck className="size-5" aria-hidden />
            {formatINR(d.lot.emdAmount)} EMD recorded (simulated)
          </p>
          <p className="text-text-secondary">Reference {reference}. No real money moved. You can now place a bid on this lot.</p>
        </div>
      )}
      {phase === 'failed' && (
        <Banner tone="danger" title="The simulated payment failed.">
          Nothing was charged and no EMD was recorded, so you can’t bid yet. Try the payment again.
        </Banner>
      )}
    </Dialog>
  );
}
