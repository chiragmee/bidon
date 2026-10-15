'use client';

import { useState } from 'react';
import {
  CONSTITUTION_HINT,
  ENTITY_TYPES,
  INDIAN_STATES,
  REGION_LABEL,
  STATUS_TEXT,
  stateByCode,
  stateFromGstin,
  type AccountView,
  type DocumentKind,
  type EligibilityInput,
  type EntityType,
  type VerificationStatus,
} from '@auctionit/domain';
import { Container, PageHeader } from '@/components/layout/Shells';
import { Banner, Button, Card, Checkbox, ErrorState, Field, Input, RetryIcon, Select, Skeleton, StatusBadge, Textarea, useToast } from '@/components/ui';
import { useData, useQuery, type DsError } from '@/data';
import { useSession } from '@/lib/SessionProvider';

const TONE: Record<VerificationStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  approved: 'success',
  demo_approved: 'neutral',
  pending_review: 'warning',
  needs_info: 'warning',
  rejected: 'danger',
  incomplete: 'neutral',
  pending: 'neutral',
};

export function EligibilityBadge({ status }: { status: VerificationStatus }) {
  return <StatusBadge kind={TONE[status]}>{STATUS_TEXT[status]}</StatusBadge>;
}

function inputFrom(v: AccountView): EligibilityInput {
  const e = v.eligibility;
  return {
    entityType: e.entityType,
    legalName: e.legalName,
    pan: e.pan,
    gstin: e.gstin,
    registrationNumber: e.registrationNumber,
    registeredAddress: e.registeredAddress,
    // Pre-filled from the GSTIN, else the state given at sign-up; the applicant confirms it.
    state: e.state || stateFromGstin(e.gstin)?.code || INDIAN_STATES.find((s) => s.name === v.company.state)?.code || '',
    representative: { ...e.representative },
    sellerDeclaration: v.company.kind === 'seller' ? (e.sellerDeclaration ?? { authorisedToSell: false, materialSource: '' }) : null,
    bankDetails: v.company.kind === 'seller' ? (e.bankDetails ?? { accountName: '', bankName: '', accountNumber: '', ifsc: '', upiId: '' }) : null,
  };
}

/** Eligibility (docs/PHASE1_MVP.md): status, the reviewer's reason, the application and its private documents. */
export function AccountPage() {
  const { viewer, session, reloadUser } = useSession();
  const q = useQuery(`account:${session.userId}`, (ds) => ds.accountView(viewer), { enabled: viewer.role === 'buyer' || viewer.role === 'seller' });

  if (q.error && !q.data) {
    return (
      <Container>
        <ErrorState what="We couldn’t load your account." meaning="Nothing was changed." next="Check your connection and try again." action={<Button onClick={q.reload} icon={<RetryIcon />}>Try again</Button>} />
      </Container>
    );
  }
  if (!q.data) {
    return (
      <Container className="flex flex-col gap-md">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
      </Container>
    );
  }
  return (
    <ApplicationForm
      key={`${q.data.status}:${q.data.documents.length}`}
      v={q.data}
      reload={() => {
        q.reload();
        reloadUser();
      }}
    />
  );
}

