import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { DOCUMENT_LABEL, documentRequirements, PAYMENT_METHODS, policyFor } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { ButtonLink, Card } from '@/components/ui';
import { signUpHref } from '@/lib/links';
import { GuestOnly } from '@/components/auth/GuestOnly';

export const metadata: Metadata = { title: 'How it works' };

/** The full Phase 1 process, once (docs/HOMEPAGE.md). Rules shown here come from packages/domain, not copy. */

const NAV = [
  ['who', 'Who can trade'],
  ['buyers', 'For buyers'],
  ['sellers', 'For sellers'],
  ['documents', 'Documents'],
  ['payments', 'Deposits and payments'],
  ['closing', 'How auctions close'],
  ['faq', 'Questions'],
] as const;

const deadline = policyFor('ferrous_hms').paymentDeadlineHours;

const BUYER_STEPS = [
  ['Create your account', 'Sign up as a buyer with your work email and a password, and confirm your email from the link we send.'],
  ['Get your business approved', 'Add your business details and upload the documents listed below. A reviewer checks them and approves your account, or tells you exactly what’s missing.'],
  ['Find a lot and check it', 'Read the grade, estimated quantity, location, photos and the seller’s track record. The lot shows whether the reserve has been met and every bid placed.'],
  ['Pay the EMD and report it', 'Pay the lot’s refundable deposit (EMD) to the seller’s bank account shown on the lot, then report the payment with its UTR. You can do this before bidding opens.'],
  ['Bid', 'Once the seller confirms your EMD, bid at or above the minimum shown. A placed bid can’t be withdrawn.'],
  ['Win, pay the balance, lift', `If yours is the highest bid that meets the reserve, pay the balance to the seller within ${deadline} hours and report it. Then propose a lifting date; the seller confirms it.`],
  ['Weigh and complete', 'The truck is weighed at the agreed weighbridge. You pay for the measured quantity, and any overpayment is refunded by the seller and recorded here.'],
] as const;

const SELLER_STEPS = [
  ['Create your account', 'Sign up as a seller with your work email and a password, and confirm your email.'],
  ['Get your business approved', 'Add business details, GST, proof of the yard where material is lifted, and the bank account buyers will pay into. A reviewer approves your account.'],
  ['List your lot', 'Describe the material, upload photos, set the estimated quantity, reserve price, EMD and auction dates. Preview it as a buyer sees it, then publish. You can prepare drafts before approval.'],
  ['Confirm deposits', 'Buyers pay EMDs into your account and report them. Check your statement and confirm or reject each one — only confirmed buyers can bid.'],
  ['After the auction', 'The highest bid that meets your reserve wins automatically. Confirm the balance when it arrives, confirm the lifting date, and record EMD refunds to the other bidders.'],
] as const;

const FAQ = [
  ['Does Bid ON hold my money?', 'No. Buyers pay sellers directly by bank transfer, UPI, cheque or demand draft. Bid ON records who reported each payment, who confirmed it and when — both sides see the same record.'],
  ['What if the seller says they didn’t receive my payment?', 'They must give a reason when rejecting it. You’ll see the reason, can correct the details (for example the UTR) and report it again; the earlier report stays in the history.'],
  ['When is my EMD returned?', 'If you don’t win, or the lot doesn’t sell, the seller owes your EMD back and records the refund with its bank reference. If you win, it counts towards the price.'],
  ['Can I be both a buyer and a seller?', 'No. Each person and business holds one account, as a buyer or a seller. The same PAN or GSTIN can’t open a second account.'],
  ['How long does approval take?', 'A reviewer checks each application by hand. You’ll be notified of the decision; if anything is missing, you’re told exactly what and can resubmit.'],
  ['What if the material isn’t as described?', 'Lots with Lot Assurance (eligible steel lots) have a defined claim process before loading completes. On other lots, check the photos and details carefully before bidding.'],
] as const;

