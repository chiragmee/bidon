import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Gavel,
  Landmark,
  Scale,
  Wallet,
} from 'lucide-react';
import { ButtonLink, LotAssuranceBadge, Overline } from '@/components/ui';
import { FeaturedLots } from '@/components/marketing/FeaturedLots';
import { HowToStart } from '@/components/marketing/HowToStart';
import { RoleEntry } from '@/components/marketing/RoleEntry';
import { GuestOnly, WorkspaceButton } from '@/components/auth/GuestOnly';
import { DEMO_CONTROLS } from '@/lib/flags';
import { signUpHref } from '@/lib/links';

/** Home: what Bid ON is, what's on sale, how to start, why to trust it — once each (docs/HOMEPAGE.md). */

const TRUST = [
  {
    Icon: BadgeCheck,
    title: 'Approved businesses only',
    body: 'Every buyer and seller is reviewed before they trade.',
  },
  { Icon: Wallet, title: 'Pay the seller directly', body: 'Bid ON never holds your money.' },
  { Icon: Gavel, title: 'Fair close', body: 'The highest bid that meets the reserve wins.' },
  {
    Icon: Scale,
    title: 'Weighed, not estimated',
    body: 'You pay for the quantity measured at the weighbridge.',
  },
];

const CATEGORIES = [
  {
    id: 'ferrous_hms',
    name: 'Ferrous & HMS scrap',
    body: 'Heavy melting steel, cast iron, plate and rebar cuttings.',
    image: '/images/home/cat-ferrous-hms.jpg',
    alt: 'Sorted heavy melting steel scrap in a yard',
  },
  {
    id: 'mixed_steel',
    name: 'Mixed steel',
    body: 'Structural cut-ends, beams and mixed steel from plants and projects.',
    image: '/images/home/cat-structural-steel.jpg',
    alt: 'Stacked structural steel beams and cut-ends',
  },
  {
    id: 'non_ferrous',
    name: 'Non-ferrous metals',
    body: 'Copper, brass, aluminium extrusions, cable and turnings.',
    image: '/images/home/cat-copper.jpg',
    alt: 'Copper and bronze turnings on a pallet',
  },
  {
    id: 'machinery',
    name: 'Used machinery & plant',
    body: 'Motors, transformers and decommissioned equipment.',
    image: '/images/home/cat-machinery.jpg',
    alt: 'Used electric motors and transformers in a warehouse',
  },
] as const;

const WHY = [
  {
    Icon: BadgeCheck,
    title: 'Only approved businesses',
    body: 'Buyers and sellers are checked against their PAN, GST and business documents before they can bid or sell — one account per business.',
  },
  {
    Icon: ClipboardList,
    title: 'Clear lot information',
    body: 'Grade, quantity, location, photos, whether the reserve is met, and the full bid history on every lot.',
  },
  {
    Icon: Landmark,
    title: 'You stay in control of payments',
    body: 'Deposits and balances go straight to the seller’s bank account. The seller confirms each payment, and both sides see the same record.',
  },
  {
    Icon: Scale,
    title: 'Every step recorded',
    body: 'Winning bid, payments, lifting date and the weighbridge ticket sit on one timeline both parties can check.',
  },
];

