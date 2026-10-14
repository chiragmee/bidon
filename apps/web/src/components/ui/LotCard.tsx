import Link from 'next/link';
import { MapPin, Store } from 'lucide-react';
import type { LotCardData } from '@auctionit/domain';
import { formatINR, formatMt, policyFor } from '@auctionit/domain';
import { AuctionStatusBadge, LotAssuranceBadge } from './Badge';
import { Countdown } from './Countdown';
import { LotImage } from './LotImage';

export type { LotCardData };

/**
 * Catalogue card. The whole card is the link; there is no orange button on it so the page keeps
 * one primary action per viewport (DESIGN.md wins over the Stitch "Bid now" per card — D-029).
 * Standard lots simply lack the shield; they are never marked as risky.
 */
export function LotCard({ lot }: { lot: LotCardData }) {
  const live = lot.status === 'live';
  const upcoming = lot.status === 'scheduled';
  const hasBid = lot.highestBidPerMt !== null;
  const priceLabel = hasBid ? 'Current highest bid' : lot.reservePerMt !== null ? 'Reserve price' : 'Reserve';
  const price = hasBid ? lot.highestBidPerMt : lot.reservePerMt;

  return (
    <Link
      href={lot.href}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow duration-150 hover:shadow-1"
    >
      <LotImage src={lot.imageUrl} alt={lot.title} category={lot.category} className="rounded-none rounded-t-lg">
        <div className="absolute inset-x-xs top-xs flex items-start justify-between gap-xs">
          <AuctionStatusBadge status={lot.status} className="shadow-1" />
          {lot.assured && <LotAssuranceBadge variant="overlay" className="shadow-1" />}
        </div>
        <span className="absolute bottom-xs left-xs rounded-sm bg-text-strong/75 px-1.5 py-0.5 text-caption text-on-primary">{lot.id}</span>
      </LotImage>

      <div className="flex flex-1 flex-col gap-sm p-md">
        <div>
          <p className="text-caption text-text-secondary">
            {policyFor(lot.category).label} · {lot.grade}
          </p>
          <h3 className="mt-0.5 text-h3 text-text-strong group-hover:text-primary">{lot.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-sm gap-y-0.5 text-body-md text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {lot.city}, {lot.state}
            </span>
            <span className="text-text">{formatMt(lot.estimatedQtyMt, { estimate: true })}</span>
          </p>
        </div>

        <div className="flex items-end justify-between gap-sm rounded-md bg-surface-muted px-sm py-xs">
          <div>
            <p className="text-overline uppercase text-text-secondary">{priceLabel}</p>
            <p className="text-price-md text-text-strong">
              {price !== null ? formatINR(price, { perMt: true }) : 'Hidden until close'}
            </p>
          </div>
          <p className="text-caption text-text-secondary">
            {lot.bidCount} {lot.bidCount === 1 ? 'bid' : 'bids'}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-xs">
          {live && <Countdown to={lot.endAt} />}
          {upcoming && <Countdown to={lot.startAt} prefix="Opens in" endedLabel="Opening now" />}
          {!live && !upcoming && <span className="text-caption text-text-secondary">Auction closed</span>}
        </div>
        <p className="flex items-center gap-1 border-t border-border pt-xs text-caption text-text-secondary">
          <Store className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {lot.sellerName} · {lot.trackRecord ?? 'New seller'}
          </span>
        </p>
      </div>
    </Link>
  );
}
