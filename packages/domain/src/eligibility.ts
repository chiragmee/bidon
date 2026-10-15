/**
 * Account eligibility (docs/PHASE1_MVP.md): a business applies with its legal details and documents, a reviewer
 * approves, asks for more information, or rejects. Only approved buyers bid and only approved sellers publish.
 * Pure over a state snapshot, like operations.ts.
 */
import type { Actor } from './context';
import { audit } from './context';
import {
  DOCUMENT_LABEL,
  STATUS_TEXT,
  isEligible,
  ENTITY_TYPES,
  documentRequirements,
  gstinRequired,
  normaliseGstin,
  normaliseName,
  normalisePan,
  validateGstin,
  validateIfsc,
  validatePan,
  validateRegistrationNumber,
} from './eligibilityPolicy';
import type { OpResult } from './operations';
import { clone, stateCtx } from './operations';
import type { DemoState } from './seed';
import type { AccountDocument, Company, DocumentKind, Eligibility, EligibilityReview, Iso, Rejection, User, VerificationStatus } from './types';
import type { Viewer } from './views';
import { REGION_LABEL, regionOf, stateByCode, type Region } from './regions';
import { companyRegion, coversCompany, staffAccess, staffForRegion } from './staff';

export type { DocumentRequirement } from './eligibilityPolicy';
export { STATUS_TEXT, eligibilityRejection, isEligible } from './eligibilityPolicy';

const emptyEligibility = (): Eligibility => ({
  entityType: null,
  legalName: '',
  pan: '',
  gstin: '',
  registrationNumber: '',
  registeredAddress: '',
  state: '',
  representative: { name: '', designation: '' },
  sellerDeclaration: null,
  bankDetails: null,
  documentIds: [],
  submittedAt: null,
  review: null,
  history: [],
});

/** The copy of a company in a freshly cloned state; it exists because it was found in the source state. */
function mutableCompany(next: DemoState, id: string): Company {
  const c = next.companies.find((x) => x.id === id);
  /* v8 ignore next -- cloned from a state where it was found */
  if (!c) throw new Error(`company ${id} missing after clone`);
  return c;
}

function rejected<T>(state: DemoState, code: string, what: string, next: string): OpResult<T> {
  return { ok: false, state, error: { code, what, next } };
}

/** The signed-in user's own company, if they are its account holder. */
function ownCompany(state: DemoState, actor: Actor): { user: User; company: Company } | null {
  const user = state.users.find((u) => u.id === actor.id);
  const company = user?.companyId ? state.companies.find((c) => c.id === user.companyId) : undefined;
  return user && company ? { user, company } : null;
}

const editable = (v: VerificationStatus) => v === 'incomplete' || v === 'pending' || v === 'needs_info';

export type EligibilityInput = Omit<Eligibility, 'documentIds' | 'submittedAt' | 'review' | 'history'>;

