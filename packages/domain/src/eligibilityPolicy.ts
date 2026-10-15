import type { Company, DocumentKind, EntityType, PaymentMethod, Rejection, VerificationStatus } from './types';

/**
 * Eligibility requirements (docs/PHASE1_MVP.md, D-088). Provisional: what a reviewer needs to decide whether a
 * business may bid or sell. Uploading a document only means it was supplied — a reviewer reads it; nothing here is
 * independently verified.
 */
export const ENTITY_TYPES: { id: EntityType; label: string; hasRegistrationNumber: boolean }[] = [
  { id: 'proprietorship', label: 'Sole proprietorship', hasRegistrationNumber: false },
  { id: 'partnership', label: 'Partnership firm', hasRegistrationNumber: false },
  { id: 'llp', label: 'Limited liability partnership (LLP)', hasRegistrationNumber: true },
  { id: 'private_limited', label: 'Private limited company', hasRegistrationNumber: true },
  { id: 'public_limited', label: 'Public limited company', hasRegistrationNumber: true },
];

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  pan_card: 'PAN card',
  gst_certificate: 'GST registration certificate',
  constitution: 'Constitution document',
  address_proof: 'Registered address proof',
  representative_id: 'Authorised representative’s photo ID',
  authorisation_letter: 'Authorisation letter or board resolution',
  premises_proof: 'Yard or premises proof',
  cancelled_cheque: 'Cancelled cheque or bank letter',
  payment_receipt: 'Payment receipt',
};

/** What "constitution document" means for each entity type. */
export const CONSTITUTION_HINT: Record<EntityType, string> = {
  proprietorship: 'Shop and establishment registration, Udyam certificate or trade licence',
  partnership: 'Partnership deed',
  llp: 'LLP incorporation certificate and LLP agreement',
  private_limited: 'Certificate of incorporation',
  public_limited: 'Certificate of incorporation',
};

export interface DocumentRequirement {
  kind: DocumentKind;
  required: boolean;
  hint: string;
}

/** Documents for an application. Sellers add premises proof and a bank proof for receiving payments. */
export function documentRequirements(role: 'buyer' | 'seller', entityType: EntityType | null): DocumentRequirement[] {
  const company = entityType !== null && entityType !== 'proprietorship';
  const list: DocumentRequirement[] = [
    { kind: 'pan_card', required: true, hint: entityType === 'proprietorship' ? 'The proprietor’s PAN' : 'The business’s PAN' },
    { kind: 'gst_certificate', required: role === 'seller', hint: role === 'seller' ? 'Required to sell' : 'If the business is GST-registered' },
    { kind: 'constitution', required: true, hint: entityType ? CONSTITUTION_HINT[entityType] : 'Depends on the type of business' },
    { kind: 'address_proof', required: true, hint: 'Utility bill, lease or property document for the registered address (under 3 months old)' },
    { kind: 'representative_id', required: true, hint: 'Aadhaar (masked), passport, voter ID or driving licence of the person acting for the business' },
    { kind: 'authorisation_letter', required: company, hint: company ? 'Authorises the representative to act for the business' : 'Not needed for a sole proprietor acting personally' },
  ];
  if (role === 'seller') {
    list.push(
      { kind: 'premises_proof', required: true, hint: 'Factory licence, lease or other proof that you hold the yard where material is lifted' },
      { kind: 'cancelled_cheque', required: true, hint: 'For the account buyers pay EMD and balance into' },
    );
  }
  return list;
}

/** GSTIN is required to sell; buyers give it if they are registered (D-088). */
export const gstinRequired = (role: 'buyer' | 'seller') => role === 'seller';

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; referenceLabel: string }[] = [
  { id: 'neft', label: 'NEFT', referenceLabel: 'UTR number' },
  { id: 'rtgs', label: 'RTGS', referenceLabel: 'UTR number' },
  { id: 'imps', label: 'IMPS', referenceLabel: 'IMPS reference (RRN)' },
  { id: 'upi', label: 'UPI', referenceLabel: 'UPI transaction ID' },
  { id: 'cheque', label: 'Cheque', referenceLabel: 'Cheque number' },
  { id: 'demand_draft', label: 'Demand draft', referenceLabel: 'DD number' },
];

