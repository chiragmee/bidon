import { deriveAuctionStatus } from './auction';
import { ms } from './context';
import { policyFor } from './policy';
import type { Bid, CategoryId, Iso, Lot, LotMedia, Rejection } from './types';

/** Fields the wizard collects. Partial while drafting. */
export interface ListingDraft {
  title?: string;
  category?: CategoryId;
  grade?: string;
  description?: string;
  yard?: string;
  city?: string;
  state?: string;
  estimatedQtyMt?: number;
  contaminationPct?: number | null;
  attributes?: Record<string, string>;
  media?: LotMedia[];
  reservePerMt?: number;
  emdAmount?: number;
  startAt?: Iso;
  endAt?: Iso;
  assuranceEnabled?: boolean;
  assuranceAgreed?: boolean;
}

export type WizardStep = 1 | 2 | 3 | 4;
export type FieldErrors = Partial<Record<string, string>>;

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Inline validation per wizard step. Empty object = step valid. */
export function validateListingStep(step: WizardStep, d: ListingDraft, now: Iso): FieldErrors {
  const e: FieldErrors = {};
  if (step === 1) {
    if (blank(d.title)) e.title = 'Enter a lot title buyers will recognise, e.g. "HMS 1 & 2 steel scrap".';
    else if ((d.title ?? '').trim().length < 8) e.title = 'Use at least 8 characters so the title is descriptive.';
    if (!d.category) e.category = 'Choose a material category.';
    if (blank(d.grade)) e.grade = 'Enter the material type or grade.';
    if (blank(d.description)) e.description = 'Describe the material in a sentence or two.';
    if (blank(d.yard)) e.yard = 'Enter the yard or plant where the material is stored.';
    if (blank(d.city)) e.city = 'Enter the city.';
    if (blank(d.state)) e.state = 'Choose the state.';
  }
  if (step === 2) {
    if (d.estimatedQtyMt === undefined || !(d.estimatedQtyMt > 0)) {
      e.estimatedQtyMt = 'Enter the estimated quantity in MT — a number greater than 0.';
    } else if (d.estimatedQtyMt > 10_000) {
      e.estimatedQtyMt = 'That is more than 10,000 MT. Check the figure or split it into several lots.';
    }
    if (d.category) {
      const p = policyFor(d.category);
      if (p.hasContamination) {
        const c = d.contaminationPct;
        if (c === undefined || c === null || Number.isNaN(c)) {
          e.contaminationPct = 'Enter your contamination estimate as a percentage (0–100).';
        } else if (c < 0 || c > 100) {
          e.contaminationPct = 'Contamination must be between 0 and 100%.';
        }
      }
      for (const f of p.attributeFields) {
        if (f.required && blank(d.attributes?.[f.key])) e[`attributes.${f.key}`] = `Enter ${f.label.toLowerCase()}.`;
      }
    }
  }
  if (step === 3) {
    // Evidence is optional for standard lots; the assurance requirement is checked at step 4 / publish.
  }
  if (step === 4) {
    if (d.reservePerMt === undefined || !(d.reservePerMt > 0) || !Number.isInteger(d.reservePerMt)) {
      e.reservePerMt = 'Enter a reserve price per MT greater than ₹0, in whole rupees.';
    }
    if (d.emdAmount === undefined || !(d.emdAmount > 0) || !Number.isInteger(d.emdAmount)) {
      e.emdAmount = 'Enter an EMD amount greater than ₹0, in whole rupees.';
    }
    if (!d.startAt || Number.isNaN(ms(d.startAt))) e.startAt = 'Choose when bidding opens.';
    else if (ms(d.startAt) < ms(now) - 60_000) e.startAt = 'The start time is in the past. Choose a future time.';
    if (!d.endAt || Number.isNaN(ms(d.endAt))) e.endAt = 'Choose when bidding closes.';
    else if (d.startAt && ms(d.endAt) <= ms(d.startAt)) {
      e.endAt = 'The closing time must be after the opening time.';
    }
    if (d.assuranceEnabled) {
      if (!d.category || !policyFor(d.category).assuranceEligible) {
        e.assuranceEnabled = 'Lot Assurance is only available for ferrous and mixed-steel lots in this pilot.';
      } else {
        const miss = evidenceShortfall(d.category, d.media ?? []);
        if (miss) e.assuranceEnabled = miss;
        if (!d.assuranceAgreed) e.assuranceAgreed = 'Confirm you agree to the Lot Assurance terms to enable it.';
      }
    }
  }
  return e;
}

