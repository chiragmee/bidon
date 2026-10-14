'use client';

import { Camera, FileText, MapPin, Scale, ShieldCheck, Store, Video } from 'lucide-react';
import { useState } from 'react';
import type { LotDetailView } from '@auctionit/domain';
import { formatINR, formatMt, formatPct } from '@auctionit/domain';
import { Card, DemoPolicyCaption, LotImage, SampleDataCaption, StatusBadge, TrustBadge, type TrustTier } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DEMO_IMAGES } from '@/lib/demoImages';

export function Section({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-sm', className)}>
      <h2 id={id} className="text-h3 text-text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Gallery({ d }: { d: LotDetailView }) {
  const [i, setI] = useState(0);
  const photos = d.photos;
  const current = photos[i];
  return (
    <div className="flex flex-col gap-xs">
      <LotImage src={current?.url ?? null} alt={current?.caption ?? d.lot.title} category={d.lot.category} ratio="4/3" priority sizes="(max-width: 1024px) 100vw, 800px">
        {current && (
          <span className="absolute bottom-xs left-xs rounded-sm bg-text-strong/75 px-1.5 py-0.5 text-caption text-on-primary">
            {current.caption} · {i + 1}/{photos.length}
          </span>
        )}
      </LotImage>
      {photos.length + d.videos.length > 1 && (
        <ul className="flex gap-xs overflow-x-auto pb-1" aria-label="Lot photos and video">
          {photos.map((p, n) => (
            <li key={p.id} className="w-24 shrink-0">
              <button
                type="button"
                onClick={() => setI(n)}
                aria-label={`Show photo ${n + 1}: ${p.caption}`}
                aria-pressed={n === i}
                className={cn('block w-full overflow-hidden rounded-md border-2', n === i ? 'border-primary' : 'border-transparent')}
              >
                <LotImage src={p.url} alt="" category={d.lot.category} ratio="4/3" sizes="96px" className="rounded-sm" />
              </button>
            </li>
          ))}
          {d.videos.map((v) => (
            <li key={v.id} className="w-24 shrink-0">
              <div className="grid aspect-[4/3] place-items-center rounded-md bg-surface-muted text-center text-caption text-text-secondary" title={v.caption}>
                <span className="flex flex-col items-center gap-0.5">
                  <Video className="size-5" aria-hidden />
                  {DEMO_IMAGES.has(v.url) ? 'Video' : 'Video (demo file)'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Specs({ d }: { d: LotDetailView }) {
  const { lot, policy } = d;
  const rows: [string, React.ReactNode][] = [
    ['Category', policy.label],
    ['Grade / type', lot.grade],
    ...policy.attributeFields.filter((f) => lot.attributes[f.key]).map((f) => [f.label, lot.attributes[f.key]] as [string, string]),
    ['Estimated quantity', formatMt(lot.estimatedQtyMt, { estimate: true })],
    ...(policy.hasContamination && lot.declaration.contaminationPct !== null
      ? [['Contamination (seller estimate)', `Up to ${formatPct(lot.declaration.contaminationPct)}`] as [string, string]]
      : []),
    ['Yard', `${lot.location.yard}, ${lot.location.city}, ${lot.location.state}`],
    ['Lot ID', lot.id],
  ];
  return (
    <Section id="specs-h" title="Material specifications">
      <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-md py-sm sm:grid-cols-[220px_1fr]">
            <dt className="text-body-md text-text-secondary">{k}</dt>
            <dd className="text-body-md text-text-strong">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body-md text-text">{lot.description}</p>
    </Section>
  );
}

export function QuantityBasis({ d }: { d: LotDetailView }) {
  return (
    <Section id="qty-h" title="Quantity and how it is measured">
      <Card className="flex gap-sm">
        <Scale className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="text-body-md">
          <p className="text-text-strong">
            Estimated {formatMt(d.lot.estimatedQtyMt, { estimate: true })} · you pay for the measured quantity
          </p>
          <p className="mt-1 text-text-secondary">
            {d.lot.measurementBasis} Payable amount = measured MT × your winning price per MT. The estimate is used only to
            calculate the balance before lifting; any difference is settled after weighing.
          </p>
        </div>
      </Card>
    </Section>
  );
}

function Row({ title, children, tier, policy }: { title: string; children: React.ReactNode; tier?: TrustTier; policy?: boolean }) {
  return (
    <div className="grid gap-xs px-lg py-md sm:grid-cols-[1fr_auto] sm:gap-md">
      <div>
        <p className="text-label-md text-text-strong">{title}</p>
        <div className="mt-0.5 text-body-md text-text">{children}</div>
      </div>
      <div className="flex items-start sm:justify-end">{tier ? <TrustBadge tier={tier} /> : policy ? <DemoPolicyCaption /> : null}</div>
    </div>
  );
}

/** The six questions of SPEC §8.2, each tagged with its trust tier or "Demo policy". */
export function AssuranceSummary({ d }: { d: LotDetailView }) {
  const { lot, policy } = d;
  if (!lot.assurance.enabled || !policy.tolerance) {
    return (
      <Section id="la-h" title="Listing type">
        <Card className="text-body-md">
          <p className="text-text-strong">Standard listing</p>
          <p className="mt-1 text-text-secondary">
            This lot is sold on the seller’s description and photos. Lot Assurance tolerances and remedies don’t apply to it.
            Quantity is still measured at lifting and you pay for the measured weight.
          </p>
        </Card>
      </Section>
    );
  }
  const declared = lot.declaration.contaminationPct;
  const req = policy.evidence;
  return (
    <section aria-labelledby="la-h" className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-start gap-sm bg-primary-container px-lg py-md">
        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 id="la-h" className="text-h3 text-on-primary-container">
            Lot Assurance
          </h2>
          <p className="text-body-md text-on-primary-container">
            What the seller declared, what backs it, how it’s checked at lifting, and what happens if it differs.
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        <Row title="What the seller declared" tier="declared">
          {lot.grade}; {formatMt(lot.estimatedQtyMt, { estimate: true })}
          {declared !== null && <>; contamination up to {formatPct(declared)}</>}.
        </Row>
        <Row title="Evidence attached" tier="evidence">
          {d.photos.length} yard photo{d.photos.length === 1 ? '' : 's'}
          {d.videos.length > 0 && ` and ${d.videos.length} walkthrough video`}. Files were attached by the seller; their location data has not been checked.
          {req && <span className="block text-caption text-text-secondary">Proposed pilot requirement: at least {req.minPhotos} photos and {req.minVideos} video.</span>}
        </Row>
        <Row title="Checked at lifting" tier="confirmed">
          Net weight at the mutually agreed certified weighbridge, and contamination checked visually during loading. These are two
          separate checks, recorded when the material is lifted.
        </Row>
        <Row title="Agreed tolerance" policy>
          Contamination up to {formatPct(policy.tolerance.contaminationCeilingPct)}
          {declared !== null && <> (seller declared up to {formatPct(declared)})</>}. Measured quantity within ±{policy.tolerance.quantityVariancePct}% of the estimate.
        </Row>
        <Row title="If the lot is outside tolerance" policy>
          You can ask for a price adjustment for the excess, or exit the deal with your EMD and any balance refunded (simulated in this demo).
        </Row>
        <Row title="How to claim" policy>
          Raise a claim with at least {policy.claimEvidenceMin} files (lifting photos or the weighbridge ticket) before loading is complete. The
          seller responds first; AuctionIT Operations decides only if the seller disputes it.
        </Row>
      </div>
      <p className="bg-canvas px-lg py-sm text-caption text-text-secondary">
        Claims are not automatic: they need evidence and must meet the conditions above. AuctionIT handles exceptions — it does not inspect every lot.
      </p>
    </section>
  );
}

export function SellerCard({ d }: { d: LotDetailView }) {
  const r = d.trackRecord;
  return (
    <Section id="seller-h" title="Seller">
      <Card className="flex flex-col gap-sm">
        <div className="flex items-start gap-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted text-primary">
            <Store className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-label-md text-text-strong">{d.seller.name}</p>
            <p className="flex items-center gap-1 text-caption text-text-secondary">
              <MapPin className="size-3.5" aria-hidden />
              {d.seller.city}, {d.seller.state}
            </p>
          </div>
          <SampleDataCaption className="ml-auto shrink-0" />
        </div>
        <div className="flex flex-wrap gap-xs">
          <StatusBadge kind="neutral">{d.seller.verification === 'demo_approved' ? 'Demo-approved (sample status)' : 'Pending'}</StatusBadge>
          {r.hasHistory ? <StatusBadge kind="reserve_met">{d.trackRecordText}</StatusBadge> : <StatusBadge kind="neutral">New seller</StatusBadge>}
        </div>
        <p className="text-caption text-text-secondary">
          {r.hasHistory
            ? 'Track record counts completed sales and resolved Lot Assurance claims on AuctionIT, updated after every completion.'
            : 'This seller has fewer than 3 completed sales, so there isn’t a track record to show yet.'}
        </p>
      </Card>
    </Section>
  );
}

export function EvidenceList({ d }: { d: LotDetailView }) {
  const items = [...d.photos, ...d.videos, ...d.documents];
  return (
    <Section id="evidence-h" title="Supporting evidence">
      {items.length === 0 ? (
        <p className="text-body-md text-text-secondary">The seller hasn’t attached evidence for this lot.</p>
      ) : (
        <ul className="grid gap-xs sm:grid-cols-2">
          {items.map((m) => {
            const Icon = m.kind === 'video' ? Video : m.kind === 'document' ? FileText : Camera;
            return (
              <li key={m.id} className="flex items-center gap-xs rounded-md border border-border bg-surface px-sm py-xs">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-body-md">{m.caption}</span>
                <span className="shrink-0 text-caption text-text-secondary">{new Date(m.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </li>
            );
          })}
        </ul>
      )}
      {d.lot.assurance.enabled && <TrustBadge tier="evidence" className="self-start" />}
    </Section>
  );
}

export function BidHistory({ d }: { d: LotDetailView }) {
  return (
    <Section id="history-h" title={`Bid history (${d.bidCount})`}>
      {d.bids.length === 0 ? (
        <p className="text-body-md text-text-secondary">No bids yet. The first bid must be at least {formatINR(d.minNextBidPerMt, { perMt: true })}.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-body-md">
            <thead className="bg-surface-muted text-overline uppercase text-on-trust-declared">
              <tr>
                <th scope="col" className="h-10 px-md text-left">Bidder</th>
                <th scope="col" className="px-md text-right">Bid</th>
                <th scope="col" className="px-md text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {d.bids.map((b, n) => (
                <tr key={b.id} className={cn('h-12 border-t border-border', b.mine && 'bg-primary-container/60')}>
                  <td className="px-md">
                    {b.label}
                    {n === 0 && <span className="ml-xs text-caption text-success">Highest</span>}
                  </td>
                  <td className="px-md text-right font-medium text-text-strong">{formatINR(b.amountPerMt, { perMt: true })}</td>
                  <td className="px-md text-right text-text-secondary">
                    {new Date(b.placedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-caption text-text-secondary">Other bidders are shown anonymously.</p>
    </Section>
  );
}
