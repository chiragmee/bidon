'use client';

import { CircleCheck, Lock } from 'lucide-react';
import type { LotDetailView } from '@auctionit/domain';
import { formatINR, formatMt } from '@auctionit/domain';
import { Button, ButtonLink, Countdown, StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';

export type BidAction =
  | { kind: 'sign_in'; href: string }
  | { kind: 'pay_emd' }
  | { kind: 'emd_waiting' }
  | { kind: 'eligibility'; message: string }
  | { kind: 'bid' }
  | { kind: 'transaction'; href: string; primary: boolean }
  | { kind: 'none'; message: string };

/** One action per lot state and viewer — never a working bid button on a closed or upcoming lot. */
export function bidAction(d: LotDetailView): BidAction {
  const { status, viewer } = d;
  if (d.result) {
    if (viewer.transactionId) return { kind: 'transaction', href: `/transactions/${viewer.transactionId}`, primary: d.result.wonByViewer };
    return { kind: 'none', message: d.result.outcome === 'unsold' ? 'This auction closed without a bid meeting the reserve.' : 'This auction has closed.' };
  }
  if (status === 'ended') return { kind: 'none', message: 'Bidding has ended. The result is being decided from the stored bids.' };
  if (status !== 'live' && status !== 'scheduled') return { kind: 'none', message: 'This lot isn’t open for bidding.' };
  if (viewer.role === 'guest') return status === 'live' ? { kind: 'sign_in', href: `/sign-in?next=${encodeURIComponent(`/auctions/${d.lot.id}`)}` } : { kind: 'none', message: 'Bidding hasn’t opened yet. You can review the lot now.' };
  if (viewer.isOwnLot) return { kind: 'none', message: 'This is your lot. Sellers can’t bid on their own lots.' };
  if (viewer.role !== 'buyer') return { kind: 'none', message: 'Only buyer accounts can bid. Sign in with a buyer account to bid.' };
  if (!viewer.eligible) {
    const pending = viewer.verification === 'pending_review';
    return { kind: 'eligibility', message: pending ? 'Your account is under review. You can pay the EMD and bid once it’s approved.' : 'Verify your business to pay the EMD and bid.' };
  }
  // The EMD can be paid and reported before bidding opens — offline payments take time to confirm.
  if (!viewer.emdPaid) return viewer.emd?.status === 'submitted' ? { kind: 'emd_waiting' } : { kind: 'pay_emd' };
  if (status === 'scheduled') return { kind: 'none', message: 'Your EMD is confirmed. Bidding hasn’t opened yet.' };
  return { kind: 'bid' };
}

function ActionButton({ a, onPayEmd, onBid, size = 'lg' }: { a: BidAction; onPayEmd: () => void; onBid: () => void; size?: 'md' | 'lg' }) {
  switch (a.kind) {
    case 'sign_in':
      return (
        <ButtonLink href={a.href} variant="primary" size={size} fullWidth>
          Sign in to bid
        </ButtonLink>
      );
    case 'pay_emd':
      return (
        <Button variant="primary" size={size} fullWidth onClick={onPayEmd} icon={<Lock aria-hidden />}>
          Pay EMD to bid
        </Button>
      );
    case 'emd_waiting':
      return (
        <Button size={size} fullWidth onClick={onPayEmd}>
          EMD reported — awaiting seller
        </Button>
      );
    case 'eligibility':
      return (
        <ButtonLink href="/account" variant="primary" size={size} fullWidth>
          Verify your business
        </ButtonLink>
      );
    case 'bid':
      return (
        <Button variant="primary" size={size} fullWidth onClick={onBid}>
          Place bid
        </Button>
      );
    case 'transaction':
      return (
        <ButtonLink href={a.href} variant={a.primary ? 'primary' : 'secondary'} size={size} fullWidth>
          {a.primary ? 'Go to your transaction' : 'View transaction'}
        </ButtonLink>
      );
    default:
      return null;
  }
}

function PriceBlock({ d }: { d: LotDetailView }) {
  const sold = d.result?.outcome === 'sold';
  const label = d.result ? (sold ? 'Winning bid' : 'Highest bid') : d.highestBidPerMt !== null ? 'Current highest bid' : d.lot.reserveVisible ? 'Reserve price' : 'No bids yet';
  const value = d.result ? (d.result.winningBidPerMt ?? d.highestBidPerMt) : (d.highestBidPerMt ?? (d.lot.reserveVisible ? d.lot.reservePerMt : null));
  return (
    <div>
      <p className="text-overline uppercase text-text-secondary">{label}</p>
      <p className="text-price-xl text-text-strong" aria-live="polite">
        {value !== null ? (
          <>
            {formatINR(value)}
            <span className="text-body-lg font-normal text-text-secondary">/MT</span>
          </>
        ) : (
          '—'
        )}
      </p>
      <div className="mt-xs flex flex-wrap items-center gap-xs">
        {d.result ? (
          <StatusBadge kind={sold ? 'reserve_met' : 'unsold'}>{sold ? 'Closed · Reserve met' : 'Unsold'}</StatusBadge>
        ) : d.bidCount > 0 ? (
          d.reserveMet ? <StatusBadge kind="reserve_met">Reserve met</StatusBadge> : <StatusBadge kind="neutral">Reserve not met yet</StatusBadge>
        ) : null}
        {d.status === 'live' && <Countdown to={d.lot.endAt} />}
        {d.status === 'scheduled' && <Countdown to={d.lot.startAt} prefix="Opens in" endedLabel="Opening now" />}
      </div>
    </div>
  );
}

function MyStatus({ d }: { d: LotDetailView }) {
  const s = d.viewer.bidStatus;
  if (s === 'none') return null;
  const map = {
    leading: { kind: 'success', text: 'You’re the highest bidder' },
    outbid: { kind: 'warning', text: 'You’ve been outbid' },
    won: { kind: 'success', text: 'You won this lot' },
    closed_not_won: { kind: 'neutral', text: 'Closed without winning' },
  } as const;
  const m = map[s];
  return (
    <div className="flex items-center justify-between gap-xs">
      <StatusBadge kind={m.kind}>{m.text}</StatusBadge>
      {d.viewer.myHighestPerMt !== null && <span className="text-caption text-text-secondary">Your bid {formatINR(d.viewer.myHighestPerMt, { perMt: true })}</span>}
    </div>
  );
}

/** Sticky 384px panel on desktop (DESIGN.md Bid panel). */
export function BidPanel({
  d,
  onPayEmd,
  onBid,
  extra,
  showAction = true,
}: {
  d: LotDetailView;
  onPayEmd: () => void;
  onBid: () => void;
  extra?: React.ReactNode;
  /** False for the inline mobile copy: the sticky bottom bar holds the action there. */
  showAction?: boolean;
}) {
  const a = bidAction(d);
  const live = d.status === 'live';
  return (
    <div className="flex flex-col gap-md rounded-lg border border-border bg-surface p-lg shadow-1">
      <PriceBlock d={d} />
      <MyStatus d={d} />
      <dl className="flex flex-col gap-xs border-y border-border py-sm text-body-md">
        {(live || d.status === 'scheduled') && (
          <div className="flex justify-between gap-sm">
            <dt className="text-text-secondary">Minimum next bid</dt>
            <dd className="font-medium text-text-strong">{formatINR(d.minNextBidPerMt, { perMt: true })}</dd>
          </div>
        )}
        {d.lot.reserveVisible && d.highestBidPerMt !== null && (
          <div className="flex justify-between gap-sm">
            <dt className="text-text-secondary">Reserve</dt>
            <dd className="text-text">{formatINR(d.lot.reservePerMt, { perMt: true })}</dd>
          </div>
        )}
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">Bids</dt>
          <dd className="text-text">
            {d.bidCount} from {d.bidderCount} bidder{d.bidderCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">EMD</dt>
          <dd className={cn('flex items-center gap-1', d.viewer.emdPaid ? 'text-success' : 'text-text')}>
            {d.viewer.emdPaid && <CircleCheck className="size-4" aria-hidden />}
            {formatINR(d.lot.emdAmount)}{' '}
            {d.viewer.emdPaid
              ? '· confirmed by seller'
              : d.viewer.emd?.status === 'submitted'
                ? '· reported, awaiting seller'
                : d.viewer.role === 'buyer' && !d.result
                  ? '· needed to bid'
                  : ''}
          </dd>
        </div>
      </dl>
      {d.viewer.emd?.status === 'rejected' && !d.result && (
        <p className="text-caption text-warning">The seller couldn’t match your EMD report: “{d.viewer.emd.decision?.reason}”. Correct it and report again.</p>
      )}
      {(d.viewer.emd?.status === 'refund_due' || d.viewer.emd?.status === 'refunded') && (
        <p className="text-caption text-text-secondary">
          {d.viewer.emd.status === 'refund_due'
            ? 'The seller owes your EMD back and records the refund here once made.'
            : `The seller recorded refunding your EMD on ${d.viewer.emd.refund?.refundedOn}, ref ${d.viewer.emd.refund?.reference}.`}
        </p>
      )}
      {a.kind === 'eligibility' && <p className="text-body-md text-text-secondary">{a.message}</p>}
      {a.kind === 'none' ? (
        <p className="text-body-md text-text-secondary">{a.message}</p>
      ) : (
        showAction && <ActionButton a={a} onPayEmd={onPayEmd} onBid={onBid} />
      )}
      {extra}
      {live && (
        <p className="text-caption text-text-secondary">
          At the minimum bid: {formatINR(d.minNextBidPerMt * d.lot.estimatedQtyMt, { estimate: true })} on {formatMt(d.lot.estimatedQtyMt, { estimate: true })}. Final amount
          uses the measured quantity.
        </p>
      )}
    </div>
  );
}

/** Mobile: the bid panel becomes a sticky bottom bar holding the single primary action. */
export function MobileBidBar({ d, onPayEmd, onBid }: { d: LotDetailView; onPayEmd: () => void; onBid: () => void }) {
  const a = bidAction(d);
  if (a.kind === 'none') return null;
  const price = d.highestBidPerMt ?? (d.lot.reserveVisible ? d.lot.reservePerMt : null);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-sm shadow-2 lg:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
      <div className="flex items-center gap-sm">
        <div className="min-w-0">
          <p className="text-caption text-text-secondary">{d.highestBidPerMt !== null ? 'Highest bid' : 'Reserve'}</p>
          <p className="text-price-md text-text-strong">{price !== null ? formatINR(price, { perMt: true }) : '—'}</p>
        </div>
        <div className="ml-auto w-44 shrink-0">
          <ActionButton a={a} onPayEmd={onPayEmd} onBid={onBid} size="md" />
        </div>
      </div>
    </div>
  );
}
