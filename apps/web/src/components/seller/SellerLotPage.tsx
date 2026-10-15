'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { formatINR, type LotMedia } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { AssuranceSummary, BidHistory, EvidenceList, Specs } from '@/components/lot/LotSections';
import { AuctionStatusBadge, Banner, Button, ButtonLink, Card, ConfirmDialog, Countdown, EmptyState, ErrorState, EvidenceUploader, Field, LotAssuranceBadge, RetryIcon, Skeleton, StatusBadge, Textarea, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';
import { EmdPanel } from './EmdPanel';

const STEP_NAME = ['', 'Basic details', 'Quantity and condition', 'Evidence', 'Auction and assurance'];
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** /seller/lots/[id] — the seller's own lot: bids, result, transaction, evidence and what can still change (§14). */
export function SellerLotPage({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer, session } = useSession();
  const toast = useToast();
  const router = useRouter();
  const published = useSearchParams().get('published') === '1';
  const lot = useQuery(`slot:${id}:${session.userId}`, (s) => s.getLot(id, viewer), { pollMs: 5000 });
  const rules = useQuery(`slot-rules:${id}:${session.userId}`, (s) => s.sellerLot(id, viewer), { pollMs: 5000 });
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  if ((lot.error && !lot.data) || (rules.error && !rules.data)) {
    return (
      <Container>
        <ErrorState what="We couldn’t load this lot." next="Try again." action={<Button onClick={() => (lot.reload(), rules.reload())} icon={<RetryIcon />}>Try again</Button>} />
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
        <EmptyState icon={Lock} title="Lot not available" headingLevel={1} action={<ButtonLink href="/seller/lots">Back to my lots</ButtonLink>}>
          This lot doesn’t exist or belongs to another seller. Sellers can only manage their own lots.
        </EmptyState>
      </Container>
    );
  }
  const l = d.lot;

  return (
    <Container className="flex flex-col gap-lg">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-caption text-text-secondary">
        <Link href="/seller/lots" className="hover:text-primary hover:underline">
          My lots
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page">{l.id}</span>
      </nav>
      <header className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          <AuctionStatusBadge status={d.status} />
          {l.assurance.enabled && <LotAssuranceBadge />}
        </div>
        <h1 className="text-h1 text-text-strong">{l.title || 'Untitled draft'}</h1>
        <p className="text-body-md text-text-secondary">
          {l.id} · {[l.location.yard, l.location.city].filter(Boolean).join(', ')}
          {d.status !== 'draft' && (
            <>
              {' · '}
              <Link href={`/auctions/${l.id}`} className="text-primary underline">
                View as buyers see it
              </Link>
            </>
          )}
        </p>
      </header>

      {published && d.status !== 'draft' && (
        <Banner tone="success" title="Published">
          {d.status === 'live' ? 'Bidding is open now.' : `Buyers can see it now. Bidding opens ${when(l.startAt)}.`} It also appears on your dashboard.
        </Banner>
      )}

      {d.status === 'draft' && !r.eligible && (
        <Banner tone="warning" title="Your account must be approved before you can publish" action={<ButtonLink href="/account">Account and verification</ButtonLink>}>
          You can keep preparing this draft meanwhile.
        </Banner>
      )}

      <EmdPanel
        emds={r.emds}
        onChanged={() => {
          rules.reload();
          lot.reload();
        }}
      />

      {d.status === 'draft' && (
        <Card className="flex flex-col gap-sm p-lg">
          <h2 className="text-h3 text-text-strong">Draft — not visible to buyers</h2>
          {r.blockers.length > 0 ? (
            <ul className="flex flex-col gap-1 text-body-md">
              {r.blockers.map((b) => (
                <li key={b.field}>
                  {b.message}{' '}
                  <Link href={`/seller/lots/${l.id}/edit?step=${b.step}`} className="font-medium text-primary underline">
                    {STEP_NAME[b.step]}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-md text-success">Everything’s filled in. Preview it, then publish.</p>
          )}
          <div className="flex flex-wrap gap-xs">
            <ButtonLink href={`/seller/lots/${l.id}/edit`} variant="primary">
              Continue editing
            </ButtonLink>
            <ButtonLink href={`/seller/lots/${l.id}/preview`}>Preview as buyer</ButtonLink>
            <Button variant="ghost" onClick={() => setDel(true)}>
              Delete draft
            </Button>
          </div>
        </Card>
      )}

      {d.status === 'scheduled' && (
        <Card className="flex flex-col gap-sm p-lg">
          <h2 className="text-h3 text-text-strong">Scheduled</h2>
          <p className="text-body-md">
            Bidding opens {when(l.startAt)} <Countdown to={l.startAt} prefix="· in" /> and closes {when(l.endAt)}.
          </p>
          <p className="text-body-md text-text-secondary">You can edit the listing until bidding opens.</p>
          <div>
            <ButtonLink href={`/seller/lots/${l.id}/edit`}>Edit lot</ButtonLink>
          </div>
        </Card>
      )}

      {(d.status === 'live' || d.status === 'ended') && (
        <Card className="flex flex-col gap-sm p-lg">
          <div className="flex flex-wrap items-end justify-between gap-sm">
            <div>
              <p className="text-overline uppercase text-text-secondary">Current highest bid</p>
              <p className="text-price-xl text-text-strong">{d.highestBidPerMt !== null ? formatINR(d.highestBidPerMt, { perMt: true }) : 'No bids yet'}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {d.bidCount > 0 && <StatusBadge kind={d.reserveMet ? 'reserve_met' : 'neutral'}>{d.reserveMet ? 'Reserve met' : 'Reserve not met yet'}</StatusBadge>}
              <Countdown to={l.endAt} />
            </div>
          </div>
          <p className="text-body-md text-text-secondary">
            {d.bidCount} bids from {d.bidderCount} bidders · reserve {formatINR(l.reservePerMt, { perMt: true })}
          </p>
          {r.edit.details && (
            <Banner tone="info" title="This auction is live, so it can’t be edited">
              {r.edit.details.what} {r.edit.details.next}
            </Banner>
          )}
        </Card>
      )}

      {d.result && (
        <Card className="flex flex-col gap-sm p-lg">
          <h2 className="text-h3 text-text-strong">Result</h2>
          {d.result.outcome === 'withdrawn' ? (
            <p className="text-body-md">
              You took this auction down{l.withdrawal ? ` on ${when(l.withdrawal.at)}` : ''}: “{d.result.withdrawalReason}”. No bid wins. Every EMD you confirmed is owed back to
              its buyer — record each refund above when you make it.
            </p>
          ) : d.result.outcome === 'sold' ? (
            <p className="text-body-md">
              Sold at <strong>{formatINR(d.result.winningBidPerMt ?? 0, { perMt: true })}</strong> — the highest stored bid, which met your reserve of{' '}
              {formatINR(l.reservePerMt, { perMt: true })}.
            </p>
          ) : (
            <p className="text-body-md">Closed unsold: no bid met your reserve of {formatINR(l.reservePerMt, { perMt: true })}.</p>
          )}
          {r.transactionId && (
            <div>
              <ButtonLink href={`/transactions/${r.transactionId}`} variant="primary">
                Open transaction {r.transactionId}
              </ButtonLink>
            </div>
          )}
        </Card>
      )}

      {(d.status === 'scheduled' || d.status === 'live') && (
        <ManageAuction
          lotId={l.id}
          live={d.status === 'live'}
          bidCount={d.bidCount}
          onChanged={() => {
            lot.reload();
            rules.reload();
          }}
        />
      )}

      <Card className="flex flex-col gap-xs text-body-md">
        <h2 className="text-h3 text-text-strong">What can change</h2>
        <p className="text-text-secondary">Listing details: {r.edit.details ? r.edit.details.what : 'editable until bidding opens.'}</p>
        <p className="text-text-secondary">Reserve: {r.edit.reserve ? r.edit.reserve.what : 'editable until bidding opens.'}</p>
        <p className="text-text-secondary">Bids and the winner: {r.edit.bids?.what}</p>
        <p className="text-text-secondary">Photos and videos: you can add more until the auction ends; ones already shown stay.</p>
        <p className="text-text-secondary">Taking it down: possible until the auction ends, with a reason bidders see.</p>
      </Card>

      {d.status !== 'draft' && <BidHistory d={d} />}
      <AssuranceSummary d={d} />
      {l.assurance.agreedAt && <p className="-mt-md text-caption text-text-secondary">You agreed to the Lot Assurance terms on {when(l.assurance.agreedAt)}.</p>}
      <EvidenceList d={d} />
      <Specs d={d} />

      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        busy={busy}
        tone="danger"
        title="Delete this draft?"
        consequence="The draft and its attached files are removed. Published lots can’t be deleted."
        confirmLabel="Delete draft"
        onConfirm={async () => {
          setBusy(true);
          const res = await ds.deleteDraft(l.id, viewer);
          setBusy(false);
          setDel(false);
          if (res.ok) {
            toast.show('Draft deleted.', 'success');
            router.push('/seller/lots');
          } else toast.show(res.error.what, 'error');
        }}
      />
    </Container>
  );
}

/** Published and not ended: add photos, or take the auction down with a reason (D-104). */
function ManageAuction({ lotId, live, bidCount, onChanged }: { lotId: string; live: boolean; bidCount: number; onChanged: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [media, setMedia] = useState<LotMedia[]>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-md p-lg">
      <h2 className="text-h3 text-text-strong">Manage this auction</h2>
      <div className="flex flex-col gap-sm">
        <EvidenceUploader
          label="Add photos or videos"
          helper="They appear on the lot straight away; buyers who paid an EMD or bid are told. Photos already shown can’t be removed."
          stage="listing"
          kinds={['photo', 'video']}
          value={media}
          onChange={setMedia}
        />
        {media.length > 0 && (
          <div>
            <Button
              loading={adding}
              onClick={async () => {
                setAdding(true);
                const r = await ds.addLotMedia(lotId, media, viewer);
                setAdding(false);
                if (!r.ok) return toast.show(`${r.error.what} ${r.error.next}`, 'error');
                toast.show(`${media.length} ${media.length === 1 ? 'file' : 'files'} added to the lot.`, 'success');
                setMedia([]);
                onChanged();
              }}
            >
              Add {media.length} {media.length === 1 ? 'file' : 'files'} to the lot
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-xs border-t border-border pt-md">
        <p className="text-label-md text-text-strong">Take the auction down</p>
        <p className="text-body-md text-text-secondary">
          {live && bidCount > 0
            ? `It has ${bidCount} ${bidCount === 1 ? 'bid' : 'bids'}. Taking it down means no bid wins, bidders are told your reason, and you owe back every EMD you confirmed.`
            : 'Buyers can no longer bid. Anyone who reported an EMD is told your reason, and you owe back every EMD you confirmed.'}
        </p>
        <div>
          <Button variant="danger" onClick={() => (setOpen(true), setError(null))}>
            Take down auction
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        tone="danger"
        title="Take this auction down?"
        consequence="This can’t be undone. The lot stays on record as “Withdrawn by seller” with your reason."
        confirmLabel="Take down auction"
        onConfirm={async () => {
          setBusy(true);
          const r = await ds.withdrawLot(lotId, reason, viewer);
          setBusy(false);
          if (!r.ok) return setError(`${r.error.what} ${r.error.next}`);
          setOpen(false);
          toast.show('Auction taken down. Bidders have been told.', 'success');
          onChanged();
        }}
      >
        <Field label="Reason (bidders see this)" required error={error ?? undefined}>
          <Textarea value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} placeholder="For example: the material is needed back at our own plant." />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

