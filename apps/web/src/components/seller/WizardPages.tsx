'use client';

import { useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { draftFromLot, type WizardStep } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Button, ButtonLink, EmptyState, ErrorState, RetryIcon, Skeleton } from '@/components/ui';
import { useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';
import { ListingWizard } from './ListingWizard';

function Loading() {
  return (
    <Container className="max-w-[760px]">
      <div role="status" aria-label="Loading" className="flex flex-col gap-md">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-16" />
        <Skeleton className="h-80" />
      </div>
    </Container>
  );
}

/** New lot: prefill the yard and location from the seller's profile. */
export function NewLotPage() {
  const { viewer, session } = useSession();
  const q = useQuery(`me:${session.userId}`, (ds) => ds.getUser(viewer.id ?? ''));
  if (q.data === undefined && !q.error) return <Loading />;
  const c = q.data?.company;
  return <ListingWizard lotId={null} initial={{}} defaults={c ? { yard: c.yard, city: c.city, state: c.state } : {}} />;
}

/** Edit a draft or a scheduled lot; live and closed lots explain why they can't be edited. */
export function EditLotPage({ id }: { id: string }) {
  const { viewer, session } = useSession();
  const stepParam = Number(useSearchParams().get('step'));
  const step = ([1, 2, 3, 4] as const).includes(stepParam as WizardStep) ? (stepParam as WizardStep) : 1;
  const lot = useQuery(`lot-edit:${id}:${session.userId}`, (ds) => ds.getLot(id, viewer));
  const rules = useQuery(`lot-rules:${id}:${session.userId}`, (ds) => ds.sellerLot(id, viewer));

  if ((lot.error && !lot.data) || (rules.error && !rules.data)) {
    return (
      <Container>
        <ErrorState what="We couldn’t load this lot." next="Try again." action={<Button onClick={() => (lot.reload(), rules.reload())} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (lot.data === undefined || rules.data === undefined) return <Loading />;
  if (!lot.data || !rules.data) {
    return (
      <Container>
        <EmptyState icon={Lock} title="You can’t edit this lot" headingLevel={1} action={<ButtonLink href="/seller/lots">Back to my lots</ButtonLink>}>
          It doesn’t exist or belongs to another seller.
        </EmptyState>
      </Container>
    );
  }
  const blocked = rules.data.edit.details;
  if (blocked) {
    return (
      <Container>
        <EmptyState icon={Lock} title="This lot can’t be edited now" headingLevel={1} action={<ButtonLink href={`/seller/lots/${id}`}>View the lot</ButtonLink>}>
          {blocked.what} {blocked.next}
        </EmptyState>
      </Container>
    );
  }
  return <ListingWizard lotId={id} initial={draftFromLot(lot.data.lot)} initialStep={step} />;
}
