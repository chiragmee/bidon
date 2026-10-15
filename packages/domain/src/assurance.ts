import type { Ctx } from './context';
import { audit } from './context';
import { formatINR, formatPct } from './format';
import { policyFor } from './policy';
import type {
  AuditEntry,
  Claim,
  ClaimType,
  Lot,
  OpsDecision,
  RemedyKind,
  Result,
  Rupees,
  SellerResponse,
  Transaction,
} from './types';
import { fail, ok } from './types';
import { computePayable } from './transaction';

// ── Tolerance ────────────────────────────────────────────────────────────────

export interface ToleranceCheck {
  /** null when this claim type has no numeric tolerance (grade / condition need judgement). */
  within: boolean | null;
  declared: number | null;
  limit: number | null;
  observed: number;
  /** Points (contamination) or % (quantity) beyond the limit; 0 when within. */
  excess: number;
  unit: '%' | 'MT';
}

export function checkTolerance(lot: Lot, type: ClaimType, observed: number): ToleranceCheck {
  const tol = policyFor(lot.category).tolerance;
  if (type === 'contamination') {
    const limit = tol?.contaminationCeilingPct ?? null;
    const excess = limit === null ? 0 : Math.max(0, round1(observed - limit));
    return {
      within: limit === null ? null : observed <= limit,
      declared: lot.declaration.contaminationPct,
      limit,
      observed,
      excess,
      unit: '%',
    };
  }
  if (type === 'quantity') {
    const variancePct = (Math.abs(observed - lot.estimatedQtyMt) / lot.estimatedQtyMt) * 100;
    const limit = tol?.quantityVariancePct ?? null;
    return {
      within: limit === null ? null : variancePct <= limit,
      declared: lot.estimatedQtyMt,
      limit,
      observed,
      excess: limit === null ? 0 : Math.max(0, round1(variancePct - limit)),
      unit: 'MT',
    };
  }
  return { within: null, declared: null, limit: null, observed, excess: 0, unit: '%' };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Eligibility (SPEC §16.3) ─────────────────────────────────────────────────

export type EligibilityRule =
  | 'assured'
  | 'valid_transaction'
  | 'lifting_started'
  | 'outside_tolerance'
  | 'evidence_supplied'
  | 'before_loading_complete';

export interface EligibilityCheck {
  rule: EligibilityRule;
  label: string;
  passed: boolean;
  /** When failed: what it means and what to do next. */
  what: string;
  next: string;
}

export interface ClaimDraft {
  type: ClaimType;
  observedValue: number;
  mediaIds: string[];
}

/**
 * Every rule, evaluated independently, so the UI can show a full checklist with the specific
 * reasons a claim is not available. Never a bare "not allowed".
 */
export function claimEligibility(lot: Lot, tx: Transaction | null, draft: ClaimDraft | null): {
  eligible: boolean;
  checks: EligibilityCheck[];
} {
  const p = policyFor(lot.category);
  const checks: EligibilityCheck[] = [];

  checks.push({
    rule: 'assured',
    label: 'Lot Assurance applies to this lot',
    passed: lot.assurance.enabled,
    what: 'This is a standard lot without Lot Assurance, so the claim process does not apply.',
    next: 'Settle any issue directly with the seller, or contact Operations for help.',
  });

  const validTx = !!tx && tx.lotId === lot.id && !['defaulted', 'completed', 'resolved'].includes(tx.status);
  checks.push({
    rule: 'valid_transaction',
    label: 'You won this lot and the transaction is open',
    passed: validTx,
    what: tx ? 'This transaction is already closed, so a claim can no longer be opened.' : 'There is no winning transaction for this lot.',
    next: 'Claims can only be raised on an open, won transaction.',
  });

  const liftingStarted =
    !!tx && (tx.status === 'lifting_scheduled' || tx.status === 'material_checked') && (!!tx.weighbridge || !!tx.condition);
  checks.push({
    rule: 'lifting_started',
    label: 'Lifting has started (a lifting check is recorded)',
    passed: liftingStarted,
    what: 'Lifting has not started yet, so there is no measurement to compare against.',
    next: 'Record the weighbridge measurement or condition check at lifting first.',
  });

  const beforeLoadingDone = !!tx && tx.loadingCompletedAt === null;
  checks.push({
    rule: 'before_loading_complete',
    label: 'Raised before loading is complete',
    passed: beforeLoadingDone,
    what: 'Loading is already complete, so the claim window has closed (provisional policy).',
    next: 'Claims must be raised at the yard before loading finishes.',
  });

  if (draft) {
    const t = checkTolerance(lot, draft.type, draft.observedValue);
    const outside = t.within === null ? true : !t.within;
    checks.push({
      rule: 'outside_tolerance',
      label: 'The difference is outside the agreed tolerance',
      passed: outside,
      what:
        t.limit !== null
          ? `${formatPct(draft.observedValue)} is within the agreed limit of ${formatPct(t.limit)}, so the lot is within tolerance.`
          : 'The difference is within the agreed tolerance.',
      next: 'Within tolerance the transaction completes normally. Complete it from the transaction page.',
    });

    checks.push({
      rule: 'evidence_supplied',
      label: `At least ${p.claimEvidenceMin} evidence files attached`,
      passed: draft.mediaIds.length >= p.claimEvidenceMin,
      what: `You attached ${draft.mediaIds.length} file${draft.mediaIds.length === 1 ? '' : 's'}; at least ${p.claimEvidenceMin} are needed.`,
      next: 'Add timestamped photos from the lifting and the weighbridge ticket.',
    });
  }

  return { eligible: checks.every((c) => c.passed), checks };
}

// ── Remedies (D-008) ─────────────────────────────────────────────────────────

/**
 * Price adjustment for contamination: (observed − ceiling) % × measured MT × rate.
 * Quantity differences are already priced by the weighbridge (payable = measured × rate), so a
 * quantity claim's remedy is an exit rather than an adjustment.
 */
export function priceAdjustment(lot: Lot, tx: Transaction, type: ClaimType, observed: number): Rupees {
  if (type !== 'contamination' || !tx.weighbridge) return 0;
  const t = checkTolerance(lot, type, observed);
  return Math.round((t.excess / 100) * tx.weighbridge.measuredMt * tx.pricePerMt);
}

/** Exit: the seller returns the EMD and any balance paid (outside AuctionIT, recorded as refunds); seller keeps the material. */
export function exitRefund(tx: Transaction): Rupees {
  return tx.emdAmount + tx.balancePaid;
}

export function remedyAmount(lot: Lot, tx: Transaction, claim: Pick<Claim, 'type' | 'observedValue'>, kind: RemedyKind): Rupees {
  return kind === 'price_adjustment' ? priceAdjustment(lot, tx, claim.type, claim.observedValue) : exitRefund(tx);
}

export function describeRemedy(kind: RemedyKind, amount: Rupees): string {
  return kind === 'price_adjustment'
    ? `Price reduced by ${formatINR(amount)}`
    : `Buyer exits; the seller returns ${formatINR(amount)} EMD and balance`;
}

/** Applies a final remedy to the transaction. */
export function applyRemedy(
  tx: Transaction,
  outcome: 'price_adjustment' | 'exit_refund' | 'claim_rejected',
  amount: Rupees,
  ctx: Ctx,
): Transaction {
  const measured = tx.weighbridge?.measuredMt ?? tx.estimatedQtyMt;
  const payable = computePayable(measured, tx.pricePerMt);
  if (outcome === 'exit_refund') {
    return { ...tx, status: 'resolved', resolution: 'exit_refund', finalQtyMt: 0, finalPayable: 0, completedAt: ctx.now };
  }
  const adjustment = outcome === 'price_adjustment' ? amount : 0;
  return {
    ...tx,
    status: 'resolved',
    resolution: outcome,
    adjustment,
    loadingCompletedAt: tx.loadingCompletedAt ?? ctx.now,
    finalQtyMt: measured,
    finalPayable: payable - adjustment,
    completedAt: ctx.now,
  };
}

// ── Claim lifecycle: open → seller_responded → under_review → resolved | rejected ──

export interface ClaimInput extends ClaimDraft {
  expected: string;
  observed: string;
  explanation: string;
  requestedRemedy: RemedyKind;
}

export interface ClaimResult {
  claim: Claim;
  tx: Transaction;
  audit: AuditEntry[];
}

export function openClaim(lot: Lot, tx: Transaction, input: ClaimInput, ctx: Ctx): Result<ClaimResult> {
  if (ctx.actor.role !== 'buyer' || ctx.actor.id !== tx.buyerId) {
    return fail('forbidden', 'Only the buyer on this transaction can raise a claim.', 'Sign in as the buyer.');
  }
  const { eligible, checks } = claimEligibility(lot, tx, input);
  if (!eligible) {
    const failing = checks.filter((c) => !c.passed);
    return fail('not_eligible', failing.map((c) => c.what).join(' '), failing[0]?.next ?? '');
  }
  if (!input.explanation.trim()) {
    return fail('explanation_required', 'Add a short explanation of what you found.', 'One or two sentences is enough.');
  }
  if (!policyFor(lot.category).remedies.includes(input.requestedRemedy)) {
    return fail('invalid_remedy', 'That remedy is not available for this category.', 'Choose one of the listed remedies.');
  }
  const claim: Claim = {
    id: ctx.newId('CLM'),
    transactionId: tx.id,
    lotId: lot.id,
    buyerId: tx.buyerId,
    sellerId: tx.sellerId,
    type: input.type,
    expected: input.expected,
    observedValue: input.observedValue,
    observed: input.observed,
    explanation: input.explanation.trim(),
    requestedRemedy: input.requestedRemedy,
    mediaIds: input.mediaIds,
    status: 'open',
    sellerResponse: null,
    opsDecision: null,
    openedAt: ctx.now,
    resolvedAt: null,
  };
  const nextTx: Transaction = { ...tx, status: 'claim_opened' };
  return ok({
    claim,
    tx: nextTx,
    audit: [
      audit(ctx, { entity: 'claim', entityId: claim.id, action: 'open_claim', to: 'open' }),
      audit(ctx, { entity: 'transaction', entityId: tx.id, action: 'open_claim', from: tx.status, to: 'claim_opened' }),
    ],
  });
}

/**
 * Seller responds first. Accept → the requested remedy is applied and the claim resolves without
 * Operations. Dispute → the claim goes to the Operations queue.
 */
export function respondToClaim(
  lot: Lot,
  tx: Transaction,
  claim: Claim,
  response: Pick<SellerResponse, 'decision' | 'explanation' | 'mediaIds'>,
  ctx: Ctx,
): Result<ClaimResult> {
  if (ctx.actor.role !== 'seller' || ctx.actor.id !== claim.sellerId) {
    return fail('forbidden', 'Only the seller of this lot can respond to the claim.', 'Sign in as the seller.');
  }
  if (claim.status !== 'open') {
    return fail('invalid_state', 'This claim has already been responded to.', 'See the claim status for the next step.');
  }
  if (response.decision === 'dispute' && !response.explanation.trim()) {
    return fail('explanation_required', 'Explain why you dispute the claim.', 'Operations will read this alongside the evidence.');
  }

  const sellerResponse: SellerResponse = { ...response, respondedAt: ctx.now, respondedBy: ctx.actor.id };
  const entries: AuditEntry[] = [
    audit(ctx, { entity: 'claim', entityId: claim.id, action: `seller_${response.decision}`, from: 'open', to: 'seller_responded' }),
  ];

  if (response.decision === 'accept') {
    const amount = remedyAmount(lot, tx, claim, claim.requestedRemedy);
    const nextTx = applyRemedy(tx, claim.requestedRemedy, amount, ctx);
    entries.push(
      audit(ctx, { entity: 'claim', entityId: claim.id, action: 'resolve_by_acceptance', from: 'seller_responded', to: 'resolved' }),
      audit(ctx, { entity: 'transaction', entityId: tx.id, action: 'apply_remedy', from: tx.status, to: nextTx.status, reason: describeRemedy(claim.requestedRemedy, amount) }),
    );
    return ok({ claim: { ...claim, sellerResponse, status: 'resolved', resolvedAt: ctx.now }, tx: nextTx, audit: entries });
  }

  const nextTx: Transaction = { ...tx, status: 'under_review' };
  entries.push(
    audit(ctx, { entity: 'claim', entityId: claim.id, action: 'escalate_to_ops', from: 'seller_responded', to: 'under_review' }),
    audit(ctx, { entity: 'transaction', entityId: tx.id, action: 'escalate_to_ops', from: tx.status, to: 'under_review' }),
  );
  return ok({ claim: { ...claim, sellerResponse, status: 'under_review' }, tx: nextTx, audit: entries });
}

/** Only Operations decides disputed claims; a reason is required and recorded. */
export function decideClaim(
  lot: Lot,
  tx: Transaction,
  claim: Claim,
  decision: { outcome: OpsDecision['outcome']; reason: string },
  ctx: Ctx,
): Result<ClaimResult> {
  if (ctx.actor.role !== 'ops') {
    return fail('forbidden', 'Only Operations can decide a disputed claim.', 'The claim is waiting in the Operations queue.');
  }
  if (claim.status !== 'under_review') {
    return fail('invalid_state', 'This claim is not waiting for an Operations decision.', 'Check its current status.');
  }
  if (decision.reason.trim().length < 10) {
    return fail('reason_required', 'Record the reason for this decision (at least a sentence).', 'Both parties will see it.');
  }
  const outcome = decision.outcome === 'approve_adjustment' ? 'price_adjustment' : decision.outcome === 'approve_exit' ? 'exit_refund' : 'claim_rejected';
  const amount = outcome === 'claim_rejected' ? 0 : remedyAmount(lot, tx, claim, outcome);
  const nextTx = applyRemedy(tx, outcome, amount, ctx);
  const opsDecision: OpsDecision = { outcome: decision.outcome, reason: decision.reason.trim(), amount, decidedAt: ctx.now, decidedBy: ctx.actor.id };
  const status = decision.outcome === 'reject' ? 'rejected' : 'resolved';
  return ok({
    claim: { ...claim, opsDecision, status, resolvedAt: ctx.now },
    tx: nextTx,
    audit: [
      audit(ctx, { entity: 'claim', entityId: claim.id, action: `ops_${decision.outcome}`, from: 'under_review', to: status, reason: opsDecision.reason }),
      audit(ctx, { entity: 'transaction', entityId: tx.id, action: 'apply_ops_decision', from: tx.status, to: nextTx.status, reason: opsDecision.reason }),
    ],
  });
}

/** Where a claim stands in the three-outcome model of SPEC §16.5. */
export function classifyClaim(claim: Claim): 'awaiting_seller' | 'clear_exception' | 'disputed' {
  if (!claim.sellerResponse) return 'awaiting_seller';
  return claim.sellerResponse.decision === 'accept' ? 'clear_exception' : 'disputed';
}
