'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatAge, type Notification } from '@auctionit/domain';
import { useData, useQuery } from '@/data';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/SessionProvider';

export function NotificationList({ items, onNavigate }: { items: Notification[]; onNavigate?: () => void }) {
  // "x ago" is relative to when the list was opened; it refreshes with the data.
  const [now] = useState(() => Date.now());
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <li key={n.id}>
          <Link href={n.href} onClick={onNavigate} className={cn('flex gap-sm px-sm py-sm hover:bg-surface-muted', !n.read && 'bg-primary-container/50')}>
            <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
            <span className="min-w-0">
              <span className="block text-label-md text-text-strong">
                {n.title}
                {!n.read && <span className="sr-only"> (unread)</span>}
              </span>
              <span className="block text-caption text-text-secondary">{n.body}</span>
              <span className="block text-caption text-text-secondary">{formatAge(now - Date.parse(n.at))} ago</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** In-app notifications (SPEC §18): unread count, latest items, each linking to its lot or transaction. */
export function NotificationBell() {
  const { viewer, session } = useSession();
  const { ds } = useData();
  const q = useQuery(`notes:${session.userId}`, (s) => s.notifications(viewer), { pollMs: 10_000, enabled: !!session.userId });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session.userId) return null;
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-md border border-border bg-surface text-text hover:bg-surface-muted"
      >
        <Bell className="size-5" aria-hidden />
        <span className="sr-only">Notifications{unread ? `, ${unread} unread` : ''}</span>
        {unread > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-caption text-on-primary">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-4 top-[4.5rem] z-40 overflow-hidden rounded-lg border border-border bg-surface shadow-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-xs sm:w-96">
          <div className="flex items-center justify-between border-b border-border px-sm py-xs">
            <p className="text-label-md text-text-strong">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-caption font-medium text-primary underline"
                onClick={async () => {
                  await ds.markNotificationsRead(viewer);
                  q.reload();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-sm py-md text-body-md text-text-secondary">No notifications yet. Bids, wins, payments, lifting and claims will appear here.</p>
            ) : (
              <NotificationList items={items.slice(0, 8)} onNavigate={() => setOpen(false)} />
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-border px-sm py-xs text-center text-label-md text-primary hover:bg-surface-muted">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
