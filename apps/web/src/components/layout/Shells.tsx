'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, BadgeCheck, ClipboardList, Gavel, LayoutDashboard, PlusSquare, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Role } from '@auctionit/domain';
import { Banner, Button } from '@/components/ui';
import { useData, useDataRecovered } from '@/data';
import { cn } from '@/lib/cn';
import { DEMO_CONTROLS } from '@/lib/flags';
import { signUpHref } from '@/lib/links';
import { HOME } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { AppHeader, isActive } from './AppHeader';

function DataBanners() {
  const { fallbackReason, apiDown, retryLive } = useData();
  const recovered = useDataRecovered();
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState(false);
  if (!fallbackReason && !apiDown && !recovered) return null;
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-xs px-4 pt-md md:px-lg">
      {(fallbackReason || apiDown) && (
        <Banner
          tone="warning"
          title={apiDown ? 'Can’t reach AuctionIT right now' : 'Showing sample data from this browser'}
          action={
            retryLive && (
              <Button
                loading={checking}
                onClick={async () => {
                  setChecking(true);
                  const up = await retryLive();
                  setChecking(false);
                  setStillDown(!up);
                }}
              >
                {apiDown ? 'Try again' : 'Try the live backend again'}
              </Button>
            )
          }
        >
          {fallbackReason ?? 'The server didn’t answer. Lots, bids and transactions can’t load until it does — nothing you’ve done is lost.'}
          {stillDown && ' Still unreachable — try again in a moment.'}
        </Banner>
      )}
      {recovered && (
        <Banner tone="info" title="Demo data was restored">
          The saved demo data in this browser couldn’t be read, so the starting sample data was loaded.
        </Banner>
      )}
    </div>
  );
}

function FooterAccount({ col, link }: { col: string; link: string }) {
  const { session } = useSession();
  return (
    <nav aria-label="Account" className={col}>
      <p className="text-overline uppercase text-text-secondary">Account</p>
      {session.role === 'guest' ? (
        <>
          <Link href="/sign-in" className={link}>Sign in</Link>
          <Link href={signUpHref('buyer')} className={link}>Create a buyer account</Link>
          <Link href={signUpHref('seller')} className={link}>Sell on AuctionIT</Link>
          <Link href="/staff/sign-in" className="text-caption text-text-secondary hover:text-primary hover:underline">AuctionIT staff sign-in</Link>
        </>
      ) : (
        <>
          <Link href={HOME[session.role]} className={link}>{session.role === 'ops' ? 'Operations' : 'Your dashboard'}</Link>
          {session.role === 'seller' && <Link href="/seller/lots/new" className={link}>Create auction</Link>}
          {session.role === 'buyer' && <Link href="/auctions" className={link}>Browse auctions</Link>}
          {session.role !== 'ops' && <Link href="/account" className={link}>Account and verification</Link>}
        </>
      )}
    </nav>
  );
}

export function Footer() {
  const col = 'flex flex-col gap-xs';
  const link = 'text-text hover:text-primary hover:underline';
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-[1280px] gap-lg px-4 py-xl text-body-md md:grid-cols-[1.4fr_1fr_1fr] md:px-lg">
        <div className={col}>
          <p className="text-h3 font-semibold text-text-strong">
            Auction<span className="text-primary">IT</span>
          </p>
          <p className="max-w-[360px] text-text-secondary">Online auctions for industrial scrap and surplus between approved businesses.</p>
        </div>
        <nav aria-label="Marketplace" className={col}>
          <p className="text-overline uppercase text-text-secondary">Marketplace</p>
          <Link href="/auctions" className={link}>Auctions</Link>
          <Link href="/how-it-works" className={link}>How it works</Link>
          <Link href="/lot-assurance" className={link}>Lot Assurance</Link>
        </nav>
        <FooterAccount col={col} link={link} />
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[1280px] px-4 py-sm text-caption text-text-secondary md:px-lg">
          AuctionIT doesn’t collect or move money: buyers pay sellers directly, and the seller confirms each payment here.
          {DEMO_CONTROLS && ' Records marked “Sample data” are fictional examples.'}
        </p>
      </div>
    </footer>
  );
}

/** Public pages: top navigation, content, footer. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-xs">
        Skip to content
      </a>
      <AppHeader />
      <DataBanners />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <Footer />
    </>
  );
}

const WORKSPACE_NAV: Record<Exclude<Role, 'guest'>, { href: string; label: string; Icon: typeof Gavel }[]> = {
  buyer: [
    { href: '/buyer/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { href: '/auctions', label: 'Auctions', Icon: Gavel },
    { href: '/lot-assurance', label: 'Lot Assurance', Icon: ShieldCheck },
    { href: '/account', label: 'Account', Icon: BadgeCheck },
  ],
  seller: [
    { href: '/seller/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { href: '/seller/lots', label: 'My lots', Icon: ClipboardList },
    { href: '/seller/lots/new', label: 'Create auction', Icon: PlusSquare },
    { href: '/auctions', label: 'Auctions', Icon: Gavel },
    { href: '/account', label: 'Account', Icon: BadgeCheck },
  ],
  ops: [
    { href: '/ops', label: 'Operations', Icon: LayoutDashboard },
    { href: '/ops/eligibility', label: 'Eligibility', Icon: UserCheck },
    { href: '/ops/auctions', label: 'Auctions', Icon: Gavel },
    { href: '/auctions', label: 'Marketplace', Icon: ArrowLeftRight },
  ],
};

/**
 * Signed-in workspace: 240px teal sidebar on desktop, bottom tab bar on mobile (DESIGN.md Layout).
 */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { session, user } = useSession();
  const pathname = usePathname();
  const base = session.role === 'guest' ? [] : WORKSPACE_NAV[session.role];
  // The admin manages the team of regional reviewers (D-102).
  const items = session.role === 'ops' && user?.staffLevel === 'admin' ? [...base.slice(0, 2), { href: '/ops/team', label: 'Team', Icon: Users }, ...base.slice(2)] : base;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-xs">
        Skip to content
      </a>
      <AppHeader showNav={false} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <nav aria-label="Workspace" className="hidden w-60 shrink-0 bg-primary px-sm py-md lg:block">
          <ul className="flex flex-col gap-1">
            {items.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(pathname, href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-sm rounded-md px-sm py-xs text-label-md text-on-primary/85 hover:bg-primary-hover hover:text-on-primary',
                    isActive(pathname, href) && 'bg-primary-hover text-on-primary',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <DataBanners />
          <main id="main">{children}</main>
        </div>
      </div>
      <nav
        aria-label="Workspace"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <ul className="flex">
          {items.map(({ href, label, Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? 'page' : undefined}
                className={cn('flex flex-col items-center gap-0.5 py-xs text-caption text-text-secondary', isActive(pathname, href) && 'text-primary')}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** Page heading block: overline, H1, supporting line, optional actions. */
export function PageHeader({ overline, title, children, actions }: { overline?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-sm md:flex-row md:items-end md:justify-between">
      <div>
        {overline && <p className="text-overline uppercase text-text-secondary">{overline}</p>}
        <h1 className="text-h1 text-text-strong">{title}</h1>
        {children && <div className="mt-1 text-body-md text-text-secondary">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-xs">{actions}</div>}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1280px] px-4 py-lg md:px-lg', className)}>{children}</div>;
}
