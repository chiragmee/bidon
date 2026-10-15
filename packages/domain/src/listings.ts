/**
 * Seller-side commands over a state snapshot: save a draft, publish it, register a seller
 * (SPEC §12–§14). Pure, like operations.ts.
 */
import { deriveAuctionStatus } from './auction';
import type { Actor } from './context';
import { audit, ms } from './context';
import type { ListingDraft } from './listing';
import { canSellerEdit, draftFromLot, publishBlockers } from './listing';
import type { OpResult } from './operations';
import { clone, stateCtx, validateEmail } from './operations';
import { policyFor, suggestedEmd } from './policy';
import type { DemoState } from './seed';
import type { CategoryId, Company, Iso, Lot, User } from './types';

const MEASUREMENT_BASIS = 'Final payable quantity is the net weight at the mutually agreed certified weighbridge at lifting.';

function rejected<T>(state: DemoState, code: string, what: string, next: string): OpResult<T> {
  return { ok: false, state, error: { code, what, next } };
}

/** Merge wizard values into a lot. Unset values are stored as 0 / '' and read back as unset. */
function applyDraft(base: Lot, d: ListingDraft, now: Iso): Lot {
  const category: CategoryId = d.category ?? base.category;
  const p = policyFor(category);
  const qty = d.estimatedQtyMt ?? 0;
  const reserve = d.reservePerMt ?? 0;
  const assured = !!d.assuranceEnabled && p.assuranceEligible;
  return {
    ...base,
    title: d.title?.trim() ?? '',
    category,
    grade: d.grade?.trim() ?? '',
    description: d.description?.trim() ?? '',
    location: { yard: d.yard?.trim() ?? '', city: d.city?.trim() ?? '', state: d.state?.trim() ?? '' },
    estimatedQtyMt: qty,
    declaration: {
      contaminationPct: p.hasContamination ? (d.contaminationPct ?? null) : null,
      grade: d.grade?.trim() ?? '',
      form: d.attributes?.form ?? '',
      notes: d.description?.trim() ?? '',
    },
    attributes: Object.fromEntries(p.attributeFields.map((f) => [f.key, d.attributes?.[f.key]?.trim() ?? ''])),
    reservePerMt: reserve,
    reserveVisible: d.reserveVisible ?? true,
    emdAmount: d.emdAmount ?? (reserve > 0 && qty > 0 ? suggestedEmd(category, reserve, qty) : 0),
    bidIncrement: p.bidIncrement,
    startAt: d.startAt ?? '',
    endAt: d.endAt ?? '',
    assurance: { enabled: assured, agreedAt: assured && d.assuranceAgreed ? (base.assurance.agreedAt ?? now) : null },
    media: (d.media ?? []).map((m) => ({ ...m, stage: 'listing' as const })),
  };
}

/** Create or update a draft (wizard autosave). Scheduled lots may be edited before they open. */
export function saveDraft(state: DemoState, input: { lotId?: string | null; draft: ListingDraft }, actor: Actor, now: Iso): OpResult<Lot> {
  if (actor.role !== 'seller') return rejected(state, 'forbidden', 'Only seller accounts can create lots.', 'Sign in with a seller account.');
  const user = state.users.find((u) => u.id === actor.id);
  if (!user?.companyId) return rejected(state, 'no_company', 'Your seller profile is incomplete.', 'Finish seller onboarding first.');

  const next = clone(state);
  const ctx = stateCtx(next, now, actor);

  if (input.lotId) {
    const existing = next.lots.find((l) => l.id === input.lotId);
    if (!existing) return rejected(state, 'not_found', 'That lot does not exist.', 'Start a new lot.');
    const blocked = canSellerEdit(existing, next.bids.filter((b) => b.lotId === existing.id), actor.id, 'details', now);
    if (blocked) return { ok: false, state, error: blocked };
    const updated = applyDraft(existing, input.draft, now);
    if (existing.status !== 'draft') {
      // A published (not yet open) lot must stay publishable after the edit.
      const problems = publishBlockers(draftFromLot(updated), now);
      if (problems.length) return rejected(state, 'invalid', problems.map((p) => p.message).join(' '), 'Fix these before saving.');
    }
    next.lots = next.lots.map((l) => (l.id === existing.id ? updated : l));
    next.audit.push(audit(ctx, { entity: 'lot', entityId: existing.id, action: existing.status === 'draft' ? 'save_draft' : 'edit_scheduled_lot' }));
    return { ok: true, state: next, value: updated };
  }

  const blank: Lot = {
    id: ctx.newId('LOT'),
    sellerId: actor.id,
    sellerCompanyId: user.companyId,
    title: '',
    category: input.draft.category ?? 'ferrous_hms',
    grade: '',
    description: '',
    location: { yard: '', city: '', state: '' },
    estimatedQtyMt: 0,
    declaration: { contaminationPct: null, grade: '', form: '', notes: '' },
    attributes: {},
    reservePerMt: 0,
    reserveVisible: true,
    emdAmount: 0,
    bidIncrement: 0,
    startAt: '',
    endAt: '',
    status: 'draft',
    assurance: { enabled: false, agreedAt: null },
    media: [],
    measurementBasis: MEASUREMENT_BASIS,
    createdAt: now,
    publishedAt: null,
    closedAt: null,
    winningBidId: null,
  };
  const lot = applyDraft(blank, input.draft, now);
  next.lots.unshift(lot);
  next.audit.push(audit(ctx, { entity: 'lot', entityId: lot.id, action: 'create_draft', to: 'draft' }));
  return { ok: true, state: next, value: lot };
}

