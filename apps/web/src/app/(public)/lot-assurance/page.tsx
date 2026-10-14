import type { Metadata } from 'next';
import { CATEGORIES, formatPct } from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { ButtonLink, Card, DemoPolicyCaption, LotAssuranceBadge, Stepper, TrustBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'How Lot Assurance works' };

const MECHANISM = ['Seller declares', 'Buyer sees evidence', 'Buyer bids', 'Checked at lifting', 'Completion or remedy'];

export default function LotAssurancePage() {
  const assured = CATEGORIES.filter((c) => c.assuranceEligible);
  return (
    <Container className="flex max-w-[960px] flex-col gap-xl">
      <PageHeader overline={<LotAssuranceBadge />} title="How Lot Assurance works">
        The auction doesn’t change. Lot Assurance makes the material, the measurement rule and the outcome if it differs clear — and gives
        AuctionIT a defined way to handle exceptions without inspecting every lot.
      </PageHeader>

      <Card className="p-lg">
        <Stepper steps={MECHANISM} current={MECHANISM.length + 1} label="Lot Assurance mechanism" />
      </Card>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 text-text-strong">Three levels of certainty</h2>
        <p className="text-body-md text-text-secondary">Every fact on an assured lot carries one of these tags, so you always know how much weight it can bear.</p>
        <div className="grid gap-md md:grid-cols-3">
          {(
            [
              ['declared', 'A claim by the seller — grade, estimated quantity, contamination. Useful, but not proof.'],
              ['evidence', 'Photos, video or documents the seller attached for you to inspect before bidding.'],
              ['confirmed', 'Measured or recorded at lifting: net weight at the agreed weighbridge, and a visual contamination check.'],
            ] as const
          ).map(([tier, body]) => (
            <Card key={tier} className="flex flex-col gap-sm">
              <TrustBadge tier={tier} className="self-start" />
              <p className="text-body-md text-text">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <h2 className="text-h2 text-text-strong">Pilot categories and tolerances</h2>
          <DemoPolicyCaption />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-body-md">
            <thead className="bg-surface-muted text-overline uppercase text-on-trust-declared">
              <tr>
                <th scope="col" className="h-10 px-md text-left">Category</th>
                <th scope="col" className="px-md text-right">Contamination limit</th>
                <th scope="col" className="px-md text-right">Quantity variance</th>
                <th scope="col" className="px-md text-left">Evidence to list</th>
              </tr>
            </thead>
            <tbody>
              {assured.map((c) => (
                <tr key={c.id} className="h-12 border-t border-border">
                  <td className="px-md">{c.label}</td>
                  <td className="px-md text-right">Up to {formatPct(c.tolerance?.contaminationCeilingPct ?? 0)}</td>
                  <td className="px-md text-right">±{c.tolerance?.quantityVariancePct}%</td>
                  <td className="px-md">
                    {c.evidence?.minPhotos}+ photos, {c.evidence?.minVideos} video (proposed)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-text-secondary">
          These values are illustrative for the demo, not approved AuctionIT terms. Other categories are listed as standard lots, which simply
          don’t have the assurance mechanism.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2 className="text-h2 text-text-strong">When something differs</h2>
        <ul className="flex list-disc flex-col gap-xs pl-lg text-body-md text-text">
          <li>Within tolerance: the transaction completes normally. You pay for the measured weight.</li>
          <li>Outside tolerance: raise a claim with evidence before loading is complete. The seller can accept a price adjustment or your exit.</li>
          <li>If the seller disputes it, AuctionIT Operations reviews the evidence and records a reasoned decision.</li>
          <li>A refund is never automatic just because a claim was raised. All payments and refunds in this demo are simulated.</li>
        </ul>
      </section>

      <div>
        <ButtonLink href="/auctions?assured=1" variant="primary">
          Explore assured lots
        </ButtonLink>
      </div>
    </Container>
  );
}
