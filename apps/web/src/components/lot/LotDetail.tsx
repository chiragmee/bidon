'use client';

import Link from 'next/link';
import { ChevronRight, MapPin, PackageSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deriveAuctionStatus, formatINR } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { AuctionStatusBadge, Banner, Button, ButtonLink, ConfirmDialog, EmptyState, ErrorState, LotAssuranceBadge, RetryIcon, SampleDataCaption, Skeleton, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';
import { BidDialog } from './BidDialog';
import { BidPanel, MobileBidBar } from './BidPanel';
import { EmdDialog } from './EmdDialog';
import { AssuranceSummary, BidHistory, EvidenceList, Gallery, QuantityBasis, SellerCard, Specs } from './LotSections';
import { DEMO_CONTROLS } from '@/lib/flags';

function LoadingLot() {
  return (
    <Container>
      <div role="status" aria-label="Loading lot" className="grid gap-lg lg:grid-cols-[1fr_384px]">
        <div className="flex flex-col gap-md">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </Container>
  );
}

export function LotDetail({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer, session } = useSession();
  const toast = useToast();
  // Refresh every 5s so the current bid stays live (PHASES 3.5); other tabs push changes instantly.
  const q = useQuery(`lot:${id}:${session.userId}`, (s) => s.getLot(id, viewer), { pollMs: 5000, keepPrevious: true });
  const [emdOpen, setEmdOpen] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  // New key per opening = a fresh bid attempt (new request id, cleared errors).
  const [bidAttempt, setBidAttempt] = useState(0);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'danger'; title: string; body: string } | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState
          what="We couldn’t load this lot."
          meaning="Your bids and deposits are unchanged."
          next="Check your connection and try again."
          action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>}
        />
      </Container>
    );
  }
  if (q.data === undefined) return <LoadingLot />;
  const d = q.data;
  if (d === null) {
    return (
      <Container>
        <EmptyState icon={PackageSearch} title="Lot not found" headingLevel={1} action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
          There’s no published lot with ID {id}. It may have been a draft, or the link may be wrong.
        </EmptyState>
      </Container>
    );
  }

  const status = deriveAuctionStatus(d.lot, new Date().toISOString()) === 'ended' ? 'ended' : d.status;
  const openBid = () => {
    setBidAttempt((n) => n + 1);
    setBidOpen(true);
  };
  const openEmd = () => setEmdOpen(true);

  const opsClose =
    DEMO_CONTROLS && viewer.role === 'ops' && d.status === 'live' ? (
      <Button variant="demo" fullWidth onClick={() => setCloseOpen(true)}>
        Close demo auction now
      </Button>
    ) : null;

  return (
    <Container className="pb-32 lg:pb-lg">
      <nav aria-label="Breadcrumb" className="mb-sm flex flex-wrap items-center gap-1 text-caption text-text-secondary">
        <Link href="/auctions" className="hover:text-primary hover:underline">
          Auctions
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span>{d.policy.label}</span>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page">{d.lot.id}</span>
      </nav>

      <header className="mb-lg flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          <AuctionStatusBadge status={status} />
          {d.lot.assurance.enabled && <LotAssuranceBadge />}
          {d.seller.sample && <SampleDataCaption label="Sample listing" />}
        </div>
        <h1 className="text-h1 text-text-strong">{d.lot.title}</h1>
        <p className="flex flex-wrap items-center gap-x-sm gap-y-1 text-body-md text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {d.lot.location.yard}, {d.lot.location.city}, {d.lot.location.state}
          </span>
          <span className="hidden sm:inline" aria-hidden>·</span>
          <span>{d.lot.id}</span>
          <span className="hidden sm:inline" aria-hidden>·</span>
          <span>Seller: {d.seller.name}</span>
        </p>
      </header>

      <div ref={outcomeRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {outcome && (
          <Banner tone={outcome.tone} title={outcome.title} className="mb-lg">
            {outcome.body}
          </Banner>
        )}
      </div>

      <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-xl">
          <Gallery d={d} />
          {/* Mobile: price and status inline; the action lives in the sticky bottom bar. */}
          <div className="lg:hidden">
            <BidPanel d={d} onPayEmd={openEmd} onBid={openBid} extra={opsClose} showAction={false} />
          </div>
          <Specs d={d} />
          <QuantityBasis d={d} />
          <AssuranceSummary d={d} />
          <SellerCard d={d} />
          <EvidenceList d={d} />
          <BidHistory d={d} />
        </div>
        <aside aria-label="Bidding" className="hidden lg:block">
          <div className="sticky top-[88px]">
            <BidPanel d={d} onPayEmd={openEmd} onBid={openBid} extra={opsClose} />
          </div>
        </aside>
      </div>

      <MobileBidBar d={d} onPayEmd={openEmd} onBid={openBid} />

      <EmdDialog
        d={d}
        open={emdOpen}
        onClose={() => {
          setEmdOpen(false);
          q.reload();
        }}
        onSubmitted={q.reload}
      />
      <BidDialog
        key={bidAttempt}
        d={d}
        open={bidOpen}
        onClose={() => setBidOpen(false)}
        refresh={q.reload}
        onPlaced={(amount) => {
          setBidOpen(false);
          q.reload();
          toast.show(`Bid placed at ${formatINR(amount, { perMt: true })}.`, 'success');
          setOutcome({ tone: 'success', title: `Bid placed: ${formatINR(amount, { perMt: true })}`, body: 'You’re the highest bidder. We’ll notify you here if someone outbids you.' });
        }}
      />
      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        busy={closing}
        tone="demo"
        title="Close this demo auction now?"
        consequence="Ends bidding immediately. The winner is the highest stored bid that meets the reserve; if none does, the lot is unsold. This is a demo control for Operations, not a seller ability."
        confirmLabel="Close auction"
        onConfirm={async () => {
          setClosing(true);
          const r = await ds.closeDemoAuction(d.lot.id, viewer);
          setClosing(false);
          setCloseOpen(false);
          q.reload();
          if (r.ok) {
            setOutcome(
              r.data.transactionId
                ? { tone: 'success', title: 'Auction closed — reserve met', body: `Transaction ${r.data.transactionId} has started for the winning bidder.` }
                : { tone: 'success', title: 'Auction closed — unsold', body: 'No bid met the reserve, so the lot closed unsold.' },
            );
          } else {
            setOutcome({ tone: 'danger', title: r.error.what, body: r.error.next });
          }
        }}
      />
    </Container>
  );
}
