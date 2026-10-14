import type { CategoryId, RemedyKind, Rupees } from './types';

/**
 * Demo policy. Every number here is an illustrative assumption for the prototype — NOT an
 * approved AuctionIT rule. The UI must caption these values "Demo policy" (SPEC §8.2, §10.1, §13).
 */
export interface CategoryPolicy {
  demo: true;
  id: CategoryId;
  label: string;
  /** Lot Assurance pilot covers ferrous / mixed steel only. */
  assuranceEligible: boolean;
  tolerance: {
    /** Absolute ceiling on non-metallic contamination (%) measured at lifting. */
    contaminationCeilingPct: number;
    /** Measured vs estimated quantity variance (%) accepted without a claim. */
    quantityVariancePct: number;
  } | null;
  remedies: RemedyKind[];
  /** Listing evidence needed to enable assurance — a proposed pilot requirement. */
  evidence: { minPhotos: number; minVideos: number } | null;
  /** Minimum files a buyer must attach to raise a claim. */
  claimEvidenceMin: number;
  emd: { pctOfReserveValue: number; roundTo: Rupees; min: Rupees };
  bidIncrement: Rupees;
  /** Claims must be raised before loading is complete. */
  claimWindow: 'before_loading_complete';
  /** Hours after winning to pay the balance before Ops may mark the transaction defaulted. */
  paymentDeadlineHours: number;
  /** What happens to EMD (simulated) in each case. */
  emdOutcome: { notWon: 'refunded'; defaulted: 'forfeited'; exitRefund: 'refunded' };
  /** Category-specific attribute fields for the listing wizard (step 2). */
  attributeFields: { key: string; label: string; required: boolean }[];
  /** Whether a contamination estimate applies to this category. */
  hasContamination: boolean;
}

const common = {
  demo: true,
  claimWindow: 'before_loading_complete',
  paymentDeadlineHours: 72,
  emdOutcome: { notWon: 'refunded', defaulted: 'forfeited', exitRefund: 'refunded' },
  claimEvidenceMin: 2,
} as const;

export const POLICY: Record<CategoryId, CategoryPolicy> = {
  ferrous_hms: {
    ...common,
    id: 'ferrous_hms',
    label: 'Ferrous / HMS',
    assuranceEligible: true,
    tolerance: { contaminationCeilingPct: 8, quantityVariancePct: 10 },
    remedies: ['price_adjustment', 'exit_refund'],
    evidence: { minPhotos: 6, minVideos: 1 },
    emd: { pctOfReserveValue: 7.5, roundTo: 10_000, min: 25_000 },
    bidIncrement: 500,
    hasContamination: true,
    attributeFields: [
      { key: 'form', label: 'Material form and sizing', required: true },
      { key: 'thickness', label: 'Typical thickness', required: true },
      { key: 'storage', label: 'Yard storage surface', required: false },
    ],
  },
  mixed_steel: {
    ...common,
    id: 'mixed_steel',
    label: 'Mixed steel',
    assuranceEligible: true,
    tolerance: { contaminationCeilingPct: 10, quantityVariancePct: 10 },
    remedies: ['price_adjustment', 'exit_refund'],
    evidence: { minPhotos: 6, minVideos: 1 },
    emd: { pctOfReserveValue: 7.5, roundTo: 10_000, min: 25_000 },
    bidIncrement: 500,
    hasContamination: true,
    attributeFields: [
      { key: 'form', label: 'Material form and sizing', required: true },
      { key: 'mix', label: 'Approximate mix', required: true },
    ],
  },
  non_ferrous: {
    ...common,
    id: 'non_ferrous',
    label: 'Non-ferrous',
    assuranceEligible: false,
    tolerance: null,
    remedies: [],
    evidence: null,
    emd: { pctOfReserveValue: 5, roundTo: 10_000, min: 50_000 },
    bidIncrement: 2_000,
    hasContamination: true,
    attributeFields: [
      { key: 'alloy', label: 'Metal / alloy', required: true },
      { key: 'form', label: 'Form (cable, turnings, extrusion…)', required: true },
    ],
  },
  e_waste: {
    ...common,
    id: 'e_waste',
    label: 'E-waste',
    assuranceEligible: false,
    tolerance: null,
    remedies: [],
    evidence: null,
    emd: { pctOfReserveValue: 5, roundTo: 5_000, min: 25_000 },
    bidIncrement: 1_000,
    hasContamination: false,
    attributeFields: [
      { key: 'items', label: 'Item types', required: true },
      { key: 'authorisation', label: 'Recycler authorisation needed', required: false },
    ],
  },
  machinery: {
    ...common,
    id: 'machinery',
    label: 'Used machinery',
    assuranceEligible: false,
    tolerance: null,
    remedies: [],
    evidence: null,
    emd: { pctOfReserveValue: 5, roundTo: 5_000, min: 25_000 },
    bidIncrement: 1_000,
    hasContamination: false,
    attributeFields: [
      { key: 'make', label: 'Make and model', required: true },
      { key: 'condition', label: 'Working condition', required: true },
    ],
  },
};

export const CATEGORIES = Object.values(POLICY);

export function policyFor(category: CategoryId): CategoryPolicy {
  return POLICY[category];
}

/** Suggested EMD for a lot: % of reserve value, rounded up, never below the category minimum. */
export function suggestedEmd(category: CategoryId, reservePerMt: Rupees, estimatedQtyMt: number): Rupees {
  const { emd } = POLICY[category];
  const raw = (reservePerMt * estimatedQtyMt * emd.pctOfReserveValue) / 100;
  return Math.max(emd.min, Math.ceil(raw / emd.roundTo) * emd.roundTo);
}