function Steps({ steps }: { steps: readonly (readonly [string, string])[] }) {
  return (
    <ol className="flex flex-col gap-sm">
      {steps.map(([title, body], i) => (
        <li key={title} className="flex gap-md rounded-lg border border-border bg-surface p-md">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-label-md text-primary">{i + 1}</span>
          <span>
            <span className="block text-h3 text-text-strong">{title}</span>
            <span className="mt-1 block text-body-md text-text-secondary">{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function DocList({ account }: { account: "buyer" | "seller" }) {
  // Required documents for a company; a proprietor doesn't need an authorisation letter.
  const docs = documentRequirements(account, "private_limited");
  return (
    <ul className="flex flex-col gap-xs text-body-md">
      {docs.map((d) => (
        <li key={d.kind} className="flex flex-col">
          <span className="text-text-strong">
            {DOCUMENT_LABEL[d.kind]}
            {!d.required && <span className="text-text-secondary"> (if applicable)</span>}
          </span>
          <span className="text-caption text-text-secondary">{d.hint}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HowItWorksPage() {
  return (
    <Container className="flex flex-col gap-xl">
      <PageHeader title="How Bid ON works" overline="Guide">
        Everything a buyer or seller needs to know, from creating an account to the weighbridge.
      </PageHeader>

      <nav aria-label="On this page" className="-mt-md flex flex-wrap gap-xs">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-border bg-surface px-sm py-1 text-label-md text-text hover:border-primary hover:text-primary">
            {label}
          </a>
        ))}
      </nav>

      <section id="who" aria-labelledby="who-h" className="scroll-mt-24">
        <h2 id="who-h" className="text-h2 text-text-strong">
          Who can trade
        </h2>
        <p className="mt-xs max-w-[760px] text-body-lg text-text-secondary">
          Registered Indian businesses — sole proprietorships, partnership firms, LLPs, and private or public limited companies. Each business holds one account, as a buyer or a seller, and
          can trade once a reviewer approves it. Anyone can browse auctions without an account.
        </p>
      </section>

      <section id="buyers" aria-labelledby="buyers-h" className="grid scroll-mt-24 gap-lg lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 id="buyers-h" className="mb-md text-h2 text-text-strong">
            For buyers
          </h2>
          <Steps steps={BUYER_STEPS} />
          <GuestOnly>
            <div className="mt-md">
              <ButtonLink href={signUpHref('buyer')} variant="primary">
                Create a buyer account
              </ButtonLink>
            </div>
          </GuestOnly>
        </div>
        <div className="relative hidden min-h-[320px] overflow-hidden rounded-lg lg:block">
          <Image src="/images/home/step-inspection.jpg" alt="Thickness gauge and caliper on a steel plate" fill sizes="35vw" className="object-cover" />
        </div>
      </section>

      <section id="sellers" aria-labelledby="sellers-h" className="grid scroll-mt-24 gap-lg lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 id="sellers-h" className="mb-md text-h2 text-text-strong">
            For sellers
          </h2>
          <Steps steps={SELLER_STEPS} />
          <GuestOnly>
            <div className="mt-md">
              <ButtonLink href={signUpHref('seller')}>Create a seller account</ButtonLink>
            </div>
          </GuestOnly>
        </div>
        <div className="relative hidden min-h-[320px] overflow-hidden rounded-lg lg:block">
          <Image src="/images/home/cat-ferrous-hms.jpg" alt="Sorted heavy melting steel scrap in a seller’s yard" fill sizes="35vw" className="object-cover" />
        </div>
      </section>

      <section id="documents" aria-labelledby="docs-h" className="scroll-mt-24">
        <h2 id="docs-h" className="text-h2 text-text-strong">
          Documents for approval
        </h2>
        <p className="mt-xs max-w-[760px] text-body-md text-text-secondary">
          PDF or a clear photo, up to 10 MB each. Documents are private: only you and Bid ON’s reviewers can open them. A sole proprietor doesn’t need an
          authorisation letter.
        </p>
        <div className="mt-md grid gap-md md:grid-cols-2">
          <Card>
            <h3 className="mb-sm text-h3 text-text-strong">Buyers</h3>
            <DocList account="buyer" />
          </Card>
          <Card>
            <h3 className="mb-sm text-h3 text-text-strong">Sellers</h3>
            <DocList account="seller" />
          </Card>
        </div>
      </section>

      <section id="payments" aria-labelledby="pay-h" className="scroll-mt-24">
        <h2 id="pay-h" className="text-h2 text-text-strong">
          Deposits and payments
        </h2>
        <p className="mt-xs max-w-[760px] text-body-md text-text-secondary">
          Bid ON doesn’t collect or move money. Buyers pay the seller directly ({PAYMENT_METHODS.map((m) => m.label).join(', ')}), report the payment with its
          reference, and the seller confirms it once it reaches their account.
        </p>
        <div className="mt-md grid gap-md md:grid-cols-3">
          {[
            ['EMD (earnest money deposit)', 'Paid once per lot before bidding, to the seller. Counts towards the price if you win; owed back to you if you don’t, or if the lot doesn’t sell.'],
            ['Balance', `Due within ${deadline} hours of winning: the estimated value minus your EMD. The transaction moves on only when the seller confirms receiving it.`],
            ['Refunds', 'If the weighed quantity is lower than what you paid for, or an assured lot’s claim ends in an exit, the seller refunds you and records the refund here.'],
          ].map(([title, body]) => (
            <Card key={title} className="flex flex-col gap-xs">
              <h3 className="text-h3 text-text-strong">{title}</h3>
              <p className="text-body-md text-text-secondary">{body}</p>
            </Card>
          ))}
        </div>
        <p className="mt-sm text-caption text-text-secondary">Deadlines, forfeiture and refund rules are provisional and will be confirmed in Bid ON’s terms.</p>
      </section>

      <section id="closing" aria-labelledby="close-h" className="grid scroll-mt-24 gap-lg lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <h2 id="close-h" className="text-h2 text-text-strong">
            How auctions close
          </h2>
          <ul className="mt-md flex list-disc flex-col gap-xs pl-lg text-body-md text-text">
            <li>Bids are accepted only while a lot is live, between its opening and closing times.</li>
            <li>Each bid must beat the current highest bid by the lot’s minimum increment (or start above the reserve).</li>
            <li>At the closing time, the highest bid that meets the reserve wins. If none does, the lot closes unsold.</li>
            <li>Bids can’t be withdrawn, and sellers can’t edit a live lot, change the reserve after bidding starts, or bid on their own lots.</li>
            <li>The final price is the winning rate × the quantity measured at the weighbridge at lifting.</li>
          </ul>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
          <Image src="/images/home/step-weighbridge.jpg" alt="Weighbridge operator recording a truck’s weight" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-h" className="scroll-mt-24">
        <h2 id="faq-h" className="text-h2 text-text-strong">
          Questions
        </h2>
        <div className="mt-md flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-lg py-md">
              <summary className="cursor-pointer list-none text-h3 text-text-strong marker:hidden">
                <span className="flex items-center justify-between gap-sm">
                  {q}
                  <span aria-hidden className="text-primary transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-xs text-body-md text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-md text-body-md text-text-secondary">
          Buying steel? Read{' '}
          <Link href="/lot-assurance" className="font-medium text-primary underline">
            how Lot Assurance works
          </Link>
          .
        </p>
      </section>
    </Container>
  );
}
