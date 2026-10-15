'use client';

import { Check, ChevronDown, RotateCcw, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DEMO_ACCOUNTS, type Role } from '@auctionit/domain';
import { ConfirmDialog, useToast } from '@/components/ui';
import { ROLE_LABEL, useData } from '@/data';
import { cn } from '@/lib/cn';
import { DEMO_CONTROLS } from '@/lib/flags';
import { HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

const OPTIONS: { role: Role; who: string }[] = [
  { role: 'guest', who: 'Browse without signing in' },
  { role: 'buyer', who: 'Rahul Sharma · Vardhan Infra Projects' },
  { role: 'seller', who: 'Suresh Agrawal · Shree Balaji Steels' },
  { role: 'ops', who: 'Devendra Nath · AuctionIT Operations' },
];

/**
 * Account menu in every header: switch between the sample accounts without losing the current lot
 * or transaction when the new role may view it. Password sign-in doesn't exist yet
 * (docs/PRODUCTION_GAPS.md #13). "Reset demo data" only with presenter controls.
 */
export function RoleSwitcher() {
  const { session, user, switchRole } = useSession();
  const { ds } = useData();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  const label = session.role === 'guest' ? 'Guest' : (user?.name ?? ROLE_LABEL[session.role]);
  const isDemoAccount = session.role !== 'guest' && session.userId === DEMO_ACCOUNTS[session.role];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-xs rounded-md border border-border bg-surface px-sm text-left hover:bg-surface-muted"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary text-on-primary">
          <UserRound className="size-4" aria-hidden />
        </span>
        <span className="hidden min-w-0 flex-col sm:flex">
          <span className="text-caption text-text-secondary">Viewing as {ROLE_LABEL[session.role]}</span>
          <span className="max-w-40 truncate text-label-md text-text-strong">{label}</span>
        </span>
        <span className="sr-only sm:hidden">Viewing as {ROLE_LABEL[session.role]}. Switch role</span>
        <ChevronDown className="size-4 text-text-secondary" aria-hidden />
      </button>

      {open && (
        <div role="menu" aria-label="Switch account" className="absolute right-0 z-40 mt-xs w-72 rounded-lg border border-border bg-surface p-xs shadow-2">
          <p className="px-xs pb-xs pt-0.5 text-overline uppercase text-text-secondary">Sample accounts</p>
          {OPTIONS.map((o) => {
            const active = session.role === o.role && (o.role === 'guest' || isDemoAccount);
            return (
              <button
                key={o.role}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) switchRole(o.role);
                }}
                className={cn('flex w-full items-start gap-xs rounded-md px-xs py-xs text-left hover:bg-surface-muted', active && 'bg-primary-container')}
              >
                <Check className={cn('mt-0.5 size-4 shrink-0 text-primary', !active && 'invisible')} aria-hidden />
                <span>
                  <span className="block text-label-md text-text-strong">{ROLE_LABEL[o.role]}</span>
                  <span className="block text-caption text-text-secondary">{o.who}</span>
                </span>
              </button>
            );
          })}
          {DEMO_CONTROLS && (
            <>
              <div className="my-xs border-t border-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setConfirmReset(true);
                }}
                className="flex w-full items-center gap-xs rounded-md px-xs py-xs text-left text-label-md text-text hover:bg-surface-muted"
              >
                <RotateCcw className="size-4" aria-hidden />
                Reset demo data
              </button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        busy={resetting}
        tone="demo"
        title="Reset demo data?"
        consequence="All bids, payments, transactions and claims go back to the starting sample data, with fresh auction times. This only affects this browser."
        confirmLabel="Reset demo data"
        onConfirm={async () => {
          setResetting(true);
          await ds.reset();
          setResetting(false);
          setConfirmReset(false);
          toast.show('Demo data reset to the starting sample data.', 'success');
          if (session.role !== 'guest' && !isDemoAccount) switchRole(session.role);
          else router.refresh();
        }}
      />
    </div>
  );
}

export { HOME };
