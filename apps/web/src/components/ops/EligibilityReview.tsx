'use client';

import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import { useState } from 'react';
import { ENTITY_TYPES, INDIAN_STATES, REGIONS, REGION_LABEL, type EligibilityQueueRow, type EligibilityReview as Decision, type Region } from '@auctionit/domain';
import { EligibilityBadge } from '@/components/account/AccountPage';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, Field, RetryIcon, Select, Skeleton, StatusBadge, Textarea, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
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
              <StatusBadge kind={r.region ? 'neutral' : 'warning'}>{r.region ? `${r.regionLabel}${r.stateName ? ` · ${r.stateName}` : ''}` : 'Region not set'}</StatusBadge>
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
  const { viewer, user } = useSession();
  const q = useQuery('eligibility-queue', (ds) => ds.eligibilityQueue(viewer), { pollMs: 15_000, enabled: viewer.role === 'ops' });
  const [region, setRegion] = useState<Region | 'unset' | 'all'>('all');
  const admin = user?.staffLevel === 'admin';
  const mine = admin ? null : (user?.regions ?? []);
  const keep = (r: EligibilityQueueRow) => region === 'all' || (region === 'unset' ? r.region === null : r.region === region);
  const counts = (key: Region | 'unset') => q.data?.waiting.filter((r) => (key === 'unset' ? r.region === null : r.region === key)).length ?? 0;
  const chips: (Region | 'unset')[] = admin ? [...REGIONS, 'unset'] : (mine ?? []);
  const data = q.data ? { waiting: q.data.waiting.filter(keep), decided: q.data.decided.filter(keep) } : null;
  return (
    <Container className="flex flex-col gap-lg">
      <PageHeader overline="Operations" title="Account eligibility">
        {admin
          ? 'You see applications from every region. Check each one against its documents; approve only what the documents support.'
          : mine && mine.length
            ? `Applications from your regions: ${mine.map((r) => REGION_LABEL[r]).join(', ')}. Approve only what the documents support; ask for more information when something is missing.`
            : 'No regions are assigned to you yet — ask the Bid ON admin.'}
      </PageHeader>
      {chips.length > 1 && (
        <div role="group" aria-label="Filter by region" className="-mt-sm flex flex-wrap gap-xs">
          {(['all', ...chips] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={region === k}
              onClick={() => setRegion(k)}
              className={cn('rounded-full border px-sm py-1 text-label-md', region === k ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text hover:border-primary')}
            >
              {k === 'all' ? `All (${q.data?.waiting.length ?? 0})` : `${k === 'unset' ? 'Region not set' : REGION_LABEL[k]} (${counts(k)})`}
            </button>
          ))}
        </div>
      )}
      {q.error && !q.data ? (
        <ErrorState what="We couldn’t load the queue." meaning="Nothing was changed." next="Try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      ) : !data ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <Card>
            <h2 className="mb-xs text-h3 text-text-strong">Waiting for review ({data.waiting.length})</h2>
            {data.waiting.length ? <Rows rows={data.waiting} /> : <EmptyState icon={Inbox} title="No applications waiting">New applications appear here when they’re submitted.</EmptyState>}
          </Card>
          {data.decided.length > 0 && (
            <Card>
              <h2 className="mb-xs text-h3 text-text-strong">Decided</h2>
              <Rows rows={data.decided} />
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
  if (!v) return <Container><EmptyState icon={Inbox} headingLevel={1} title="Application not found" action={<ButtonLink href="/ops/eligibility">Back to the queue</ButtonLink>}>There’s no application for {id} in your regions.</EmptyState></Container>;
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
    ['State and region', v.region ? `${v.stateName} · ${v.regionLabel}` : 'Not given (applied before regions existed)'],
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
      {!v.region && v.canSetState && <SetState companyId={id} onDone={q.reload} />}
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

/** Admin: give an application from before regions existed its state, so the right reviewers see it. */
function SetState({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Banner tone="warning" title="This application has no state">
      <span className="block">Only you see it until it has one. Use the state in the registered address.</span>
      <span className="mt-xs flex flex-wrap items-end gap-xs">
        <Field label="State of the registered address">
          <Select value={code} onChange={(ev) => (setCode(ev.target.value), setError(null))}>
            <option value="">Choose…</option>
            {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((st) => (
              <option key={st.code} value={st.code}>
                {st.name} ({REGION_LABEL[st.region]})
              </option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={!code || busy}
          onClick={async () => {
            setBusy(true);
            const r = await ds.setApplicationState(companyId, code, viewer);
            setBusy(false);
            if (!r.ok) return setError(r.error.what);
            toast.show('State saved — the region’s reviewers can now see this application.', 'success');
            onDone();
          }}
        >
          Save state
        </Button>
      </span>
      {error && <span className="mt-xs block text-caption text-danger">{error}</span>}
    </Banner>
  );
}

