import type { Metadata } from 'next';
import { Inbox } from 'lucide-react';
import {
  createSeed,
  toLotCard,
  TX_STEPS,
  type DemoState,
  type Lot,
} from '@auctionit/domain';
import {
  AuctionStatusBadge,
  Banner,
  ButtonLink,
  Card,
  DemoModePill,
  DemoPolicyCaption,
  EmptyState,
  ErrorState,
  LotAssuranceBadge,
  LotCard,
  LotImage,
  Overline,
  SampleDataCaption,
  Skeleton,
  StatCard,
  StatusBadge,
  Stepper,
  TrustBadge,
  type LotCardData,
} from '@/components/ui';
import { tokens } from '@/styles/tokens';
import { notFound } from 'next/navigation';
import { DEMO_CONTROLS } from '@/lib/flags';
import { InteractiveExamples } from './InteractiveExamples';

export const metadata: Metadata = { title: 'UI components' };
// Seed dates are relative to "now", so render per request rather than at build time.
export const dynamic = 'force-dynamic';

function toCard(s: DemoState, lot: Lot, now: string): LotCardData {
  return { ...toLotCard(s, lot, now), href: '#lot-cards' };
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-md border-t border-border pt-lg">
      <h2 id={`${id}-h`} className="text-h2 text-text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Internal component gallery; 404 on the live site (presenter controls off). */
export default function ComponentsPage() {
  if (!DEMO_CONTROLS) notFound();
  const now = new Date().toISOString();
  const s = createSeed(now);
  const cards = ['LOT-2025-0891', 'LOT-2025-0894', 'LOT-2025-0910'].map((id) => toCard(s, s.lots.find((l) => l.id === id)!, now));

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-xl px-4 py-xl md:px-lg">
      <header className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <Overline>Developer reference</Overline>
          <h1 className="text-h1 text-text-strong">UI components</h1>
          <p className="text-body-md text-text-secondary">Every primitive, built only on DESIGN.md tokens. Example data is sample data.</p>
        </div>
        <DemoModePill />
      </header>

      <Section id="colours" title="Colour tokens">
        <ul className="grid grid-cols-2 gap-xs sm:grid-cols-4 lg:grid-cols-6">
          {Object.entries(tokens.colors).map(([name, hex]) => (
            <li key={name} className="flex items-center gap-xs">
              <span className="size-8 shrink-0 rounded-sm border border-border" style={{ background: hex }} />
              <span className="min-w-0 text-caption">
                <span className="block truncate text-text-strong">{name}</span>
                <span className="text-text-secondary">{hex}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Typography">
        <div className="flex flex-col gap-xs">
          <p className="text-display text-text-strong">Display 40/48</p>
          <p className="text-h1 text-text-strong">H1 page title 30/38</p>
          <p className="text-h2 text-text-strong">H2 section title 24/32</p>
          <p className="text-h3 text-text-strong">H3 card title 18/28</p>
          <p className="text-body-lg">Body large 16/24 — landing and onboarding.</p>
          <p className="text-body-md">Body 14/20 — the default inside the app.</p>
          <p className="text-overline uppercase text-text-secondary">Overline 11/16</p>
          <p className="text-price-xl text-text-strong">₹34,500/MT</p>
          <p className="text-price-md text-text-strong">₹13,89,600</p>
        </div>
      </Section>

      <Section id="badges" title="Status, trust and assurance badges">
        <div className="flex flex-wrap gap-xs">
          {(['live', 'scheduled', 'ended', 'closed_reserve_met', 'closed_unsold', 'awarded', 'draft'] as const).map((st) => (
            <AuctionStatusBadge key={st} status={st} />
          ))}
        </div>
        <div className="flex flex-wrap gap-xs">
          <StatusBadge kind="success">Leading</StatusBadge>
          <StatusBadge kind="success">Won</StatusBadge>
          <StatusBadge kind="success">Within tolerance</StatusBadge>
          <StatusBadge kind="warning">Outbid</StatusBadge>
          <StatusBadge kind="warning">Awaiting action</StatusBadge>
          <StatusBadge kind="danger">Outside tolerance</StatusBadge>
          <StatusBadge kind="neutral">Closed without winning</StatusBadge>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          <TrustBadge tier="declared" />
          <TrustBadge tier="evidence" />
          <TrustBadge tier="confirmed" />
          <LotAssuranceBadge />
          <LotAssuranceBadge variant="overlay" />
          <DemoPolicyCaption />
          <SampleDataCaption />
          <DemoModePill />
        </div>
      </Section>

      <Section id="cards" title="Cards and stat cards">
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Active bids" value="3" caption="2 leading · 1 outbid · Sample data" />
          <StatCard label="Closing soon" value="1" caption="Ends in under an hour" />
          <StatCard label="Won — next step" value="1" caption="Pay balance to continue" />
          <StatCard label="Open claims" value="1" caption="Needs an Operations decision" attention />
          <StatCard label="Completed" value="6" caption="Sample data" />
        </div>
        <Card>
          <h3 className="text-h3 text-text-strong">Card</h3>
          <p className="text-body-md text-text-secondary">White surface, 1px hairline border, 12px radius, no shadow.</p>
        </Card>
      </Section>

      <Section id="lot-cards" title="Lot cards (from the seed)">
        <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <LotCard key={c.id} lot={c} />
          ))}
        </div>
        <div className="grid gap-md sm:grid-cols-3">
          <LotImage src={null} alt="HMS steel scrap" category="ferrous_hms" />
          <LotImage src="/demo-images/missing.jpg" alt="Copper cable" category="non_ferrous" ratio="4/3" />
          <LotImage src={null} alt="Lathes" category="machinery" ratio="4/3" />
        </div>
        <p className="text-caption text-text-secondary">Fallback tiles: no photo, a photo not yet added to public/demo-images, and the 4:3 gallery ratio.</p>
      </Section>

      <Section id="stepper" title="Transaction stepper">
        <Card>
          <Stepper steps={TX_STEPS} current={4} captions={['24 Oct', '25 Oct', '26 Oct', 'In progress']} />
        </Card>
        <Card>
          <Stepper steps={TX_STEPS} current={4} claim claimLabel="Claim under review" />
        </Card>
        <Card>
          <Stepper steps={TX_STEPS} current={6} label="Completed transaction" />
        </Card>
      </Section>

      <Section id="feedback" title="Banners, empty, error and loading states">
        <Banner tone="info" title="Payments are simulated">No real money moves in this demo.</Banner>
        <Banner tone="success">Bid placed: you are leading at ₹35,000/MT.</Banner>
        <Banner tone="warning" title="You were outbid" action={<ButtonLink href="#feedback">View lot</ButtonLink>}>
          Another bidder placed ₹35,500/MT.
        </Banner>
        <Banner tone="danger" title="Backend unavailable">Showing demo data instead. Your changes stay in this browser.</Banner>
        <div className="grid gap-md md:grid-cols-2">
          <EmptyState icon={Inbox} title="No matching auctions" action={<ButtonLink href="#feedback">Clear filters</ButtonLink>}>
            Try removing a category or location filter.
          </EmptyState>
          <ErrorState
            what="We couldn’t load auctions."
            meaning="Nothing has changed with your bids or deposits."
            next="Check your connection and try again."
          />
        </div>
        <div className="flex flex-col gap-xs">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="aspect-[16/10] w-full max-w-[400px]" />
        </div>
      </Section>

      <InteractiveExamples />

      <Section id="components-tokens" title="Component tokens">
        <pre className="max-h-80 overflow-auto rounded-md bg-surface-muted p-md text-caption">{JSON.stringify(tokens.components['button-primary'], null, 2)}</pre>
      </Section>
    </main>
  );
}
