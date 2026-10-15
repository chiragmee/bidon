'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { Role } from '@auctionit/domain';
import { ButtonLink, DemoModePill } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AUTH_ENABLED, DEMO_CONTROLS } from '@/lib/flags';
import { AccountMenu } from './AccountMenu';
import { useSession } from '@/lib/SessionProvider';
import { NotificationBell } from './NotificationBell';
import { RoleSwitcher } from './RoleSwitcher';

export const NAV: Record<Role, { href: string; label: string }[]> = {
  guest: [
    { href: '/auctions', label: 'Explore auctions' },
    { href: '/lot-assurance', label: 'How Lot Assurance works' },
    { href: '/sign-in?as=seller', label: 'Sell surplus' },
  ],
  buyer: [
    { href: '/auctions', label: 'Auctions' },
    { href: '/buyer/dashboard', label: 'Dashboard' },
    { href: '/lot-assurance', label: 'Lot Assurance' },
  ],
  seller: [
    { href: '/auctions', label: 'Auctions' },
    { href: '/seller/dashboard', label: 'Dashboard' },
    { href: '/lot-assurance', label: 'Lot Assurance' },
  ],
  ops: [
    { href: '/auctions', label: 'Auctions' },
    { href: '/ops', label: 'Operations' },
    { href: '/ops/eligibility', label: 'Eligibility' },
  ],
};

export function isActive(pathname: string, href: string) {
  const path = href.split('?')[0] ?? href;
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-1 text-h3 font-semibold tracking-tight text-text-strong" aria-label="AuctionIT home">
      Auction<span className="text-primary">IT</span>
    </Link>
  );
}

/** 64px top bar on every page: wordmark, role nav, account menu (and the Demo Mode pill with presenter controls). */
export function AppHeader({ showNav = true }: { showNav?: boolean }) {
  const { session } = useSession();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const links = NAV[session.role];
  // Close the mobile menu after navigating.
  const [menuPath, setMenuPath] = useState(pathname);
  if (pathname !== menuPath) {
    setMenuPath(pathname);
    setMenu(false);
  }

  return (
    <header
      className="sticky z-30 border-b border-border bg-surface"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-md px-4 md:px-lg">
        {showNav && (
          <button
            type="button"
            className="-ml-1 rounded-md p-1.5 text-text md:hidden"
            aria-expanded={menu}
            aria-controls="mobile-nav"
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            <span className="sr-only">{menu ? 'Close menu' : 'Open menu'}</span>
          </button>
        )}
        <Wordmark />
        {showNav && (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'rounded-md px-sm py-xs text-label-md text-text hover:bg-surface-muted',
                  isActive(pathname, l.href) && 'bg-primary-container text-primary',
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-xs">
          {DEMO_CONTROLS && <DemoModePill />}
          {session.role === 'guest' && (
            <>
              <Link href="/sign-in" className="hidden rounded-md px-sm py-xs text-label-md text-primary hover:bg-primary-container lg:block">
                Sign in
              </Link>
              {/* Secondary on purpose: the page body owns the single primary action (D-033).
                  Wrapped so `hidden` doesn't fight the button's own inline-flex. */}
              <span className="hidden lg:block">
                <ButtonLink href="/auctions">Browse auctions</ButtonLink>
              </span>
            </>
          )}
          <NotificationBell />
          {AUTH_ENABLED ? <AccountMenu /> : <RoleSwitcher />}
        </div>
      </div>
      {showNav && menu && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-border px-4 py-xs md:hidden">
          {[...links, ...(session.role === 'guest' ? [{ href: '/sign-in', label: 'Sign in' }] : [])].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? 'page' : undefined}
              className={cn('block rounded-md px-sm py-sm text-label-md text-text', isActive(pathname, l.href) && 'bg-primary-container text-primary')}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
