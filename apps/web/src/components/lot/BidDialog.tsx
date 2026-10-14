'use client';

import { useRef, useState } from 'react';
import type { LotDetailView } from '@auctionit/domain';
import { formatINR, formatMt } from '@auctionit/domain';
import { Banner, Button, Countdown, Dialog, Field, MoneyInput } from '@/components/ui';
import { useData, type DsError } from '@/data';
import { useSession } from '@/lib/SessionProvider';

function newRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random()}`;
}

/**
 * Focused bid form (SPEC §10.2): current bid, minimum, quick amounts, a confirm step, a
 * double-submit guard (one request id per attempt, button locked while sending) and stale-bid
 * recovery — on "outbid" the lot refreshes and the new minimum is offered.
 */
export function BidDialog({
  d,
  open,
  onClose,
  onPlaced,
  refresh,
}: {
  d: LotDetailView;
  open: boolean;
  onClose: () => void;
  onPlaced: (amountPerMt: number) => void;
  refresh: () => void;
}) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  // 'min' follows the live minimum (and moves up after an outbid) until the buyer types an amount.
  const [entered, setEntered] = useState<number | null | 'min'>('min');
  const amount = entered === 'min' ? d.minNextBidPerMt : entered;
  const [error, setError] = useState<DsError | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const requestId = useRef(newRequestId());
  // The highest bid the buyer was looking at when they reviewed — lets the server spot stale bids.
  const seen = useRef<number | null>(null);

  const min = d.minNextBidPerMt;
  const inc = d.lot.bidIncrement;
  const chips = [min, min + inc * 2, min + inc * 5];
  const estimate = amount ? amount * d.lot.estimatedQtyMt : null;

  function review() {
    if (amount === null || amount <= 0) return setFieldError('Enter your bid per MT in rupees.');
    if (amount < min) return setFieldError(`Bid ${formatINR(min, { perMt: true })} or more.`);
    setFieldError(null);
    seen.current = d.highestBidPerMt;
    setStep('confirm');
  }

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    const r = await ds.placeBid({ lotId: d.lot.id, amountPerMt: amount, clientRequestId: requestId.current, seenHighestPerMt: seen.current }, viewer);
    setSending(false);
    if (r.ok) {
      onPlaced(r.data.amountPerMt);
      return;
    }
    if (r.error.kind === 'network') {
      // Same request id on retry, so a request that did land can't be placed twice.
      setError(r.error);
      return;
    }
    if (r.error.code === 'duplicate') {
      onPlaced(amount ?? 0);
      return;
    }
    // Rule rejection: nothing was placed. Refresh the lot and start a new attempt.
    setError(r.error);
    setStep('enter');
    setEntered('min');
    requestId.current = newRequestId();
    refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!sending}
      size="form"
      title={step === 'enter' ? 'Place your bid' : 'Confirm your bid'}
      description={`${d.lot.title} · ${d.lot.id}`}
      footer={
        step === 'enter' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={review}>
              Review bid
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('enter')} disabled={sending}>
              Back
            </Button>
            <Button variant="primary" onClick={submit} loading={sending}>
              {sending ? 'Placing bid…' : 'Confirm bid'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-md text-body-md">
        {error && (
          <Banner tone={error.code === 'outbid' ? 'warning' : 'danger'} title={error.what}>
            {error.next}
          </Banner>
        )}

        <dl className="grid grid-cols-2 gap-sm rounded-md bg-surface-muted p-md">
          <div>
            <dt className="text-overline uppercase text-text-secondary">Current highest bid</dt>
            <dd className="text-price-md text-text-strong">{d.highestBidPerMt !== null ? formatINR(d.highestBidPerMt, { perMt: true }) : 'No bids yet'}</dd>
          </div>
          <div>
            <dt className="text-overline uppercase text-text-secondary">Minimum next bid</dt>
            <dd className="text-price-md text-text-strong">{formatINR(min, { perMt: true })}</dd>
          </div>
          <div className="col-span-2">
            <Countdown to={d.lot.endAt} />
          </div>
        </dl>

        {step === 'enter' ? (
          <>
            <Field label="Your bid per MT" helper={`Minimum ${formatINR(min, { perMt: true })} · increments of ${formatINR(inc)}`} error={fieldError} required>
              <MoneyInput
                value={amount}
                onChange={(v) => {
                  setEntered(v);
                  setFieldError(null);
                }}
                perMt
                showFormatted={false}
              />
            </Field>
            <div className="flex flex-wrap gap-xs" role="group" aria-label="Quick amounts">
              {chips.map((c, n) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEntered(c)}
                  aria-pressed={amount === c}
                  className={
                    'h-8 rounded-full border px-sm text-caption ' +
                    (amount === c ? 'border-primary bg-primary-container text-primary' : 'border-border bg-surface text-text hover:bg-surface-muted')
                  }
                >
                  {n === 0 ? 'Minimum ' : `+${formatINR(c - min)} · `}
                  {formatINR(c, { perMt: true })}
                </button>
              ))}
            </div>
            {estimate !== null && (
              <p className="text-caption text-text-secondary">
                Estimated total {formatINR(estimate, { estimate: true })} on {formatMt(d.lot.estimatedQtyMt, { estimate: true })}. You’ll pay for the measured quantity.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-sm">
            <p className="text-h3 text-text-strong">{formatINR(amount ?? 0, { perMt: true })}</p>
            <p>
              On {formatMt(d.lot.estimatedQtyMt, { estimate: true })} that is about <strong>{formatINR(estimate ?? 0, { estimate: true })}</strong>. The
              final amount uses the weighbridge quantity at lifting.
            </p>
            <p className="text-text-secondary">A placed bid can’t be withdrawn. If you win, the balance is due within 72 hours (demo policy).</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