// ── Identifier formats (format only — not a check against any government register) ──

export const normalisePan = (v: string) => v.replace(/\s+/g, '').toUpperCase();
export const normaliseGstin = (v: string) => v.replace(/\s+/g, '').toUpperCase();

export function validatePan(v: string): string | null {
  const p = normalisePan(v);
  if (!p) return 'Enter the PAN.';
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) return 'A PAN has 10 characters: 5 letters, 4 digits, 1 letter (for example ABCDE1234F).';
  return null;
}

/** GSTIN: 2-digit state code, the PAN, entity number, 'Z', check character. Must contain the same PAN. */
export function validateGstin(v: string, pan: string): string | null {
  const g = normaliseGstin(v);
  if (!g) return 'Enter the GSTIN.';
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return 'A GSTIN has 15 characters, for example 27ABCDE1234F1Z5.';
  if (normalisePan(pan) && g.slice(2, 12) !== normalisePan(pan)) return 'The GSTIN doesn’t contain the PAN you entered. Check both.';
  return null;
}

export function validateRegistrationNumber(v: string, entityType: EntityType): string | null {
  const r = v.replace(/\s+/g, '').toUpperCase();
  if (entityType === 'llp') return /^[A-Z]{3}-?[0-9]{4}$/.test(r) ? null : 'An LLPIN looks like AAB-1234.';
  if (entityType === 'private_limited' || entityType === 'public_limited') {
    return /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(r) ? null : 'A CIN has 21 characters, for example U27100MH2010PTC123456.';
  }
  return null;
}

/** Indian mobile numbers, stored as +91XXXXXXXXXX. Returns null when it isn't one. */
export function normalisePhone(v: string): string | null {
  let d = v.replace(/[\s()-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) ? `+91${d}` : null;
}

export function validateIfsc(v: string): string | null {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.replace(/\s+/g, '').toUpperCase()) ? null : 'An IFSC has 11 characters, for example HDFC0001234.';
}

/** Legal names compared for the reviewer's "possible duplicate" flag only — never to refuse an application. */
export function normaliseName(v: string): string {
  return v
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|co|company|and|&|the|m\/s|ms)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Approved (or a seeded sample company) — may bid / publish. */
export function isEligible(company: Pick<Company, 'verification'> | null | undefined): boolean {
  return company?.verification === 'approved' || company?.verification === 'demo_approved';
}

export const STATUS_TEXT: Record<VerificationStatus, string> = {
  incomplete: 'Application not submitted',
  pending: 'Application not submitted',
  pending_review: 'Under review',
  approved: 'Approved',
  needs_info: 'More information needed',
  rejected: 'Not approved',
  demo_approved: 'Sample account',
};

/** Why an account can't bid or publish yet, and what to do — shared by every gate so the wording matches. */
export function eligibilityRejection(company: Pick<Company, 'verification' | 'kind'> | null | undefined): Rejection {
  const act = company?.kind === 'seller' ? 'publish auctions' : 'pay an EMD or bid';
  const what = `Your account isn’t approved to ${act} yet.`;
  switch (company?.verification) {
    case 'pending_review':
      return { code: 'not_eligible', what, next: 'Your application is under review. You’ll be notified when it’s decided.' };
    case 'needs_info':
      return { code: 'not_eligible', what, next: 'The reviewer asked for more information. Open your account page, update the application and resubmit.' };
    case 'rejected':
      return { code: 'not_eligible', what, next: 'Your application was not approved. See the reason on your account page.' };
    default:
      return { code: 'not_eligible', what, next: 'Complete your business verification on your account page and submit it for review.' };
  }
}


/** Private documents: PDF or a photo/scan, up to 10 MB (matches the account-documents bucket). */
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export function validateDocumentFile(f: { name: string; type: string; size: number }): string | null {
  if (!DOCUMENT_TYPES.includes(f.type)) return `${f.name} isn’t a PDF, JPEG, PNG or WebP file.`;
  if (f.size > 10 * 1024 * 1024) return `${f.name} is larger than 10 MB.`;
  if (f.size === 0) return `${f.name} is empty.`;
  return null;
}
