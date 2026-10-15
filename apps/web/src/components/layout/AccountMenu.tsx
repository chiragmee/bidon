'use client';

import Link from 'next/link';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from '@/data';
import { useSession } from '@/lib/SessionProvider';

/** Live site: who is signed in, their account page, and sign out. No switching between accounts or roles. */
export function AccountMenu() {
  const { session, user, auth, signOut } = useSession();
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

  // Guests get "Sign in" and "Create account" from the header itself.
  if (!auth?.signedIn) return null;
  const name = user?.name ?? auth.email ?? 'Your account';
  const role = session.role === 'guest' ? 'Account setup' : ROLE_LABEL[session.role];
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
          <span className="text-caption text-text-secondary">{role}</span>
          <span className="max-w-40 truncate text-label-md text-text-strong">{name}</span>
        </span>
        <span className="sr-only sm:hidden">Account menu: {name}</span>
        <ChevronDown className="size-4 text-text-secondary" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-40 mt-xs w-64 rounded-lg border border-border bg-surface p-xs shadow-2">
          <p className="truncate px-xs pb-xs text-caption text-text-secondary">{auth.email}</p>
          {(session.role === 'buyer' || session.role === 'seller') && (
            <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="block rounded-md px-xs py-xs text-label-md text-text hover:bg-surface-muted">
              Account and verification
            </Link>
          )}
          {session.role === 'guest' && (
            <Link role="menuitem" href={auth.intendedRole === 'seller' ? '/onboarding/seller' : '/onboarding/buyer'} onClick={() => setOpen(false)} className="block rounded-md px-xs py-xs text-label-md text-text hover:bg-surface-muted">
              Finish setting up your account
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-xs rounded-md px-xs py-xs text-left text-label-md text-text hover:bg-surface-muted"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