export default function Landing() {
  return (
    <>
      {/* 1. Hero */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-xl px-4 py-xl md:px-lg lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-xxl">
          <div className="min-w-0">
            <Overline>B2B auctions for industrial scrap and surplus</Overline>
            <h1 className="mt-xs text-[2rem] leading-[2.5rem] font-semibold tracking-tight text-text-strong md:text-display">
              Buy and sell industrial scrap through open, reviewed auctions
            </h1>
            <p className="mt-md max-w-[560px] text-body-lg text-text-secondary">
              Approved businesses bid on clearly described lots. Deposits and payments go straight
              to the seller, and every lot is tracked from winning bid to weighbridge and lifting.
            </p>
            <div className="mt-lg flex flex-wrap gap-sm">
              <ButtonLink href="/auctions" variant="primary" size="lg">
                Browse auctions
              </ButtonLink>
              <GuestOnly signedIn={<WorkspaceButton size="lg" />}>
                <ButtonLink href={signUpHref('seller')} size="lg">
                  Start selling
                </ButtonLink>
              </GuestOnly>
            </div>
            <GuestOnly>
              <p className="mt-md text-body-md text-text-secondary">
                Buying for your business?{' '}
                <Link href={signUpHref('buyer')} className="font-medium text-primary underline">
                  Create a buyer account
                </Link>
              </p>
            </GuestOnly>
          </div>
          <div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-lg lg:aspect-[16/12]">
            <Image
              src="/images/home/hero-yard-crane.jpg"
              alt="Gantry crane lifting steel scrap in a yard, with a truck loading beams"
              fill
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
        {/* 2. Trust strip */}
        <ul className="mx-auto grid max-w-[1280px] grid-cols-1 gap-sm px-4 pb-xl sm:grid-cols-2 md:px-lg lg:grid-cols-4">
          {TRUST.map(({ Icon, title, body }) => (
            <li key={title} className="flex items-start gap-sm rounded-lg bg-canvas p-md">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-label-md text-text-strong">{title}</span>
                <span className="block text-body-md text-text-secondary">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Live and upcoming auctions */}
      <section aria-labelledby="live-h" className="mx-auto max-w-[1280px] px-4 py-xxl md:px-lg">
        <div className="mb-lg flex flex-wrap items-end justify-between gap-sm">
          <div>
            <Overline>Marketplace</Overline>
            <h2 id="live-h" className="text-h2 text-text-strong">
              Live and upcoming auctions
            </h2>
          </div>
          <Link
            href="/auctions"
            className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
          >
            See all auctions <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <FeaturedLots />
      </section>

      {/* 4. What's traded */}
      <section aria-labelledby="cat-h" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-xxl md:px-lg">
          <Overline>What’s traded</Overline>
          <h2 id="cat-h" className="text-h2 text-text-strong">
            Industrial scrap and surplus, by category
          </h2>
          <ul className="mt-lg grid grid-cols-2 gap-sm sm:gap-md lg:grid-cols-4">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/auctions?cat=${c.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface hover:border-primary"
                >
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={c.image}
                      alt={c.alt}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-sm sm:p-md">
                    <span className="flex items-center justify-between gap-xs text-label-md text-text-strong sm:text-h3">
                      {c.name}
                      <ArrowRight
                        className="hidden size-4 shrink-0 text-primary sm:block"
                        aria-hidden
                      />
                    </span>
                    <span className="hidden text-body-md text-text-secondary sm:block">
                      {c.body}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-md text-body-md text-text-secondary">
            E-waste lots are listed too.{' '}
            <Link href="/auctions" className="font-medium text-primary underline">
              Browse all categories
            </Link>
          </p>
        </div>
      </section>

      {/* 5. How to start — visitors only */}
      <GuestOnly>
        <section aria-labelledby="start-h" className="mx-auto max-w-[1280px] px-4 py-xxl md:px-lg">
          <Overline>How to start</Overline>
          <h2 id="start-h" className="mb-lg text-h2 text-text-strong">
            Four steps from sign-up to your first trade
          </h2>
          <HowToStart
            cta={{
              buyer: { href: signUpHref('buyer'), label: 'Create a buyer account' },
              seller: { href: signUpHref('seller'), label: 'Create a seller account' },
            }}
          />
        </section>
      </GuestOnly>

      {/* 6. Why Bid ON */}
      <section aria-labelledby="why-h" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-xl px-4 py-xxl md:px-lg lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
            <Image
              src="/images/home/step-weighbridge.jpg"
              alt="Weighbridge operator recording a truck’s weight on the terminal"
              fill
              sizes="(min-width: 1024px) 42vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <Overline>Why Bid ON</Overline>
            <h2 id="why-h" className="text-h2 text-text-strong">
              Built for trading material you can’t see in person
            </h2>
            <ul className="mt-lg grid gap-lg sm:grid-cols-2">
              {WHY.map(({ Icon, title, body }) => (
                <li key={title} className="flex flex-col gap-xs">
                  <Icon className="size-6 text-primary" aria-hidden />
                  <h3 className="text-h3 text-text-strong">{title}</h3>
                  <p className="text-body-md text-text-secondary">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 7. Lot Assurance, briefly */}
      <section aria-labelledby="la-h" className="mx-auto max-w-[1280px] px-4 py-xxl md:px-lg">
        <div className="flex flex-col gap-md rounded-lg bg-primary-container p-lg md:flex-row md:items-center md:justify-between">
          <div className="flex gap-md">
            <div>
              <LotAssuranceBadge className="mb-xs" />
              <h2 id="la-h" className="text-h3 text-text-strong">
                Buying steel? Look for Lot Assurance.
              </h2>
              <p className="max-w-[720px] text-body-md text-text">
                On eligible ferrous and mixed-steel lots, you see what the seller declared and the
                evidence behind it, and there’s a defined remedy if the material falls outside the
                agreed tolerance at lifting.
              </p>
            </div>
          </div>
          <ButtonLink href="/lot-assurance" className="shrink-0">
            How Lot Assurance works
          </ButtonLink>
        </div>
      </section>

      {/* Presenter controls only: one-click sample accounts. */}
      {DEMO_CONTROLS && (
        <section
          aria-labelledby="explore-h"
          className="mx-auto max-w-[1280px] px-4 pb-xxl md:px-lg"
        >
          <Overline>Demo access</Overline>
          <h2 id="explore-h" className="text-h2 text-text-strong">
            Try it from any side of the marketplace
          </h2>
          <p className="mt-1 mb-lg text-body-md text-text-secondary">
            One click, no signup. Every account and company is sample data.
          </p>
          <RoleEntry />
        </section>
      )}

      {/* 8. Call to action — visitors only */}
      <GuestOnly>
        <section aria-labelledby="cta-h" className="bg-primary">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-md px-4 py-xl md:flex-row md:items-center md:justify-between md:px-lg">
            <div>
              <h2 id="cta-h" className="text-h2 text-on-primary">
                Ready to trade?
              </h2>
              <p className="text-body-lg text-on-primary/85">
                Create your account and get your business approved — then bid or list as soon as
                you’re ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <Link
                href={signUpHref('buyer')}
                className="inline-flex h-12 items-center rounded-md bg-surface px-5 text-body-lg font-medium text-primary hover:bg-primary-container"
              >
                Create a buyer account
              </Link>
              <Link
                href={signUpHref('seller')}
                className="inline-flex h-12 items-center rounded-md border border-on-primary/60 px-5 text-body-lg font-medium text-on-primary hover:bg-primary-hover"
              >
                Create a seller account
              </Link>
            </div>
          </div>
        </section>
      </GuestOnly>
    </>
  );
}