function ApplicationForm({ v, reload }: { v: AccountView; reload: () => void }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const toast = useToast();
  const [f, setF] = useState<EligibilityInput>(() => inputFrom(v));
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [failure, setFailure] = useState<DsError | null>(null);
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const seller = v.company.kind === 'seller';
  const ro = !v.editable;
  const problem = (field: string) => v.problems.find((p) => p.field === field)?.message;
  const entity = ENTITY_TYPES.find((t) => t.id === f.entityType);

  const set = <K extends keyof EligibilityInput>(k: K, value: EligibilityInput[K]) => setF((x) => ({ ...x, [k]: value }));

  async function save(): Promise<boolean> {
    setBusy('save');
    setFailure(null);
    const r = await ds.saveEligibility(f, viewer);
    setBusy(null);
    if (!r.ok) {
      setFailure(r.error);
      return false;
    }
    return true;
  }

  async function upload(kind: DocumentKind, file: File | undefined) {
    if (!file) return;
    // Save typed details first so a reload after the upload keeps them.
    if (!(await save())) return;
    setUploading(kind);
    const r = await ds.uploadDocument(file, kind, viewer);
    setUploading(null);
    if (!r.ok) return setFailure(r.error);
    toast.show(`${file.name} uploaded.`, 'success');
    reload();
  }

  async function submit() {
    if (!(await save())) return;
    setBusy('submit');
    const r = await ds.submitEligibility(viewer);
    setBusy(null);
    if (!r.ok) {
      setFailure(r.error);
      reload();
      return;
    }
    toast.show('Application submitted for review.', 'success');
    reload();
  }

  const review = v.eligibility.review;
  return (
    <Container className="flex max-w-[880px] flex-col gap-lg">
      <PageHeader overline={v.company.name} title="Account and verification" actions={<EligibilityBadge status={v.status} />}>
        {v.nextAction}
      </PageHeader>

      {review && v.status !== 'approved' && (
        <Banner tone={v.status === 'rejected' ? 'danger' : 'warning'} title={v.status === 'rejected' ? 'Your application was not approved' : 'The reviewer needs more information'}>
          “{review.reason}” — {new Date(review.reviewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Banner>
      )}
      {v.status === 'approved' && (
        <Banner tone="success" title="Approved">
          {seller ? 'You can publish auctions.' : 'You can pay EMDs and bid.'} AuctionIT reviewed the documents you supplied; that doesn’t make it a guarantor of your business or
          of any transaction.
        </Banner>
      )}
      {v.status === 'demo_approved' && <Banner tone="info" title="Sample account">This is a sample account used for demonstrations; it has no application.</Banner>}

      <Card className="flex flex-col gap-md">
        <h2 className="text-h3 text-text-strong">Business details</h2>
        <div className="grid gap-md sm:grid-cols-2">
          <Field label="Type of business" required error={problem('entityType')}>
            <Select value={f.entityType ?? ''} disabled={ro} onChange={(e) => set('entityType', (e.target.value || null) as EntityType | null)}>
              <option value="">Choose…</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Legal name (as registered)" required error={problem('legalName')}>
            <Input value={f.legalName} readOnly={ro} onChange={(e) => set('legalName', e.target.value)} autoComplete="organization" />
          </Field>
          <Field label={f.entityType === 'proprietorship' ? 'Proprietor’s PAN' : 'Business PAN'} required error={problem('pan')}>
            <Input value={f.pan} readOnly={ro} onChange={(e) => set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" autoComplete="off" />
          </Field>
          <Field label="GSTIN" required={seller} helper={seller ? 'Required to sell.' : 'If the business is GST-registered.'} error={problem('gstin')}>
            <Input value={f.gstin} readOnly={ro} onChange={(e) => {
                const gstin = e.target.value.toUpperCase();
                const fromGst = stateFromGstin(gstin);
                setF((x) => ({ ...x, gstin, state: x.state || fromGst?.code || '' }));
              }} placeholder="27ABCDE1234F1Z5" autoComplete="off" />
          </Field>
          {entity?.hasRegistrationNumber && (
            <Field label={f.entityType === 'llp' ? 'LLPIN' : 'CIN'} required error={problem('registrationNumber')}>
              <Input value={f.registrationNumber} readOnly={ro} onChange={(e) => set('registrationNumber', e.target.value.toUpperCase())} autoComplete="off" />
            </Field>
          )}
        </div>
        <Field label="Registered address" required error={problem('registeredAddress')}>
          <Textarea value={f.registeredAddress} readOnly={ro} onChange={(e) => set('registeredAddress', e.target.value)} />
        </Field>
        <Field
          label="State of the registered address"
          required
          error={problem('state')}
          helper={stateByCode(f.state) ? `Reviewed by the AuctionIT ${REGION_LABEL[stateByCode(f.state)!.region]} team.` : 'Decides which AuctionIT team reviews your application.'}
        >
          <Select value={f.state} disabled={ro} onChange={(e) => set('state', e.target.value)}>
            <option value="">Choose…</option>
            {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((st) => (
              <option key={st.code} value={st.code}>
                {st.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-md sm:grid-cols-2">
          <Field label="Authorised representative" required error={problem('representative')}>
            <Input value={f.representative.name} readOnly={ro} onChange={(e) => set('representative', { ...f.representative, name: e.target.value })} autoComplete="name" />
          </Field>
          <Field label="Their designation" required>
            <Input value={f.representative.designation} readOnly={ro} onChange={(e) => set('representative', { ...f.representative, designation: e.target.value })} placeholder="Director, partner, proprietor…" />
          </Field>
        </div>
      </Card>

      {seller && f.sellerDeclaration && f.bankDetails && (
        <Card className="flex flex-col gap-md">
          <h2 className="text-h3 text-text-strong">Selling and payments</h2>
          <Field label="Where does the material you sell come from?" required error={problem('materialSource')} helper="For example: process scrap from our own rolling mill, or dismantled plant we own.">
            <Textarea value={f.sellerDeclaration.materialSource} readOnly={ro} onChange={(e) => set('sellerDeclaration', { ...f.sellerDeclaration!, materialSource: e.target.value })} />
          </Field>
          <Checkbox
            label="I declare that this business owns, or is authorised to sell, the material it lists on AuctionIT, and that the details above are true."
            checked={f.sellerDeclaration.authorisedToSell}
            disabled={ro}
            onChange={(e) => set('sellerDeclaration', { ...f.sellerDeclaration!, authorisedToSell: e.target.checked })}
          />
          {problem('sellerDeclaration') && <p className="text-caption text-danger">{problem('sellerDeclaration')}</p>}
          <p className="text-body-md text-text-secondary">Buyers pay EMDs and balances into this account, then report the payment for you to confirm.</p>
          <div className="grid gap-md sm:grid-cols-2">
            <Field label="Account holder name" required error={problem('bankDetails')}>
              <Input value={f.bankDetails.accountName} readOnly={ro} onChange={(e) => set('bankDetails', { ...f.bankDetails!, accountName: e.target.value })} />
            </Field>
            <Field label="Bank" required>
              <Input value={f.bankDetails.bankName} readOnly={ro} onChange={(e) => set('bankDetails', { ...f.bankDetails!, bankName: e.target.value })} />
            </Field>
            <Field label="Account number" required>
              <Input value={f.bankDetails.accountNumber} readOnly={ro} inputMode="numeric" onChange={(e) => set('bankDetails', { ...f.bankDetails!, accountNumber: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="IFSC" required error={problem('ifsc')}>
              <Input value={f.bankDetails.ifsc} readOnly={ro} onChange={(e) => set('bankDetails', { ...f.bankDetails!, ifsc: e.target.value.toUpperCase() })} autoComplete="off" />
            </Field>
            <Field label="UPI ID" helper="Optional.">
              <Input value={f.bankDetails.upiId} readOnly={ro} onChange={(e) => set('bankDetails', { ...f.bankDetails!, upiId: e.target.value })} autoComplete="off" />
            </Field>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-md">
        <div>
          <h2 className="text-h3 text-text-strong">Documents</h2>
          <p className="text-body-md text-text-secondary">
            PDF or a clear photo, up to 10 MB each. Stored privately — only you and AuctionIT’s reviewers can open them. A reviewer reads each one; uploading alone doesn’t verify anything.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {v.requirements.map((r) => {
            const files = v.documents.filter((d) => d.kind === r.kind);
            const hint = r.kind === 'constitution' && f.entityType ? CONSTITUTION_HINT[f.entityType] : r.hint;
            return (
              <li key={r.kind} className="flex flex-col gap-xs py-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-label-md text-text-strong">
                    {r.label}
                    {r.required ? <span className="text-danger" aria-hidden> *</span> : <span className="text-caption text-text-secondary"> (optional)</span>}
                  </p>
                  <p className="text-caption text-text-secondary">{hint}</p>
                  {files.map((d) => (
                    <p key={d.id} className="text-caption text-text">
                      Uploaded: {d.fileName}
                    </p>
                  ))}
                </div>
                {!ro && (
                  <label className="shrink-0">
                    <span className="sr-only">Upload {r.label}</span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      disabled={!!uploading || !!busy}
                      className="text-caption"
                      onChange={(e) => void upload(r.kind, e.target.files?.[0])}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {failure && (
        <Banner tone="danger" title={failure.what}>
          {failure.next}
        </Banner>
      )}
      {!ro && (
        <div className="flex flex-wrap gap-xs">
          <Button variant="primary" loading={busy === 'submit'} disabled={!!busy || !!uploading} onClick={submit}>
            Submit for review
          </Button>
          <Button
            loading={busy === 'save'}
            disabled={!!busy || !!uploading}
            onClick={async () => {
              if (await save()) {
                toast.show('Saved.', 'success');
                reload();
              }
            }}
          >
            Save and finish later
          </Button>
        </div>
      )}
      {!ro && v.problems.length > 0 && (
        <p className="text-caption text-text-secondary">Still needed before you can submit: {v.problems.map((p) => p.message).join(' ')}</p>
      )}
    </Container>
  );
}
