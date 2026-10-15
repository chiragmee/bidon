'use client';

import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import { useState } from 'react';
import { ENTITY_TYPES, type EligibilityQueueRow, type EligibilityReview as Decision } from '@auctionit/domain';
import { EligibilityBadge } from '@/components/account/AccountPage';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, Field, RetryIcon, Skeleton, StatusBadge, Textarea, useToast } from '@/components/ui';
import { useData, useQuery } from '@/data';
import { useSession } from '@/lib/SessionProvider';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function Rows({ rows }: { rows: EligibilityQueueRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((r) => (
        <li key={r.companyId}>
          <Link href={`/ops/eligibility/${r.companyId}`} className="flex flex-wrap items-center justify-between gap-xs py-sm hover:bg-surface-muted">
            <span>
              <span className="block text-label-md text-text-strong">{r.legalName || r.name}</span>
              <span className="block text-caption text-text-secondary">
                {r.kind === 'seller' ? 'Seller' : 'Buyer'} · submitted {day(r.submittedAt)}
              </span>
            </span>
            <span className="flex items-center gap-xs">
              <EligibilityBadge status={r.status} />
              <ChevronRight className="size-4 text-text-secondary" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Internal reviewers: applications waiting for a decision, oldest first, then recent decisions. */
export function EligibilityQueue() {
  const { viewer } = useSession();
  const q = useQuery('eligibility-queue', (ds) => ds.eligibilityQueue(viewer), { pollMs: 15_000, enabled: viewer.role === 'ops' });
  return (
    <Container className="flex flex-col gap-lg">
      <PageHeader overline="Operations" title="Account eligibility">
        Check each application against its documents. Approve only what the documents support; ask for more information when something is missing.
      </PageHeader>
      {q.error && !q.data ? (
        <ErrorState what="We couldn’t load the queue." meaning="Nothing was changed." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      ) : !q.data ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <Card>
            <h2 className="mb-xs text-h3 text-text-strong">Waiting for review ({q.data.waiting.length})</h2>
            {q.data.waiting.length ? <Rows rows={q.data.waiting} /> : <EmptyState icon={Inbox} title="No applications waiting">New applications appear here when they’re submitted.</EmptyState>}
          </Card>
          {q.data.decided.length > 0 && (
            <Card>
              <h2 className="mb-xs text-h3 text-text-strong">Decided</h2>
              <Rows rows={q.data.decided} />
            </Card>
          )}
        </>
      )}
    </Container>
  );
}

export function EligibilityReviewPage({ id }: { id: string }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const q = useQuery(`eligibility:${id}`, (s) => s.eligibilityReview(id, viewer), { enabled: viewer.role === 'ops' });
  const [decision, setDecision] = useState<Decision['decision'] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  if (q.error && !q.data) return <Container><ErrorState what="We couldn’t load this application." meaning="Nothing was changed." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} /></Container>;
  if (q.data === undefined) return <Container><Skeleton className="h-64" /></Container>;
  const v = q.data;
  if (!v) return <Container><EmptyState icon={Inbox} headingLevel={1} title="Application not found" action={<ButtonLink href="/ops/eligibility">Back to the queue</ButtonLink>}>There’s no application for {id}.</EmptyState></Container>;
  const e = v.eligibility;
  const waiting = v.company.verification === 'pending_review';
  const rows: [string, string][] = [
    ['Account type', v.company.kind === 'seller' ? 'Seller' : 'Buyer'],
    ['Type of business', ENTITY_TYPES.find((t) => t.id === e.entityType)?.label ?? '—'],
    ['Legal name', e.legalName],
    ['PAN', e.pan],
    ['GSTIN', e.gstin || '—'],
    ['CIN / LLPIN', e.registrationNumber || '—'],
    ['Registered address', e.registeredAddress],
    ['Authorised representative', `${e.representative.name}, ${e.representative.designation}`],
    ...v.account.map((a): [string, string] => ['Account holder', `${a.name} · ${a.email}${a.phone ? ` · ${a.phone} (not verified by OTP)` : ''}`]),
  ];
  if (e.sellerDeclaration) rows.push(['Declared authority to sell', e.sellerDeclaration.authorisedToSell ? 'Yes' : 'No'], ['Material source', e.sellerDeclaration.materialSource]);
  if (e.bankDetails) rows.push(['Bank account for payments', `${e.bankDetails.accountName} · ${e.bankDetails.bankName} · ${e.bankDetails.accountNumber} · ${e.bankDetails.ifsc}`]);

  return (
    <Container className="flex max-w-[960px] flex-col gap-lg">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-caption text-text-secondary">
        <Link href="/ops/eligibility" className="hover:text-primary hover:underline">
          Account eligibility
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page">{v.company.name}</span>
      </nav>
      <PageHeader title={e.legalName || v.company.name} actions={<EligibilityBadge status={v.company.verification} />}>
        Submitted {day(e.submittedAt)}. Nothing here has been independently verified — compare each field with the documents.
      </PageHeader>
      {v.possibleDuplicates.length > 0 && (
        <Banner tone="warning" title="Possible duplicate account">
          Other accounts have a similar name: {v.possibleDuplicates.map((d) => `${d.name} (${d.kind}, ${d.status.replace('_', ' ')})`).join('; ')}. A similar name alone isn’t proof — check the PAN, GSTIN and documents.
        </Banner>
      )}
      <Card>
        <h2 className="mb-xs text-h3 text-text-strong">Application</h2>
        <dl className="grid gap-x-md gap-y-xs text-body-md sm:grid-cols-[220px_1fr]">
          {rows.map(([k, val], i) => (
            <div key={i} className="contents">
              <dt className="text-text-secondary">{k}</dt>
              <dd className="break-words text-text">{val}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="flex flex-col gap-sm">
        <h2 className="text-h3 text-text-strong">Documents</h2>
        <ul className="flex flex-col divide-y divide-border">
          {v.requirements.map((r) => {
            const files = v.documents.filter((d) => d.kind === r.kind);
            return (
              <li key={r.kind} className="flex flex-wrap items-center justify-between gap-xs py-xs">
                <span className="text-body-md text-text">
                  {r.label}
                  {r.required ? '' : ' (optional)'}
                </span>
                {files.length ? (
                  files.map((d) => (
                    <Button
                      key={d.id}
                      variant="ghost"
                      onClick={async () => {
                        setDocError(null);
                        const u = await ds.documentUrl(d.id, viewer);
                        if (!u.ok) setDocError(u.error.what);
                        else if (u.data.url) window.open(u.data.url, '_blank', 'noopener');
                        else setDocError('This file isn’t stored on this device.');
                      }}
                    >
                      Open {d.fileName}
                    </Button>
                  ))
                ) : (
                  <StatusBadge kind={r.required ? 'danger' : 'neutral'}>Not supplied</StatusBadge>
                )}
              </li>
            );
          })}
        </ul>
        {docError && <p className="text-caption text-danger">{docError}</p>}
      </Card>
      {e.review && (
        <Card>
          <h2 className="mb-xs text-h3 text-text-strong">Decision</h2>
          <p className="text-body-md text-text">
            {e.review.decision.replace('_', ' ')} by {v.reviewerNames[e.review.reviewedBy] ?? e.review.reviewedBy} on {day(e.review.reviewedAt)}
            {e.review.reason ? ` — “${e.review.reason}”` : ''}
          </p>
        </Card>
      )}
      {waiting && (
        <Card className="flex flex-col gap-md">
          <h2 className="text-h3 text-text-strong">Decide</h2>
          <Field label="Reason (shown to the applicant)" helper="Required to ask for information or reject. Recommended when approving.">
            <Textarea value={reason} onChange={(ev) => (setReason(ev.target.value), setError(null))} />
          </Field>
          {error && <Banner tone="danger" title={error} />}
          <div className="flex flex-wrap gap-xs">
            <Button variant="primary" onClick={() => setDecision('approved')}>
              Approve
            </Button>
            <Button onClick={() => setDecision('needs_info')}>Ask for more information</Button>
            <Button variant="danger" onClick={() => setDecision('rejected')}>
              Reject
            </Button>
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        busy={busy}
        title={decision === 'approved' ? 'Approve this account?' : decision === 'needs_info' ? 'Ask for more information?' : 'Reject this application?'}
        consequence={
          decision === 'approved'
            ? `${v.company.kind === 'seller' ? 'They can publish auctions' : 'They can pay EMDs and bid'}. Your name and the time are recorded.`
            : 'The applicant sees your reason. Your name and the time are recorded.'
        }
        confirmLabel={decision === 'approved' ? 'Approve' : decision === 'needs_info' ? 'Send request' : 'Reject'}
        onConfirm={async () => {
          if (!decision) return;
          setBusy(true);
          const r = await ds.reviewEligibility(id, { decision, reason }, viewer);
          setBusy(false);
          setDecision(null);
          if (!r.ok) return setError(`${r.error.what} ${r.error.next}`);
          toast.show('Decision recorded.', 'success');
          q.reload();
        }}
      />
    </Container>
  );
}
