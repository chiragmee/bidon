'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Lock, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { LotDetailView } from '@auctionit/domain';
import { formatINR } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { AssuranceSummary, EvidenceList, Gallery, QuantityBasis, SellerCard, Specs } from '@/components/lot/LotSections';
import { Banner, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, LotAssuranceBadge, RetryIcon, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';

const STEP_NAME = ['', 'Basic details', 'Quantity and condition', 'Evidence', 'Auction and assurance'];
const when = (iso: string) => (iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not set');

function AuctionCard({ d }: { d: LotDetailView }) {
  const l = d.lot;
  return (
    <Card className="flex flex-col gap-sm p-lg">
      <p className="text-overline uppercase text-text-secondary">{l.reserveVisible ? 'Reserve price' : 'Reserve (hidden from buyers)'}</p>
      <p className="text-price-xl text-text-strong">
        {l.reservePerMt ? formatINR(l.reservePerMt) : '—'}
        <span className="text-body-lg font-normal text-text-secondary">/MT</span>
      </p>
      <dl className="flex flex-col gap-xs border-t border-border pt-sm text-body-md">
        {(
          [
            ['Bidding opens', when(l.startAt)],
            ['Bidding closes', when(l.endAt)],
            ['First bid at least', l.reservePerMt ? formatINR(l.reservePerMt + l.bidIncrement, { perMt: true }) : '—'],
            ['EMD per bidder', l.emdAmount ? formatINR(l.emdAmount) : '—'],
            ['Estimated value', l.reservePerMt && l.estimatedQtyMt ? formatINR(l.reservePerMt * l.estimatedQtyMt, { estimate: true }) : '—'],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-sm">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="text-right text-text-strong">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-text-secondary">Buyers see a bid button here once bidding opens.</p>
    </Card>
  );
}

/** /seller/lots/[id]/preview — the listing as buyers will see it, with what still blocks publishing (§13). */
export function ListingPreview({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer, session } = useSession();
  const toast = useToast();
  const router = useRouter();
  const lot = useQuery(`preview:${id}:${session.userId}`, (s) => s.getLot(id, viewer), { keepPrevious: true });
  const rules = useQuery(`preview-rules:${id}:${session.userId}`, (s) => s.sellerLot(id, viewer), { keepPrevious: true });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured once per visit: decides whether the confirm says "opens now" or gives the date.
  const [mountedAt] = useState(() => Date.now());

  if ((lot.error && !lot.data) || (rules.error && !rules.data)) {
    return (
      <Container>
        <ErrorState what="We couldn’t load the preview." next="Try again." action={<Button onClick={() => (lot.reload(), rules.reload())} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (lot.data === undefined || rules.data === undefined) {
    return (
      <Container>
        <Skeleton className="h-[480px]" />
      </Container>
    );
  }
  const d = lot.data;
  const r = rules.data;
  if (!d || !r) {
    return (
      <Container>
        <EmptyState icon={Lock} title="Preview not available" headingLevel={1} action={<ButtonLink href="/seller/lots">Back to my lots</ButtonLink>}>
          This lot doesn’t exist or belongs to another seller.
        </EmptyState>
      </Container>
    );
  }
  if (d.status !== 'draft') {
    return (
      <Container>
        <Banner tone="info" title="Already published" action={<ButtonLink href={`/seller/lots/${id}`}>View the lot</ButtonLink>}>
          {d.lot.title} is published. Buyers see it at /auctions/{id}.
        </Banner>
      </Container>
    );
  }
  const ready = r.blockers.length === 0;
  const opensNow = Date.parse(d.lot.startAt) <= mountedAt;

  return (
    <Container className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm rounded-lg border border-dashed border-primary bg-primary-container p-md md:flex-row md:items-center md:justify-between">
        <p className="flex items-center gap-xs text-label-md text-on-primary-container">
          <Eye className="size-5" aria-hidden />
          Preview — this is how buyers will see your lot.
        </p>
        <div className="flex flex-wrap gap-xs">
          <ButtonLink href={`/seller/lots/${id}/edit`}>Edit lot</ButtonLink>
          <Button variant="primary" disabled={!ready} disabledReason={ready ? undefined : 'Fix the items below to publish.'} onClick={() => setConfirm(true)}>
            Publish auction
          </Button>
        </div>
      </div>

      {error && <Banner tone="danger" title="Not published">{error}</Banner>}
      {!ready && (
        <Banner tone="warning" title={`${r.blockers.length} thing${r.blockers.length === 1 ? '' : 's'} to fix before publishing`}>
          <ul className="mt-1 flex flex-col gap-1">
            {r.blockers.map((b) => (
              <li key={b.field}>
                {b.message}{' '}
                <Link href={`/seller/lots/${id}/edit?step=${b.step}`} className="font-medium text-primary underline">
                  Fix in {STEP_NAME[b.step]}
                </Link>
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <header className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          <StatusBadge kind="draft">Draft preview</StatusBadge>
          {d.lot.assurance.enabled && <LotAssuranceBadge />}
        </div>
        <h1 className="text-h1 text-text-strong">{d.lot.title || 'Untitled lot'}</h1>
        <p className="flex flex-wrap items-center gap-x-sm text-body-md text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {[d.lot.location.yard, d.lot.location.city, d.lot.location.state].filter(Boolean).join(', ')}
          </span>
          <span>Seller: {d.seller.name}</span>
        </p>
      </header>

      <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-xl">
          <Gallery d={d} />
          <div className="lg:hidden">
            <AuctionCard d={d} />
          </div>
          <Specs d={d} />
          <QuantityBasis d={d} />
          <AssuranceSummary d={d} />
          <SellerCard d={d} />
          <EvidenceList d={d} />
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-[88px]">
            <AuctionCard d={d} />
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title="Publish this auction?"
        consequence={`${d.lot.title} becomes visible to buyers. ${opensNow ? 'Bidding opens immediately' : `Bidding opens ${when(d.lot.startAt)}`} and closes ${when(d.lot.endAt)}. Once bidding opens the listing can’t be edited.`}
        confirmLabel="Publish auction"
        onConfirm={async () => {
          setBusy(true);
          const res = await ds.publishLot(id, viewer);
          setBusy(false);
          setConfirm(false);
          if (!res.ok) {
            setError(`${res.error.what} ${res.error.next}`);
            rules.reload();
            return;
          }
          toast.show(`${id} published.`, 'success');
          router.push(`/seller/lots/${id}?published=1`);
        }}
      />
    </Container>
  );
}