/** Publish a complete, valid draft. Status then follows the start time (scheduled → live). */
export function publishLot(state: DemoState, lotId: string, actor: Actor, now: Iso): OpResult<Lot> {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) return rejected(state, 'not_found', 'That lot does not exist.', 'Go back to your lots.');
  if (actor.role !== 'seller' || lot.sellerId !== actor.id) return rejected(state, 'forbidden', 'Only the seller of this lot can publish it.', 'Open one of your own lots.');
  if (lot.status !== 'draft') return rejected(state, 'already_published', 'This lot is already published.', 'View it in your lots.');
  const problems = publishBlockers(draftFromLot(lot), now);
  if (problems.length) {
    return rejected(state, 'cannot_publish', `This lot can’t be published yet: ${problems.map((p) => p.message).join(' ')}`, 'Fix the listed items in the wizard, then publish.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const published: Lot = { ...lot, status: 'scheduled', publishedAt: now };
  next.lots = next.lots.map((l) => (l.id === lotId ? published : l));
  next.audit.push(audit(ctx, { entity: 'lot', entityId: lotId, action: 'publish', from: 'draft', to: deriveAuctionStatus(published, now) }));
  const opens = ms(published.startAt) <= ms(now) ? 'Bidding is open now.' : `Bidding opens ${new Date(published.startAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`;
  next.notifications.push({ id: ctx.newId('N'), userId: actor.id, kind: 'listing_published', title: `${lotId} published`, body: `${lot.title}. ${opens}`, href: `/seller/lots/${lotId}`, read: false, at: now });
  return { ok: true, state: next, value: published };
}

/** Delete a draft that was never published. */
export function deleteDraft(state: DemoState, lotId: string, actor: Actor, now: Iso): OpResult<null> {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot || lot.sellerId !== actor.id) return rejected(state, 'not_found', 'That draft does not exist.', 'Go back to your lots.');
  if (lot.status !== 'draft') return rejected(state, 'not_draft', 'Only unpublished drafts can be deleted.', 'Published lots stay on record.');
  const next = clone(state);
  next.lots = next.lots.filter((l) => l.id !== lotId);
  next.audit.push(audit(stateCtx(next, now, actor), { entity: 'lot', entityId: lotId, action: 'delete_draft', from: 'draft' }));
  return { ok: true, state: next, value: null };
}

// ── Seller onboarding (SPEC §12.1) ───────────────────────────────────────────

export interface SellerRegistration {
  name: string;
  companyName: string;
  businessType: string;
  yard: string;
  city: string;
  state: string;
  categories: CategoryId[];
  email: string;
  phone: string;
}

export function registerSeller(state: DemoState, input: SellerRegistration, now: Iso): OpResult<{ user: User; company: Company }> {
  const missing: string[] = (
    [
      ['name', 'your name'],
      ['companyName', 'company name'],
      ['businessType', 'business type'],
      ['yard', 'yard or operating location'],
      ['city', 'city'],
      ['state', 'state'],
    ] as const
  )
    .filter(([k]) => !input[k].trim())
    .map(([, l]) => l);
  if (input.categories.length === 0) missing.push('material categories');
  if (missing.length) return rejected(state, 'incomplete_profile', `Your profile is missing: ${missing.join(', ')}.`, 'Fill in the highlighted fields.');
  const emailError = validateEmail(input.email);
  if (emailError) return rejected(state, 'invalid_email', emailError, 'Correct the email and try again.');
  if (!/^\+?[\d\s-]{10,15}$/.test(input.phone.trim())) {
    return rejected(state, 'invalid_phone', 'Enter a 10-digit mobile number, for example 98765 43210.', 'Correct the number and try again.');
  }
  const email = input.email.trim().toLowerCase();
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    return rejected(state, 'duplicate_email', 'An account with this email already exists.', 'Sign in to that account, or use a different email.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, { id: 'guest', role: 'guest' });
  const company: Company = {
    id: ctx.newId('C'),
    name: input.companyName.trim(),
    kind: 'seller',
    city: input.city.trim(),
    state: input.state.trim(),
    businessType: input.businessType,
    yard: input.yard.trim(),
    sample: false,
    verification: 'demo_approved',
  };
  const user: User = { id: ctx.newId('U'), name: input.name.trim(), email, role: 'seller', companyId: company.id, title: 'Owner' };
  next.companies.push(company);
  next.users.push(user);
  next.audit.push(audit({ ...ctx, actor: { id: user.id, role: 'seller' } }, { entity: 'user', entityId: user.id, action: 'register_seller_demo', to: 'demo_approved' }));
  return { ok: true, state: next, value: { user, company } };
}