/** Message if listing evidence doesn't meet the category's pilot requirement, else null. */
export function evidenceShortfall(category: CategoryId, media: readonly LotMedia[]): string | null {
  const req = policyFor(category).evidence;
  if (!req) return null;
  const photos = media.filter((m) => m.stage === 'listing' && m.kind === 'photo').length;
  const videos = media.filter((m) => m.stage === 'listing' && m.kind === 'video').length;
  if (photos >= req.minPhotos && videos >= req.minVideos) return null;
  return (
    `Lot Assurance needs at least ${req.minPhotos} photos and ${req.minVideos} video ` +
    `(proposed pilot requirement). You have ${photos} photo${photos === 1 ? '' : 's'} and ` +
    `${videos} video${videos === 1 ? '' : 's'}. Add evidence in step 3.`
  );
}

/** All reasons a draft cannot be published (empty = publishable). */
export function publishBlockers(d: ListingDraft, now: Iso): { step: WizardStep; field: string; message: string }[] {
  const out: { step: WizardStep; field: string; message: string }[] = [];
  for (const step of [1, 2, 3, 4] as const) {
    for (const [field, message] of Object.entries(validateListingStep(step, d, now))) {
      if (message) out.push({ step, field, message });
    }
  }
  return out;
}

export function draftFromLot(lot: Lot): ListingDraft {
  return {
    title: lot.title,
    category: lot.category,
    grade: lot.grade,
    description: lot.description,
    yard: lot.location.yard,
    city: lot.location.city,
    state: lot.location.state,
    estimatedQtyMt: lot.estimatedQtyMt,
    contaminationPct: lot.declaration.contaminationPct,
    attributes: lot.attributes,
    media: lot.media,
    reservePerMt: lot.reservePerMt,
    emdAmount: lot.emdAmount,
    startAt: lot.startAt,
    endAt: lot.endAt,
    assuranceEnabled: lot.assurance.enabled,
    assuranceAgreed: lot.assurance.agreedAt !== null,
  };
}

export type SellerEditField = 'details' | 'reserve' | 'schedule' | 'evidence' | 'bids' | 'winner';

/** What a seller may change on their own lot, and why not otherwise (§14). */
export function canSellerEdit(
  lot: Lot,
  bids: readonly Bid[],
  sellerId: string,
  field: SellerEditField,
  now: Iso,
): Rejection | null {
  if (lot.sellerId !== sellerId) {
    return { code: 'not_owner', what: 'This lot belongs to another seller.', next: 'Open one of your own lots.' };
  }
  if (field === 'bids' || field === 'winner') {
    return {
      code: 'not_editable',
      what: 'Bids and auction results cannot be changed by anyone, including the seller.',
      next: 'The result is decided from stored bids and the reserve when the auction closes.',
    };
  }
  const status = deriveAuctionStatus(lot, now);
  if (status === 'draft') return null;
  if (status === 'scheduled') {
    return field === 'reserve' && bids.length > 0
      ? { code: 'not_editable', what: 'The reserve cannot change once bidding has started.', next: 'Keep the current reserve.' }
      : null;
  }
  if (status === 'live' || status === 'ended') {
    return {
      code: 'not_editable',
      what: 'Live auctions cannot be edited, so every bidder sees the same terms they bid on.',
      next: 'If something is wrong, contact Operations. You can edit drafts and scheduled lots.',
    };
  }
  return {
    code: 'not_editable',
    what: 'This auction has closed, so its listing is final.',
    next: 'Create a new lot to sell more material.',
  };
}