/** Save the application as a draft. Allowed until submitted, and again when the reviewer asks for more information. */
export function saveEligibility(state: DemoState, input: EligibilityInput, actor: Actor, now: Iso): OpResult<Eligibility> {
  const own = ownCompany(state, actor);
  if (!own || (actor.role !== 'buyer' && actor.role !== 'seller')) return rejected(state, 'forbidden', 'Only a buyer or seller account holder can edit its application.', 'Sign in to your own account.');
  if (!editable(own.company.verification)) {
    return rejected(state, 'not_editable', `The application can’t be changed while it is “${STATUS_TEXT[own.company.verification]}”.`, 'You’ll be told if the reviewer needs anything else.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const company = mutableCompany(next, own.company.id);
  const prev = company.eligibility ?? emptyEligibility();
  const e: Eligibility = {
    ...prev,
    entityType: input.entityType,
    legalName: input.legalName.trim(),
    pan: normalisePan(input.pan),
    gstin: normaliseGstin(input.gstin),
    registrationNumber: input.registrationNumber.replace(/\s+/g, '').toUpperCase(),
    registeredAddress: input.registeredAddress.trim(),
    state: stateByCode(input.state)?.code ?? '',
    representative: { name: input.representative.name.trim(), designation: input.representative.designation.trim() },
    sellerDeclaration: company.kind === 'seller' ? (input.sellerDeclaration ?? { authorisedToSell: false, materialSource: '' }) : null,
    bankDetails:
      company.kind === 'seller' && input.bankDetails
        ? { ...input.bankDetails, ifsc: input.bankDetails.ifsc.replace(/\s+/g, '').toUpperCase(), accountNumber: input.bankDetails.accountNumber.replace(/\s+/g, '') }
        : null,
    history: [...prev.history, { action: 'saved', by: actor.id, at: now, reason: null }],
  };
  company.eligibility = e;
  if (company.verification === 'pending') company.verification = 'incomplete';
  next.audit.push(audit(ctx, { entity: 'company', entityId: company.id, action: 'save_eligibility', to: company.verification }));
  return { ok: true, state: next, value: e };
}

/** Store an uploaded private file for the actor's company (eligibility document or payment receipt). */
export function addDocument(state: DemoState, doc: Omit<AccountDocument, 'id' | 'companyId' | 'uploadedAt' | 'uploadedBy'> & { id?: string }, actor: Actor, now: Iso): OpResult<AccountDocument> {
  const own = ownCompany(state, actor);
  if (!own) return rejected(state, 'forbidden', 'Only a buyer or seller account can upload documents.', 'Sign in to your own account.');
  if (doc.kind !== 'payment_receipt' && !editable(own.company.verification)) {
    return rejected(state, 'not_editable', 'Documents can’t be changed while the application is under review or decided.', 'You’ll be told if the reviewer needs anything else.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const stored: AccountDocument = { ...doc, id: doc.id ?? ctx.newId('DOC'), companyId: own.company.id, uploadedAt: now, uploadedBy: actor.id };
  next.documents.push(stored);
  if (doc.kind !== 'payment_receipt') {
    const company = mutableCompany(next, own.company.id);
    const e = company.eligibility ?? emptyEligibility();
    company.eligibility = { ...e, documentIds: [...e.documentIds, stored.id] };
  }
  next.audit.push(audit(ctx, { entity: 'document', entityId: stored.id, action: 'upload', to: stored.kind }));
  return { ok: true, state: next, value: stored };
}

/** Remove one of the actor's eligibility documents while the application is still editable. */
export function removeDocument(state: DemoState, docId: string, actor: Actor, now: Iso): OpResult<null> {
  const own = ownCompany(state, actor);
  const doc = state.documents.find((d) => d.id === docId);
  if (!own || !doc || doc.companyId !== own.company.id) return rejected(state, 'not_found', 'That document isn’t on your application.', 'Refresh the page.');
  if (!editable(own.company.verification)) return rejected(state, 'not_editable', 'Documents can’t be changed while the application is under review or decided.', 'You’ll be told if the reviewer needs anything else.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const company = mutableCompany(next, own.company.id);
  if (company.eligibility) company.eligibility = { ...company.eligibility, documentIds: company.eligibility.documentIds.filter((id) => id !== docId) };
  next.audit.push(audit(ctx, { entity: 'document', entityId: docId, action: 'remove_from_application' }));
  return { ok: true, state: next, value: null };
}

export interface MissingItem {
  field: string;
  message: string;
}

/** Everything still missing or malformed before the application can be submitted. */
export function eligibilityProblems(state: DemoState, company: Company): MissingItem[] {
  const e = company.eligibility ?? emptyEligibility();
  const role = company.kind;
  const out: MissingItem[] = [];
  const need = (field: string, ok: boolean, message: string) => !ok && out.push({ field, message });
  need('entityType', !!e.entityType, 'Choose the type of business.');
  need('legalName', e.legalName.length >= 3, 'Enter the legal name exactly as registered.');
  const pan = validatePan(e.pan);
  if (pan) out.push({ field: 'pan', message: pan });
  if (e.gstin || gstinRequired(role)) {
    const g = validateGstin(e.gstin, e.pan);
    if (g) out.push({ field: 'gstin', message: role === 'seller' && !e.gstin ? 'Enter the GSTIN — it is required to sell.' : g });
  }
  if (e.entityType && ENTITY_TYPES.find((t) => t.id === e.entityType)?.hasRegistrationNumber) {
    const r = e.registrationNumber ? validateRegistrationNumber(e.registrationNumber, e.entityType) : 'Enter the CIN or LLPIN.';
    if (r) out.push({ field: 'registrationNumber', message: r });
  }
  need('registeredAddress', e.registeredAddress.length >= 10, 'Enter the full registered address.');
  need('state', !!stateByCode(e.state), 'Choose the state of the registered address.');
  need('representative', !!e.representative.name && !!e.representative.designation, 'Enter the authorised representative’s name and designation.');
  if (role === 'seller') {
    need('sellerDeclaration', !!e.sellerDeclaration?.authorisedToSell, 'Confirm that you are authorised to sell the material you will list.');
    need('materialSource', (e.sellerDeclaration?.materialSource.trim().length ?? 0) >= 10, 'Describe where your material comes from (for example, production scrap from your own plant).');
    const b = e.bankDetails;
    need('bankDetails', !!b && !!b.accountName && !!b.bankName && b.accountNumber.length >= 6, 'Enter the bank account buyers will pay into.');
    if (b?.ifsc) {
      const i = validateIfsc(b.ifsc);
      if (i) out.push({ field: 'ifsc', message: i });
    } else out.push({ field: 'ifsc', message: 'Enter the IFSC of the bank branch.' });
  }
  const docs = new Set(state.documents.filter((d) => e.documentIds.includes(d.id)).map((d) => d.kind));
  for (const r of documentRequirements(role, e.entityType)) {
    if (r.required && !docs.has(r.kind)) out.push({ field: `doc:${r.kind}`, message: `Upload: ${DOCUMENT_LABEL[r.kind]}.` });
  }
  return out;
}

/** Same legal identity already held by another account (any role) that is under review or approved. Never says which account. */
function duplicateIdentity(state: DemoState, company: Company): Rejection | null {
  const e = company.eligibility;
  if (!e) return null;
  // Only applications under review or approved hold an identity — a draft or a rejected application can't block a business.
  const clash = state.companies.some(
    (c) =>
      c.id !== company.id &&
      (c.verification === 'pending_review' || c.verification === 'approved') &&
      c.eligibility &&
      ((e.pan && c.eligibility.pan === e.pan) || (e.gstin && c.eligibility.gstin && c.eligibility.gstin === e.gstin)),
  );
  return clash
    ? {
        code: 'duplicate_identity',
        what: 'These business details are already registered with Bid ON.',
        next: 'Each business can hold one account, as a buyer or a seller. If this is your business, sign in to that account; otherwise contact Bid ON support.',
      }
    : null;
}

/** Submit for review: complete, and no other account holds the same PAN or GSTIN. */
export function submitEligibility(state: DemoState, actor: Actor, now: Iso): OpResult<Company> {
  const own = ownCompany(state, actor);
  if (!own) return rejected(state, 'forbidden', 'Only a buyer or seller account holder can submit its application.', 'Sign in to your own account.');
  if (!editable(own.company.verification)) return rejected(state, 'not_editable', `This application is already “${STATUS_TEXT[own.company.verification]}”.`, 'You’ll be notified when it’s decided.');
  const problems = eligibilityProblems(state, own.company);
  if (problems.length) {
    return rejected(state, 'incomplete_application', `The application is missing: ${problems.map((p) => p.message).join(' ')}`, 'Fill in the highlighted items, then submit again.');
  }
  const dup = duplicateIdentity(state, own.company);
  if (dup) return { ok: false, state, error: dup };
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const company = mutableCompany(next, own.company.id);
  const from = company.verification;
  company.verification = 'pending_review';
  const submitted = company.eligibility ?? emptyEligibility();
  company.eligibility = { ...submitted, submittedAt: now, history: [...submitted.history, { action: 'submitted', by: actor.id, at: now, reason: null }] };
  next.audit.push(audit(ctx, { entity: 'company', entityId: company.id, action: 'submit_eligibility', from, to: 'pending_review' }));
  // The admin and the reviewers of the applicant's region (D-102).
  for (const reviewer of staffForRegion(next, regionOf(company.eligibility.state))) {
    next.notifications.push({ id: ctx.newId('N'), userId: reviewer.id, kind: 'eligibility_submitted', title: `${company.name} applied as a ${company.kind}`, body: 'An application is waiting for review.', href: `/ops/eligibility/${company.id}`, read: false, at: now });
  }
  return { ok: true, state: next, value: company };
}

/** Reviewer's decision. A reason is required to ask for information or reject (and recommended to approve). */
export function reviewEligibility(state: DemoState, companyId: string, input: { decision: EligibilityReview['decision']; reason: string }, actor: Actor, now: Iso): OpResult<Company> {
  const access = actor.role === 'ops' ? staffAccess(state, actor.id) : null;
  if (!access) return rejected(state, 'forbidden', 'Only a Bid ON reviewer can decide applications.', 'Ask a reviewer.');
  const company = state.companies.find((c) => c.id === companyId);
  if (!company?.eligibility) return rejected(state, 'not_found', 'That application does not exist.', 'Go back to the review queue.');
  if (!coversCompany(access, company)) return rejected(state, 'other_region', 'This application is outside your regions.', 'A reviewer for its region, or the admin, decides it.');
  if (company.verification !== 'pending_review') return rejected(state, 'not_pending', `This application is “${STATUS_TEXT[company.verification]}”, not waiting for review.`, 'Go back to the review queue.');
  const reason = input.reason.trim();
  if (input.decision !== 'approved' && reason.length < 10) {
    return rejected(state, 'reason_required', 'Explain what is missing or why it is not approved (at least 10 characters).', 'The applicant sees this reason.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const c = mutableCompany(next, companyId);
  const review: EligibilityReview = { decision: input.decision, reason, reviewedBy: actor.id, reviewedAt: now };
  c.verification = input.decision;
  const reviewed = c.eligibility ?? emptyEligibility();
  c.eligibility = { ...reviewed, review, history: [...reviewed.history, { action: input.decision, by: actor.id, at: now, reason: reason || null }] };
  next.audit.push(audit(ctx, { entity: 'company', entityId: c.id, action: 'review_eligibility', from: 'pending_review', to: input.decision, reason: reason || null }));
  const title = input.decision === 'approved' ? 'Your account is approved' : input.decision === 'needs_info' ? 'More information needed for your account' : 'Your account application was not approved';
  const body = input.decision === 'approved' ? (c.kind === 'seller' ? 'You can now publish auctions.' : 'You can now pay EMDs and bid.') : reason;
  for (const u of next.users.filter((x) => x.companyId === c.id)) {
    next.notifications.push({ id: ctx.newId('N'), userId: u.id, kind: 'eligibility_decided', title, body, href: '/account', read: false, at: now });
  }
  return { ok: true, state: next, value: c };
}

/**
 * Who may open a private document: the uploading company's account holders, a reviewer, and — for a payment
 * receipt — the seller the payment was made to.
 */
export function canViewDocument(state: DemoState, docId: string, viewer: Viewer): boolean {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc || !viewer.id) return false;
  if (viewer.role === 'ops') {
    // Staff: payment receipts (claims and disputes) always; eligibility documents only for their regions.
    const access = staffAccess(state, viewer.id);
    if (!access) return false;
    if (doc.kind === 'payment_receipt') return true;
    const owner = state.companies.find((c) => c.id === doc.companyId);
    return !!owner && coversCompany(access, owner);
  }
  const user = state.users.find((u) => u.id === viewer.id);
  if (user?.companyId === doc.companyId) return true;
  if (doc.kind !== 'payment_receipt' || viewer.role !== 'seller') return false;
  const emd = state.emds.find((e) => e.payment?.receiptDocumentId === docId || e.history?.some((h) => h.type === 'submitted' && h.submission.receiptDocumentId === docId));
  if (emd) return state.lots.find((l) => l.id === emd.lotId)?.sellerId === viewer.id;
  const tx = state.transactions.find((t) => t.paymentHistory?.some((h) => h.type === 'submitted' && h.submission.receiptDocumentId === docId));
  return tx?.sellerId === viewer.id;
}

// ── Views ────────────────────────────────────────────────────────────────────

export interface DocumentView {
  id: string;
  kind: DocumentKind;
  label: string;
  fileName: string;
  uploadedAt: Iso;
}

export const docView = (d: AccountDocument): DocumentView => ({ id: d.id, kind: d.kind, label: DOCUMENT_LABEL[d.kind], fileName: d.fileName, uploadedAt: d.uploadedAt });

export interface AccountView {
  user: User;
  company: Company;
  status: VerificationStatus;
  statusText: string;
  eligible: boolean;
  editable: boolean;
  /** The single next thing to do, in plain words. */
  nextAction: string;
  eligibility: Eligibility;
  documents: DocumentView[];
  requirements: (ReturnType<typeof documentRequirements>[number] & { label: string; uploaded: boolean })[];
  problems: MissingItem[];
}

export function accountView(state: DemoState, userId: string): AccountView | null {
  const user = state.users.find((u) => u.id === userId);
  const company = user?.companyId ? state.companies.find((c) => c.id === user.companyId) : undefined;
  if (!user || !company) return null;
  const e = company.eligibility ?? emptyEligibility();
  const docs = state.documents.filter((d) => e.documentIds.includes(d.id));
  const kinds = new Set(docs.map((d) => d.kind));
  const status = company.verification === 'pending' ? 'incomplete' : company.verification;
  const nextAction: Record<VerificationStatus, string> = {
    incomplete: 'Complete your business details and documents, then submit them for review.',
    pending: 'Complete your business details and documents, then submit them for review.',
    pending_review: 'Nothing to do — a reviewer is checking your application. You’ll be notified of the decision.',
    approved: company.kind === 'seller' ? 'You can publish auctions.' : 'You can pay EMDs and bid on live auctions.',
    needs_info: 'Update your application as the reviewer asked, then submit it again.',
    rejected: 'Your application was not approved. Contact Bid ON support if you think this is a mistake.',
    demo_approved: 'Sample account — used for demonstrations only.',
  };
  return {
    user,
    company,
    status,
    statusText: STATUS_TEXT[status],
    eligible: isEligible(company),
    editable: editable(company.verification),
    nextAction: nextAction[status],
    eligibility: e,
    documents: docs.map(docView),
    requirements: documentRequirements(company.kind, e.entityType).map((r) => ({ ...r, label: DOCUMENT_LABEL[r.kind], uploaded: kinds.has(r.kind) })),
    problems: editable(company.verification) ? eligibilityProblems(state, company) : [],
  };
}

export interface EligibilityQueueRow {
  companyId: string;
  name: string;
  legalName: string;
  kind: Company['kind'];
  status: VerificationStatus;
  submittedAt: Iso | null;
  /** null = no state given yet (only the admin sees these). */
  region: Region | null;
  regionLabel: string;
  stateName: string;
}

/** Applications this staff member covers: all for the admin, their regions for a reviewer, none otherwise. */
export function eligibilityQueue(state: DemoState, viewerId: string | null | undefined): { waiting: EligibilityQueueRow[]; decided: EligibilityQueueRow[] } {
  const access = staffAccess(state, viewerId);
  const rows = state.companies
    .filter((c) => coversCompany(access, c))
    .flatMap((c): EligibilityQueueRow[] => {
      if (!c.eligibility?.submittedAt) return [];
      const region = companyRegion(c);
      return [
        {
          companyId: c.id,
          name: c.name,
          legalName: c.eligibility.legalName,
          kind: c.kind,
          status: c.verification,
          submittedAt: c.eligibility.submittedAt,
          region,
          regionLabel: region ? REGION_LABEL[region] : 'Region not set',
          stateName: stateByCode(c.eligibility.state)?.name ?? '',
        },
      ];
    })
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  return { waiting: rows.filter((r) => r.status === 'pending_review'), decided: rows.filter((r) => r.status !== 'pending_review').reverse() };
}

export interface EligibilityReviewView {
  company: Company;
  eligibility: Eligibility;
  account: { name: string; email: string; phone: string | null }[];
  documents: DocumentView[];
  requirements: (ReturnType<typeof documentRequirements>[number] & { label: string; uploaded: boolean })[];
  /** Other accounts with the same normalised legal or trading name — for the reviewer to check, not a refusal. */
  possibleDuplicates: { companyId: string; name: string; kind: Company['kind']; status: VerificationStatus }[];
  reviewerNames: Record<string, string>;
  region: Region | null;
  regionLabel: string;
  stateName: string;
  /** The viewer is the admin: may set the state of an application that has none. */
  canSetState: boolean;
}

/** One application, for a staff member who covers it (null otherwise — the API answers 404). */
export function eligibilityReview(state: DemoState, companyId: string, viewerId: string | null | undefined): EligibilityReviewView | null {
  const company = state.companies.find((c) => c.id === companyId);
  if (!company?.eligibility) return null;
  const access = staffAccess(state, viewerId);
  if (!coversCompany(access, company)) return null;
  const region = companyRegion(company);
  const e = company.eligibility;
  const docs = state.documents.filter((d) => e.documentIds.includes(d.id));
  const kinds = new Set(docs.map((d) => d.kind));
  const names = new Set([normaliseName(e.legalName), normaliseName(company.name)].filter(Boolean));
  return {
    company,
    eligibility: e,
    account: state.users.filter((u) => u.companyId === company.id).map((u) => ({ name: u.name, email: u.email, phone: u.phone ?? null })),
    documents: docs.map(docView),
    requirements: documentRequirements(company.kind, e.entityType).map((r) => ({ ...r, label: DOCUMENT_LABEL[r.kind], uploaded: kinds.has(r.kind) })),
    possibleDuplicates: state.companies
      .filter((c) => c.id !== company.id && (names.has(normaliseName(c.name)) || (c.eligibility && names.has(normaliseName(c.eligibility.legalName)))))
      .map((c) => ({ companyId: c.id, name: c.name, kind: c.kind, status: c.verification })),
    reviewerNames: Object.fromEntries(state.users.filter((u) => u.role === 'ops').map((u) => [u.id, u.name])),
    region,
    regionLabel: region ? REGION_LABEL[region] : 'Region not set',
    stateName: stateByCode(company.eligibility.state)?.name ?? '',
    canSetState: access?.level === 'admin',
  };
}
