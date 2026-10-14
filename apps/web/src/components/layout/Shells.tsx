'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, Gavel, LayoutDashboard, PlusSquare, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Role } from '@auctionit/domain';
import { Banner } from '@/components/ui';
import { useData, useDataRecovered } from '@/data';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/SessionProvider';
import { AppHeader, isActive } from './AppHeader';

function DataBanners() {
  const { fallbackReason } = useData();
  const recovered = useDataRecovered();
  if (!fallbackReason && !recovered) return null;
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-xs px-4 pt-md md:px-lg">
      {fallbackReason && (
        <Banner tone="warning" title="Showing demo data">
          {fallbackReason}
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

export function Footer() {
  return (
    <footer className="mt-xxl border-t border-border bg-surface">
      <div className="mx-auto grid max-w-[1280px] gap-lg px-4 py-xl text-body-md md:grid-cols-3 md:px-lg">
        <div>
          <p className="text-h3 font-semibold text-text-strong">
            Auction<span className="text-primary">IT</span>
          </p>
          <p className="mt-xs text-text-secondary">Online auctions for industrial scrap and surplus.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-xs">
          <Link href="/auctions" className="text-primary hover:underline">Explore auctions</Link>
          <Link href="/lot-assurance" className="text-primary hover:underline">How Lot Assurance works</Link>
          <Link href="/sign-in?as=seller" className="text-primary hover:underline">Sell surplus</Link>
          <Link href="/sign-in" className="text-primary hover:underline">Sign in</Link>
        </nav>
        <div className="flex flex-col gap-xs text-text-secondary">
          <p>Help and contact: support details will appear here (placeholder).</p>
          <p className="rounded-md border border-dashed border-on-trust-declared px-sm py-xs text-caption text-on-trust-declared">
            Demo environment. All companies, prices, ratings and metrics are sample data. Payments, EMD and refunds are simulated — no real money moves.
          </p>
        </div>
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
  ],
  seller: [
    { href: '/seller/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { href: '/seller/lots/new', label: 'New lot', Icon: PlusSquare },
    { href: '/auctions', label: 'Auctions', Icon: Gavel },
  ],
  ops: [
    { href: '/ops', label: 'Overview', Icon: LayoutDashboard },
    { href: '/auctions', label: 'Auctions', Icon: Gavel },
    { href: '/lot-assurance', label: 'Lot Assurance', Icon: ArrowLeftRight },
  ],
};

/**
 * Signed-in workspace: 240px teal sidebar on desktop, bottom tab bar on mobile (DESIGN.md Layout).
 */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const pathname = usePathname();
  const items = session.role === 'guest' ? [] : WORKSPACE_NAV[session.role];
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
