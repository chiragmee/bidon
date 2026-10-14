'use client';

import { BellOff } from 'lucide-react';
import { Container, PageHeader } from '@/components/layout/Shells';
import { NotificationList } from '@/components/layout/NotificationBell';
import { Button, ButtonLink, EmptyState, ErrorState, RetryIcon, Skeleton } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';

export default function NotificationsPage() {
  const { viewer, session } = useSession();
  const { ds } = useData();
  const q = useQuery(`notes-all:${session.userId}`, (s) => s.notifications(viewer), { enabled: !!session.userId });
  if (!session.userId) {
    return (
      <Container>
        <EmptyState icon={BellOff} title="Sign in to see notifications" headingLevel={1} action={<ButtonLink href="/sign-in">Sign in</ButtonLink>} />
      </Container>
    );
  }
  return (
    <Container className="flex max-w-[760px] flex-col gap-lg">
      <PageHeader
        title="Notifications"
        actions={
          q.data?.some((n) => !n.read) ? (
            <Button
              onClick={async () => {
                await ds.markNotificationsRead(viewer);
                q.reload();
              }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      >
        Bids, wins, payments, lifting and claims — each links to its lot or transaction.
      </PageHeader>
      {q.error && !q.data ? (
        <ErrorState what="We couldn’t load notifications." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      ) : !q.data ? (
        <Skeleton className="h-64" />
      ) : q.data.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications yet" action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>}>
          They appear here when something needs your attention.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <NotificationList items={q.data} />
        </div>
      )}
    </Container>
  );
}
