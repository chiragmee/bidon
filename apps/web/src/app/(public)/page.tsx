import { Camera, Scale, ShieldCheck } from 'lucide-react';
import { ButtonLink, LotAssuranceBadge, Overline } from '@/components/ui';
import { FeaturedLots } from '@/components/marketing/FeaturedLots';
import { RoleEntry } from '@/components/marketing/RoleEntry';
import { DEMO_CONTROLS } from '@/lib/flags';

const BUYER_STEPS = ['Find a lot', 'Review details and evidence', 'Pay EMD and bid', 'Win', 'Pay and lift'];
const SELLER_STEPS = ['Create a listing', 'Set reserve and auction dates', 'Receive bids', 'Complete the sale'];

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-lg">
      <h3 className="text-h3 text-text-strong">{title}</h3>
      <ol className="mt-md flex flex-col gap-sm">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-container text-caption text-primary">{i + 1}</span>
            <span className="text-body-lg text-text">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Landing() {
  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-xl px-4 py-xxl md:px-lg lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <Overline>Industrial scrap and surplus auctions</Overline>
            <h1 className="mt-xs text-[2rem] leading-[2.5rem] font-semibold tracking-tight text-text-strong md:text-display">
              Industrial surplus. Competitive bidding. Clearer transactions.
            </h1>
            <p className="mt-md max-w-[560px] text-body-lg text-text-secondary">
              AuctionIT helps businesses buy and sell industrial scrap and surplus through online auctions — with clear
              lot details, a deposit to bid, and a defined process from winning bid to lifting.
            </p>
            <div className="mt-lg flex flex-wrap gap-sm">
              <ButtonLink href="/auctions" variant="primary" size="lg">
                Explore auctions
              </ButtonLink>
              <ButtonLink href="/sign-in?as=seller" size="lg">
                Sell surplus
              </ButtonLink>
            </div>
            <p className="mt-md flex flex-wrap items-center gap-xs text-body-md text-text-secondary">
              <LotAssuranceBadge /> is available on eligible steel lots only.{' '}
              <a href="#lot-assurance" className="font-medium text-primary underline">
                Learn how it works
              </a>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-canvas p-lg">
            <p className="text-overline uppercase text-text-secondary">How a lot moves</p>
            <ol className="mt-sm flex flex-col gap-xs text-body-md">
              {['Seller lists and declares the material', 'Buyers review evidence and pay EMD', 'Highest bid meeting the reserve wins', 'Winner pays the balance and lifts', 'Quantity measured at the weighbridge'].map((s, i) => (
                <li key={s} className="flex items-center gap-sm rounded-md bg-surface px-sm py-xs">
                  <span className="text-caption text-text-secondary">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-text">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {DEMO_CONTROLS && (
        <section aria-labelledby="explore-h" className="mx-auto max-w-[1280px] px-4 py-xxl md:px-lg">
          <Overline>Demo access</Overline>
          <h2 id="explore-h" className="text-h2 text-text-strong">Try it from any side of the marketplace</h2>
          <p className="mt-1 mb-lg text-body-md text-text-secondary">One click, no signup. Every account and company is sample data.</p>
          <RoleEntry />
        </section>
      )}

      <section aria-labelledby="how-h" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-xxl md:px-lg">
          <h2 id="how-h" className="text-h2 text-text-strong">How it works</h2>
          <div className="mt-lg grid gap-lg md:grid-cols-2">
            <Steps title="For buyers" steps={BUYER_STEPS} />
            <Steps title="For sellers" steps={SELLER_STEPS} />
          </div>
        </div>
      </section>

      <section id="lot-assurance" aria-labelledby="la-h" className="mx-auto max-w-[1280px] scroll-mt-20 px-4 py-xxl md:px-lg">
        <div className="flex flex-col gap-xs">
          <LotAssuranceBadge className="self-start" />
          <h2 id="la-h" className="text-h2 text-text-strong">Lot Assurance: the auction stays the same, the lot gets clearer</h2>
          <p className="max-w-[720px] text-body-lg text-text-secondary">
            On eligible ferrous and mixed-steel lots, buyers see what the seller declared, what evidence backs it, how the
            quantity is measured, and what happens if the material falls outside an agreed tolerance.
          </p>
        </div>
        <ul className="mt-lg grid gap-md md:grid-cols-3">
          {[
            { Icon: Camera, title: 'Structured declaration and evidence', body: 'The seller declares grade, quantity and contamination, and attaches yard photos and a video you can inspect before bidding.' },
            { Icon: Scale, title: 'Quantity measured at lifting', body: 'You pay for the net weight measured at a mutually agreed certified weighbridge, not the listing estimate.' },
            { Icon: ShieldCheck, title: 'Defined remedies outside tolerance', body: 'If an assured lot falls outside its tolerance, a price adjustment or exit applies — subject to evidence and a claim raised before loading completes.' },
          ].map(({ Icon, title, body }) => (
            <li key={title} className="rounded-lg border border-border bg-surface p-lg">
              <Icon className="size-6 text-primary" aria-hidden />
              <h3 className="mt-sm text-h3 text-text-strong">{title}</h3>
              <p className="mt-xs text-body-md text-text-secondary">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-md text-caption text-text-secondary">
          Not every lot is assured. Tolerances and remedies shown are provisional, not yet approved AuctionIT terms.
        </p>
        <div className="mt-lg">
          <ButtonLink href="/auctions?assured=1">Explore assured lots</ButtonLink>
        </div>
      </section>

      <section aria-labelledby="featured-h" className="mx-auto max-w-[1280px] px-4 pb-xl md:px-lg">
        <div className="mb-lg flex flex-wrap items-end justify-between gap-sm">
          <div>
            <h2 id="featured-h" className="text-h2 text-text-strong">Featured lots</h2>
            <p className="text-body-md text-text-secondary">Assured and standard lots side by side.</p>
          </div>
          <ButtonLink href="/auctions" variant="ghost">
            See all auctions
          </ButtonLink>
        </div>
        <FeaturedLots />
      </section>
    </>
  );
}
