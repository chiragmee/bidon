'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gavel, Menu, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { Role } from '@auctionit/domain';
import { ButtonLink, DemoModePill } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AUTH_ENABLED, DEMO_CONTROLS } from '@/lib/flags';
import { AccountMenu } from './AccountMenu';
import { LogoLink } from './Logo';
import { signUpHref } from '@/lib/links';
import { useSession } from '@/lib/SessionProvider';
import { NotificationBell } from './NotificationBell';
import { RoleSwitcher } from './RoleSwitcher';

export const NAV: Record<Role, { href: string; label: string }[]> = {
  guest: [
    { href: '/auctions', label: 'Auctions' },
    { href: '/how-it-works', label: 'How it works' },
    { href: '/lot-assurance', label: 'Lot Assurance' },
    { href: '/how-it-works#sellers', label: 'Sell on Bid ON' },
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

/** Pages that already lead with the same action (or are it) don't repeat it in the bar. */
const ROLE_ACTION: Partial<Record<Role, { href: string; label: string; Icon: typeof Plus; hideOn: string[] }>> = {
  seller: { href: '/seller/lots/new', label: 'Create auction', Icon: Plus, hideOn: ['/seller/lots/new', '/seller/dashboard', '/seller/lots'] },
  buyer: { href: '/auctions?status=live', label: 'Live auctions', Icon: Gavel, hideOn: ['/buyer/dashboard'] },
};

export function isActive(pathname: string, href: string) {
  const path = href.split('?')[0] ?? href;
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
}

export function Wordmark() {
  return <LogoLink />;
}

/** 64px top bar on every page: wordmark, role nav, account menu (and the Demo Mode pill with presenter controls). */
export function AppHeader({ showNav = true }: { showNav?: boolean }) {
  const { session, user } = useSession();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const links = session.role === 'ops' && user?.staffLevel === 'admin' ? [...NAV.ops, { href: '/ops/team', label: 'Team' }] : NAV[session.role];
  const roleAction = ROLE_ACTION[session.role];
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
                <ButtonLink href={signUpHref('buyer')}>Create account</ButtonLink>
              </span>
            </>
          )}
          {/* Each signed-in role's main job, always one click away (teal, so it never competes with the page's one orange action). */}
          {roleAction && !roleAction.hideOn.includes(pathname) && (
            <Link
              href={roleAction.href}
              // Phones: in the menu (and the workspace's bottom bar) instead, so the bar never overflows 390px.
              className="hidden h-9 shrink-0 items-center gap-1 rounded-md bg-primary px-sm text-label-md text-on-primary hover:bg-primary-hover sm:inline-flex"
            >
              <roleAction.Icon className="size-4" aria-hidden />
              {roleAction.label}
            </Link>
          )}
          <NotificationBell />
          {AUTH_ENABLED ? <AccountMenu /> : <RoleSwitcher />}
        </div>
      </div>
      {showNav && menu && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-border px-4 py-xs md:hidden">
          {[...(roleAction ? [{ href: roleAction.href, label: roleAction.label }] : []), ...links, ...(session.role === 'guest' ? [{ href: '/sign-in', label: 'Sign in' }, { href: signUpHref('buyer'), label: 'Create account' }] : [])].map((l) => (
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
