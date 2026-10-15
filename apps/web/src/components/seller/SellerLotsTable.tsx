'use client';

import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';
import type { SellerLotRow, SellerTab } from '@auctionit/domain';
import { formatINR } from '@auctionit/domain';
import { AuctionStatusBadge, ButtonLink, Countdown, EmptyState, LotAssuranceBadge, LotImage } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS: { id: SellerTab; label: string; empty: string }[] = [
  { id: 'drafts', label: 'Drafts', empty: 'No drafts. Lots you start but don’t publish are saved here.' },
  { id: 'scheduled', label: 'Scheduled', empty: 'No lots waiting to open.' },
  { id: 'live', label: 'Live', empty: 'No auctions are live right now.' },
  { id: 'closed', label: 'Closed', empty: 'No closed auctions yet.' },
];

function Timing({ r }: { r: SellerLotRow }) {
  if (r.status === 'draft') return <span className="text-caption text-text-secondary">{r.blockers ? `${r.blockers} item${r.blockers === 1 ? '' : 's'} to finish` : 'Ready to publish'}</span>;
  if (r.status === 'scheduled') return <Countdown to={r.startAt} prefix="Opens in" />;
  if (r.status === 'live') return <Countdown to={r.endAt} />;
  return <span className="text-caption text-text-secondary">Closed {new Date(r.endAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>;
}

function Result({ r }: { r: SellerLotRow }) {
  if (r.status === 'draft') return <Link href={`/seller/lots/${r.id}/edit`} className="text-label-md text-primary underline">Continue editing</Link>;
  if (r.transactionId) return <Link href={`/transactions/${r.transactionId}`} className="text-label-md text-primary underline">{r.transactionId}</Link>;
  if (r.status === 'closed_unsold') return <span className="text-caption text-text-secondary">Unsold</span>;
  return <Link href={`/seller/lots/${r.id}`} className="text-label-md text-primary underline">View</Link>;
}

/** Your lots in Drafts / Scheduled / Live / Closed tabs, every row linking to a real record (§12.2). */
export function SellerLotsTable({ lots, initialTab }: { lots: SellerLotRow[]; initialTab?: SellerTab }) {
  const counts = Object.fromEntries(TABS.map((t) => [t.id, lots.filter((l) => l.tab === t.id).length])) as Record<SellerTab, number>;
  const [tab, setTab] = useState<SellerTab>(initialTab ?? (counts.live ? 'live' : counts.drafts ? 'drafts' : 'closed'));
  const rows = lots.filter((l) => l.tab === tab);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]!;

  return (
    <div className="flex flex-col gap-sm">
      <div role="tablist" aria-label="Lots by status" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="lots-panel"
            onClick={() => setTab(t.id)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-sm py-xs text-label-md', tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text')}
          >
            {t.label} <span className="ml-0.5 rounded-full bg-surface-muted px-1.5 text-caption text-text-secondary">{counts[t.id]}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="lots-panel" aria-labelledby={`tab-${tab}`}>
        {rows.length === 0 ? (
          <EmptyState icon={FilePlus2} title={`No ${current.label.toLowerCase()} lots`} action={<ButtonLink href="/seller/lots/new">Create auction</ButtonLink>}>
            {current.empty}
          </EmptyState>
        ) : (
          <>
            <div tabIndex={0} role="region" aria-label="Your lots" className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
              <table className="w-full text-body-md">
                <thead className="bg-surface-muted text-overline uppercase text-on-trust-declared">
                  <tr>
                    <th scope="col" className="h-10 px-md text-left">Lot</th>
                    <th scope="col" className="px-md text-left">Status</th>
                    <th scope="col" className="px-md text-right">Current bid</th>
                    <th scope="col" className="px-md text-right">Bids</th>
                    <th scope="col" className="px-md text-left">Timing</th>
                    <th scope="col" className="px-md text-right">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="h-14 border-t border-border hover:bg-canvas">
                      <td className="px-md py-xs">
                        <div className="flex items-center gap-sm">
                          <LotImage src={r.imageUrl} alt="" category={r.category} ratio="1/1" sizes="40px" className="w-10 shrink-0 rounded-sm" />
                          <span className="min-w-0">
                            <Link href={`/seller/lots/${r.id}`} className="block truncate text-text-strong hover:text-primary hover:underline">
                              {r.title}
                            </Link>
                            <span className="text-caption text-text-secondary">
                              {r.id}
                              {r.yard && ` · ${r.yard}`}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-md">
                        <div className="flex flex-wrap gap-1">
                          <AuctionStatusBadge status={r.status} />
                          {r.assured && <LotAssuranceBadge />}
                        </div>
                      </td>
                      <td className="px-md text-right">
                        {r.highestBidPerMt !== null ? formatINR(r.highestBidPerMt, { perMt: true }) : '—'}
                        {r.reservePerMt > 0 && <span className="block text-caption text-text-secondary">reserve {formatINR(r.reservePerMt, { perMt: true })}</span>}
                      </td>
                      <td className="px-md text-right">
                        {r.bidCount}
                        {r.bidderCount > 0 && <span className="block text-caption text-text-secondary">{r.bidderCount} bidders</span>}
                      </td>
                      <td className="px-md">
                        <Timing r={r} />
                      </td>
                      <td className="px-md text-right">
                        <Result r={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-sm md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-xs rounded-lg border border-border bg-surface p-md">
                  <div className="flex items-start justify-between gap-xs">
                    <Link href={`/seller/lots/${r.id}`} className="text-label-md text-text-strong hover:underline">
                      {r.title}
                    </Link>
                    <AuctionStatusBadge status={r.status} />
                  </div>
                  <p className="text-caption text-text-secondary">
                    {r.id} · {r.bidCount} bids{r.highestBidPerMt !== null ? ` · highest ${formatINR(r.highestBidPerMt, { perMt: true })}` : ''}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-xs">
                    <Timing r={r} />
                    <Result r={r} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
