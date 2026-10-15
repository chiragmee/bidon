import { describe, expect, it } from 'vitest';
import { accountView, addDocument, canViewDocument, eligibilityQueue, eligibilityReview, reviewEligibility, saveEligibility, submitEligibility, type EligibilityInput } from './eligibility';
import { normalisePhone, validateGstin, validatePan } from './eligibilityPolicy';
import { confirmedEmd, payment } from './fixtures';
import { saveDraft, publishLot, registerSeller } from './listings';
import { placeBid, registerBuyer } from './operations';
import { submitEmd } from './payments';
import { withoutSamples } from './samples';
import { createSeed, type DemoState } from './seed';
import type { DocumentKind } from './types';

const NOW = '2026-10-15T06:30:00.000Z';
const OPS = { id: 'U-DEVENDRA', role: 'ops' as const };

function must<T>(r: { ok: true; value: T; state: DemoState } | { ok: false; error: { code: string; what: string } }) {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.what}`);
  return r;
}

function newBuyer(s = createSeed(NOW), over: Partial<Parameters<typeof registerBuyer>[1]> = {}) {
  const r = must(registerBuyer(s, { name: 'Asha Menon', email: 'asha@newco.example', phone: '98765 43210', companyName: 'NewCo Metals', businessType: 'Scrap trader / stockist', city: 'Nagpur', state: 'Maharashtra', industry: 'Steel', materials: ['Ferrous / HMS'], ...over }, NOW));
  return { s: r.state, actor: { id: r.value.user.id, role: 'buyer' as const }, companyId: r.value.company.id };
}

const buyerApp: EligibilityInput = {
  entityType: 'private_limited',
  legalName: 'NewCo Metals Private Limited',
  pan: 'aabcn1234f',
  gstin: '27AABCN1234F1Z5',
  registrationNumber: 'U27100MH2010PTC123456',
  registeredAddress: 'Plot 4, MIDC Hingna, Nagpur 440016',
  representative: { name: 'Asha Menon', designation: 'Director' },
  sellerDeclaration: null,
  bankDetails: null,
};

const doc = (kind: DocumentKind) => ({ kind, fileName: `${kind}.pdf`, contentType: 'application/pdf', size: 1000, path: `private/${kind}` });
const BUYER_DOCS: DocumentKind[] = ['pan_card', 'constitution', 'address_proof', 'representative_id', 'authorisation_letter'];

function applied(s: DemoState, actor: { id: string; role: 'buyer' | 'seller' }, input: EligibilityInput, docs: DocumentKind[]) {
  let st = must(saveEligibility(s, input, actor, NOW)).state;
  for (const k of docs) st = must(addDocument(st, doc(k), actor, NOW)).state;
  return st;
}

describe('identifier formats', () => {
  it('PAN, GSTIN (must contain the PAN) and Indian mobile numbers', () => {
    expect(validatePan('AABCN1234F')).toBeNull();
    expect(validatePan('AABCN1234')).toMatch(/10 characters/);
    expect(validateGstin('27AABCN1234F1Z5', 'AABCN1234F')).toBeNull();
    expect(validateGstin('27AABCX1234F1Z5', 'AABCN1234F')).toMatch(/doesn’t contain the PAN/);
    expect(normalisePhone('098765 43210')).toBe('+919876543210');
    expect(normalisePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalisePhone('12345 67890')).toBeNull();
  });
});

describe('eligibility: apply → review → approved / needs info / rejected', () => {
  it('a new buyer starts incomplete; submitting needs every field and document', () => {
    const { s, actor } = newBuyer();
    expect(accountView(s, actor.id)).toMatchObject({ status: 'incomplete', eligible: false, editable: true });
    const early = submitEligibility(s, actor, NOW);
    expect(early.ok ? 'ok' : early.error.code).toBe('incomplete_application');
    const st = applied(s, actor, buyerApp, BUYER_DOCS.slice(0, 2));
    const view = accountView(st, actor.id)!;
    expect(view.eligibility).toMatchObject({ pan: 'AABCN1234F', gstin: '27AABCN1234F1Z5' });
    expect(view.problems.map((p) => p.field)).toEqual(['doc:address_proof', 'doc:representative_id', 'doc:authorisation_letter']);
  });

  it('submit → reviewer approves with identity and time; the buyer can then report an EMD', () => {
    const { s, actor, companyId } = newBuyer();
    let st = must(submitEligibility(applied(s, actor, buyerApp, BUYER_DOCS), actor, NOW)).state;
    expect(accountView(st, actor.id)).toMatchObject({ status: 'pending_review', editable: false });
    expect(st.notifications.at(-1)).toMatchObject({ userId: 'U-DEVENDRA', kind: 'eligibility_submitted', href: `/ops/eligibility/${companyId}` });
    const locked = saveEligibility(st, buyerApp, actor, NOW);
    expect(locked.ok ? 'ok' : locked.error.code).toBe('not_editable');
    expect(eligibilityQueue(st).waiting.map((r) => r.companyId)).toEqual([companyId]);

    const notReviewer = reviewEligibility(st, companyId, { decision: 'approved', reason: '' }, actor, NOW);
    expect(notReviewer.ok ? 'ok' : notReviewer.error.code).toBe('forbidden');
    st = must(reviewEligibility(st, companyId, { decision: 'approved', reason: 'Documents match the PAN and GSTIN.' }, OPS, NOW)).state;
    expect(st.companies.find((c) => c.id === companyId)?.eligibility?.review).toMatchObject({ decision: 'approved', reviewedBy: 'U-DEVENDRA', reviewedAt: NOW });
    expect(st.audit.at(-1)).toMatchObject({ action: 'review_eligibility', actorId: 'U-DEVENDRA', to: 'approved' });
    expect(st.notifications.at(-1)).toMatchObject({ userId: actor.id, kind: 'eligibility_decided' });
    expect(submitEmd(st, 'LOT-2025-0891', payment(100_000, NOW), actor, NOW).ok).toBe(true);
  });

  it('needs_info requires a reason and reopens the application; rejected is final', () => {
    const { s, actor, companyId } = newBuyer();
    let st = must(submitEligibility(applied(s, actor, buyerApp, BUYER_DOCS), actor, NOW)).state;
    const vague = reviewEligibility(st, companyId, { decision: 'needs_info', reason: 'no' }, OPS, NOW);
    expect(vague.ok ? 'ok' : vague.error.code).toBe('reason_required');
    st = must(reviewEligibility(st, companyId, { decision: 'needs_info', reason: 'Address proof is older than 3 months.' }, OPS, NOW)).state;
    expect(accountView(st, actor.id)).toMatchObject({ status: 'needs_info', editable: true, eligibility: { review: { reason: 'Address proof is older than 3 months.' } } });
    st = must(submitEligibility(must(addDocument(st, doc('address_proof'), actor, NOW)).state, actor, NOW)).state;
    st = must(reviewEligibility(st, companyId, { decision: 'rejected', reason: 'The business is not registered for this trade.' }, OPS, NOW)).state;
    expect(accountView(st, actor.id)).toMatchObject({ status: 'rejected', editable: false, eligible: false });
    expect(st.companies.find((c) => c.id === companyId)?.eligibility?.history.map((h) => h.action)).toEqual(['saved', 'submitted', 'needs_info', 'submitted', 'rejected']);
  });

  it('a pending buyer can browse and see lots but cannot bid', () => {
    const { s, actor } = newBuyer();
    const st = confirmedEmd(s, 'LOT-2025-0891', { id: 'U-RAHUL', role: 'buyer' }, NOW);
    const r = placeBid(st, { lotId: 'LOT-2025-0891', amountPerMt: 35_000, clientRequestId: 'p', seenHighestPerMt: 34_500 }, actor, NOW);
    expect(r.ok ? 'ok' : r.error.code).toBe('not_eligible');
  });

  it('a seller needs bank details, a declaration and premises proof — and approval before publishing', () => {
    const reg = must(registerSeller(createSeed(NOW), { name: 'Kavita Rao', companyName: 'Rao Metal Works', businessType: 'Fabricator', yard: 'Plot 12, MIDC', city: 'Nagpur', state: 'Maharashtra', categories: ['ferrous_hms'], email: 'kavita@raometal.example', phone: '91234 56789' }, NOW));
    const seller = { id: reg.value.user.id, role: 'seller' as const };
    const draft = must(saveDraft(reg.state, { draft: { title: 'HMS', category: 'mixed_steel' } }, seller, NOW));
    const pub = publishLot(draft.state, draft.value.id, seller, NOW);
    expect(pub.ok ? 'ok' : pub.error.code).toBe('not_eligible');
    const st = applied(draft.state, seller, { ...buyerApp, pan: 'AAFFR1234K', gstin: '', registrationNumber: '', entityType: 'partnership', legalName: 'Rao Metal Works', sellerDeclaration: { authorisedToSell: false, materialSource: '' }, bankDetails: null }, []);
    expect(accountView(st, seller.id)!.problems.map((p) => p.field)).toEqual(
      expect.arrayContaining(['gstin', 'sellerDeclaration', 'materialSource', 'bankDetails', 'ifsc', 'doc:premises_proof', 'doc:cancelled_cheque', 'doc:gst_certificate']),
    );
  });
});

describe('duplicate and cross-role accounts', () => {
  it('the same PAN or GSTIN cannot hold a second account in any role — without saying whose it is', () => {
    const a = newBuyer();
    let st = must(submitEligibility(applied(a.s, a.actor, buyerApp, BUYER_DOCS), a.actor, NOW)).state;
    const reg = must(registerSeller(st, { name: 'Other Person', companyName: 'Other Name Traders', businessType: 'Scrap trader', yard: 'Yard 9, Nagpur', city: 'Nagpur', state: 'Maharashtra', categories: ['ferrous_hms'], email: 'other@x.example', phone: '91234 00000' }, NOW));
    const seller = { id: reg.value.user.id, role: 'seller' as const };
    st = applied(reg.state, seller, { ...buyerApp, legalName: 'Other Name Traders Pvt Ltd', sellerDeclaration: { authorisedToSell: true, materialSource: 'Own fabrication offcuts' }, bankDetails: { accountName: 'Other', bankName: 'HDFC', accountNumber: '1234567890', ifsc: 'HDFC0001234', upiId: '' } }, [...BUYER_DOCS, 'gst_certificate', 'premises_proof', 'cancelled_cheque']);
    const r = submitEligibility(st, seller, NOW);
    expect(r.ok ? 'ok' : r.error).toMatchObject({ code: 'duplicate_identity', what: 'These business details are already registered with AuctionIT.' });
    if (!r.ok) expect(`${r.error.what} ${r.error.next}`).not.toMatch(/NewCo|Asha/);
  });

  it('email, mobile number and sign-in identity are one account each, across roles', () => {
    const a = newBuyer(createSeed(NOW), { authUserId: 'auth-1' });
    const base = { name: 'X', companyName: 'X Co', businessType: 'Fabricator', yard: 'Yard 1', city: 'Pune', state: 'Maharashtra', categories: ['ferrous_hms' as const], email: 'new@x.example', phone: '90000 00001' };
    for (const patch of [{ email: 'ASHA@newco.example' }, { phone: '+91 98765 43210' }, { authUserId: 'auth-1' }]) {
      const r = registerSeller(a.s, { ...base, ...patch }, NOW);
      expect(r.ok ? 'ok' : r.error.code).toBe('duplicate_account');
    }
  });

  it('a similar name is only flagged to the reviewer', () => {
    const a = newBuyer();
    const st = must(submitEligibility(applied(a.s, a.actor, { ...buyerApp, legalName: 'Vardhan Infra Projects Pvt. Ltd.' }, BUYER_DOCS), a.actor, NOW)).state;
    expect(eligibilityReview(st, a.companyId)?.possibleDuplicates).toEqual([{ companyId: 'C-VARDHAN', name: 'Vardhan Infra Projects Pvt Ltd', kind: 'buyer', status: 'demo_approved' }]);
  });
});

describe('private documents', () => {
  it('only the owner, a reviewer, or the seller paid with a receipt can open a document', () => {
    const a = newBuyer();
    let st = applied(a.s, a.actor, buyerApp, ['pan_card']);
    const pan = st.documents.at(-1)!.id;
    expect(canViewDocument(st, pan, a.actor)).toBe(true);
    expect(canViewDocument(st, pan, OPS)).toBe(true);
    expect(canViewDocument(st, pan, { id: 'U-RAHUL', role: 'buyer' })).toBe(false);
    expect(canViewDocument(st, pan, { id: 'U-SURESH', role: 'seller' })).toBe(false);
    expect(canViewDocument(st, pan, { id: null, role: 'guest' })).toBe(false);

    st = must(addDocument(createSeed(NOW), doc('payment_receipt'), { id: 'U-RAHUL', role: 'buyer' }, NOW)).state;
    const receipt = st.documents.at(-1)!.id;
    st = must(submitEmd(st, 'LOT-2025-0891', { ...payment(100_000, NOW), receiptDocumentId: receipt }, { id: 'U-RAHUL', role: 'buyer' }, NOW)).state;
    expect(canViewDocument(st, receipt, { id: 'U-SURESH', role: 'seller' })).toBe(true);
    expect(canViewDocument(st, receipt, { id: 'U-IMRAN', role: 'seller' })).toBe(false);
  });
});

describe('sample data on the live site', () => {
  it('hides seeded companies and everything they own, keeps real records', () => {
    const a = newBuyer();
    const live = withoutSamples(a.s);
    expect(live.companies.map((c) => c.id)).toEqual([a.companyId]);
    expect(live.users.map((u) => u.id)).toEqual([a.actor.id]);
    expect(live.lots).toEqual([]);
    expect(live.bids).toEqual([]);
    expect(live.emds).toEqual([]);
    expect(live.transactions).toEqual([]);
    expect(live.claims).toEqual([]);
    expect(live.notifications.every((n) => n.userId === a.actor.id)).toBe(true);
    expect(live.audit.every((e) => e.entityId === a.actor.id || e.actorId === a.actor.id)).toBe(true);
    // Nothing to hide → the same object.
    expect(withoutSamples(live)).toBe(live);
  });
});

describe('identity squatting', () => {
  it('a draft or rejected application with someone’s PAN does not block the real business', () => {
    const squatter = newBuyer();
    let st = applied(squatter.s, squatter.actor, buyerApp, BUYER_DOCS); // draft only
    const real = must(registerSeller(st, { name: 'Real Owner', companyName: 'NewCo Metals', businessType: 'Steel processor', yard: 'Plot 4, MIDC', city: 'Nagpur', state: 'Maharashtra', categories: ['ferrous_hms'], email: 'owner@newco.example', phone: '91111 22222' }, NOW));
    const owner = { id: real.value.user.id, role: 'seller' as const };
    st = applied(real.state, owner, { ...buyerApp, sellerDeclaration: { authorisedToSell: true, materialSource: 'Own plant production scrap' }, bankDetails: { accountName: 'NewCo', bankName: 'SBI', accountNumber: '12345678901', ifsc: 'SBIN0001234', upiId: '' } }, [...BUYER_DOCS, 'gst_certificate', 'premises_proof', 'cancelled_cheque']);
    expect(submitEligibility(st, owner, NOW).ok).toBe(true);
  });
});
