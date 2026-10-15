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
import { accountIdentityProblem, clone, stateCtx } from './operations';
import { eligibilityRejection, isEligible } from './eligibilityPolicy';
import { policyFor, suggestedEmd } from './policy';
import type { DemoState } from './seed';
import type { CategoryId, Company, Iso, Lot, LotMedia, User } from './types';

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
  const company = state.companies.find((c) => c.id === lot.sellerCompanyId);
  if (!isEligible(company)) return { ok: false, state, error: eligibilityRejection(company) };
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
  /** Set by the API from the verified Supabase identity — never from the form. */
  authUserId?: string | null;
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
  const identity = accountIdentityProblem(state, input);
  if (identity.error) return { ok: false, state, error: identity.error };
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
    verification: 'incomplete',
  };
  const user: User = { id: ctx.newId('U'), name: input.name.trim(), email: identity.email, role: 'seller', companyId: company.id, title: 'Owner', phone: identity.phone, authUserId: input.authUserId ?? null };
  next.companies.push(company);
  next.users.push(user);
  next.audit.push(audit({ ...ctx, actor: { id: user.id, role: 'seller' } }, { entity: 'user', entityId: user.id, action: 'register_seller', to: 'incomplete' }));
  return { ok: true, state: next, value: { user, company } };
}

// ── After publishing (D-104) ─────────────────────────────────────────────────

/** Whether the seller can still change a published lot: until its end time, and never once closed or withdrawn. */
const stillOpen = (lot: Lot, now: Iso) => {
  const st = deriveAuctionStatus(lot, now);
  return st === 'scheduled' || st === 'live';
};

/** Everyone with a stake in a lot: its bidders and buyers who reported an EMD. */
function interestedBuyers(state: DemoState, lotId: string): string[] {
  return [...new Set([...state.bids.filter((b) => b.lotId === lotId).map((b) => b.bidderId), ...state.emds.filter((e) => e.lotId === lotId).map((e) => e.buyerId)])];
}

/**
 * The seller takes an upcoming or live auction down before its end time, with a reason (owner's decision, D-104).
 * Bids stay on record but none wins; every confirmed EMD becomes owed back, and EMDs still awaiting confirmation are
 * refunded once confirmed (payments.decideEmd). Bidders and EMD payers are told why.
 */
export function withdrawLot(state: DemoState, lotId: string, input: { reason: string }, actor: Actor, now: Iso): OpResult<Lot> {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot || actor.role !== 'seller' || lot.sellerId !== actor.id) return rejected(state, 'not_found', 'That lot isn’t one of yours.', 'Go back to your lots.');
  if (lot.status === 'draft') return rejected(state, 'not_published', 'This lot was never published.', 'Delete the draft instead.');
  if (!stillOpen(lot, now)) return rejected(state, 'already_closed', 'This auction has already ended or been taken down.', 'Its result stays on record.');
  const reason = input.reason.trim();
  if (reason.length < 10) return rejected(state, 'reason_required', 'Give a reason (at least 10 characters).', 'Bidders see it, so say plainly why the auction is being taken down.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const from = deriveAuctionStatus(lot, now);
  const bids = next.bids.filter((b) => b.lotId === lotId).length;
  const withdrawn: Lot = { ...lot, status: 'withdrawn', closedAt: now, withdrawal: { reason, at: now, by: actor.id, bidsAtWithdrawal: bids } };
  next.lots = next.lots.map((l) => (l.id === lotId ? withdrawn : l));
  for (const emd of next.emds.filter((e) => e.lotId === lotId && e.status === 'confirmed')) emd.status = 'refund_due';
  next.audit.push(audit(ctx, { entity: 'lot', entityId: lotId, action: 'withdraw', from, to: 'withdrawn', reason }));
  for (const userId of interestedBuyers(next, lotId)) {
    next.notifications.push({
      id: ctx.newId('N'),
      userId,
      kind: 'lot_withdrawn',
      title: `${lotId} was taken down by the seller`,
      body: `“${reason}” No bid wins. If you paid an EMD, the seller owes it back and records the refund here.`,
      href: `/auctions/${lotId}`,
      read: false,
      at: now,
    });
  }
  return { ok: true, state: next, value: withdrawn };
}

/**
 * Add photos or videos to a published lot until it ends (D-104). Only additions: nothing already shown to bidders —
 * description, quantity, reserve, existing media — can change.
 */
export function addLotMedia(state: DemoState, lotId: string, media: readonly LotMedia[], actor: Actor, now: Iso): OpResult<Lot> {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot || actor.role !== 'seller' || lot.sellerId !== actor.id) return rejected(state, 'not_found', 'That lot isn’t one of yours.', 'Go back to your lots.');
  if (lot.status === 'draft') return rejected(state, 'not_published', 'This lot isn’t published yet.', 'Add photos in the listing wizard.');
  if (!stillOpen(lot, now)) return rejected(state, 'already_closed', 'Photos can only be added until the auction ends.', 'Its record stays as it was at closing.');
  const add = media.filter((m) => (m.kind === 'photo' || m.kind === 'video') && !lot.media.some((x) => x.id === m.id));
  if (!add.length) return rejected(state, 'invalid_input', 'Choose at least one photo or video to add.', 'JPG, PNG or WebP photos; MP4, MOV or WebM videos.');
  if (lot.media.length + add.length > 40) return rejected(state, 'too_many_files', 'A lot can show up to 40 photos and videos.', 'Add fewer files.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const updated: Lot = { ...lot, media: [...lot.media, ...add.map((m) => ({ ...m, stage: 'listing' as const, uploadedAt: now }))] };
  next.lots = next.lots.map((l) => (l.id === lotId ? updated : l));
  next.audit.push(audit(ctx, { entity: 'lot', entityId: lotId, action: 'add_media', to: `${add.length} file(s)` }));
  const n = add.length;
  for (const userId of interestedBuyers(next, lotId)) {
    next.notifications.push({ id: ctx.newId('N'), userId, kind: 'lot_photos_added', title: `New photos on ${lotId}`, body: `The seller added ${n} ${n === 1 ? 'file' : 'files'} to ${lot.title}.`, href: `/auctions/${lotId}`, read: false, at: now });
  }
  return { ok: true, state: next, value: updated };
}

