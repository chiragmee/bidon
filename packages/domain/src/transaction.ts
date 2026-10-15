import type { Ctx } from './context';
import { addHours, audit, ms } from './context';
import { formatINR } from './format';
import { policyFor } from './policy';
import type {
  AuditEntry,
  Bid,
  Iso,
  Lot,
  Rejection,
  Result,
  Role,
  Rupees,
  Transaction,
  TransactionStatus,
} from './types';
import { fail, ok } from './types';
import type { PaymentInput, RefundInput } from './paymentRules';
import { paymentProblem, refundProblem } from './paymentRules';

// ── Money ────────────────────────────────────────────────────────────────────

/** CLAUDE.md: payable = measured quantity × winning price per MT. */
export function computePayable(measuredMt: number, pricePerMt: Rupees): Rupees {
  return Math.round(measuredMt * pricePerMt);
}

/** Balance due after winning, on the estimated quantity; EMD counts toward the price. */
export function balanceDue(tx: Pick<Transaction, 'estimatedQtyMt' | 'pricePerMt' | 'emdAmount'>): Rupees {
  return Math.max(0, computePayable(tx.estimatedQtyMt, tx.pricePerMt) - tx.emdAmount);
}

/**
 * Money the seller owes back, recorded refunds deducted: everything the buyer paid in balance after an exit
 * (the EMD is refunded on its own record), or what was paid above the final payable after measurement.
 */
export function refundDue(tx: Pick<Transaction, 'resolution' | 'balancePaid' | 'emdAmount' | 'finalPayable' | 'refunds' | 'status'>): Rupees {
  const recorded = (tx.refunds ?? []).reduce((n, r) => n + r.amount, 0);
  let owed = 0;
  if (tx.resolution === 'exit_refund') owed = tx.balancePaid;
  else if (tx.finalPayable !== null && (tx.status === 'completed' || tx.status === 'resolved')) owed = Math.max(0, tx.emdAmount + tx.balancePaid - tx.finalPayable);
  return Math.max(0, owed - recorded);
}

export interface Reconciliation {
  payable: Rupees;
  adjustment: Rupees;
  paid: Rupees;
  /** > 0: buyer owes more · < 0: refund due to buyer (paid outside AuctionIT and recorded here). */
  difference: Rupees;
}

export function reconcile(tx: Transaction): Reconciliation | null {
  if (!tx.weighbridge) return null;
  const payable = computePayable(tx.weighbridge.measuredMt, tx.pricePerMt);
  const paid = tx.emdAmount + tx.balancePaid;
  return { payable, adjustment: tx.adjustment, paid, difference: payable - tx.adjustment - paid };
}

// ── Creation ─────────────────────────────────────────────────────────────────

export function createTransaction(lot: Lot, winningBid: Bid, ctx: Ctx): Transaction {
  const p = policyFor(lot.category);
  return {
    id: ctx.newId('TX'),
    lotId: lot.id,
    buyerId: winningBid.bidderId,
    sellerId: lot.sellerId,
    winningBidId: winningBid.id,
    pricePerMt: winningBid.amountPerMt,
    estimatedQtyMt: lot.estimatedQtyMt,
    emdAmount: lot.emdAmount,
    status: 'won_awaiting_balance',
    balancePaid: 0,
    balancePaidAt: null,
    paymentDeadline: addHours(ctx.now, p.paymentDeadlineHours),
    liftingProposedFor: null,
    liftingVehicle: null,
    liftingConfirmedAt: null,
    loadingCompletedAt: null,
    weighbridge: null,
    condition: null,
    finalQtyMt: null,
    finalPayable: null,
    adjustment: 0,
    resolution: null,
    createdAt: ctx.now,
    completedAt: null,
    media: [],
  };
}

// ── Transitions ──────────────────────────────────────────────────────────────

export type TxAction =
  /** Buyer reports a balance payment made outside AuctionIT; the seller then confirms or rejects it. */
  | { type: 'submit_balance_payment'; payment: PaymentInput }
  | { type: 'confirm_balance_payment' }
  | { type: 'reject_balance_payment'; reason: string }
  /** Seller records a refund they made outside AuctionIT (measured quantity below what was paid, or an exit). */
  | { type: 'record_refund'; refund: RefundInput }
  | { type: 'propose_lifting'; at: Iso; vehicle: string }
  | { type: 'confirm_lifting' }
  | {
      type: 'record_weighbridge';
      ticketRef: string;
      weighbridge: string;
      grossMt: number | null;
      tareMt: number | null;
      measuredMt: number;
      ticketMediaId: string | null;
    }
  | { type: 'record_condition'; observedContaminationPct: number; notes: string; photoMediaIds: string[] }
  | { type: 'complete' }
  | { type: 'mark_defaulted'; reason: string };

export type TxActionType = TxAction['type'];

interface Rule {
  role: Role;
  from: readonly TransactionStatus[];
  label: string;
}

/** Who may do what, from which states. Anything not listed is rejected with a reason. */
export const TX_RULES: Record<TxActionType, Rule> = {
  submit_balance_payment: { role: 'buyer', from: ['won_awaiting_balance'], label: 'Report the balance payment' },
  confirm_balance_payment: { role: 'seller', from: ['won_awaiting_balance'], label: 'Confirm the balance payment' },
  reject_balance_payment: { role: 'seller', from: ['won_awaiting_balance'], label: 'Reject the balance payment' },
  record_refund: { role: 'seller', from: ['completed', 'resolved'], label: 'Record a refund' },
  propose_lifting: { role: 'buyer', from: ['balance_paid', 'lifting_proposed'], label: 'Propose lifting date' },
  confirm_lifting: { role: 'seller', from: ['lifting_proposed'], label: 'Confirm lifting date' },
  record_weighbridge: { role: 'buyer', from: ['lifting_scheduled'], label: 'Record weighbridge measurement' },
  record_condition: { role: 'buyer', from: ['lifting_scheduled'], label: 'Record condition check' },
  complete: { role: 'buyer', from: ['material_checked'], label: 'Complete transaction' },
  mark_defaulted: { role: 'ops', from: ['won_awaiting_balance'], label: 'Mark as defaulted' },
};

const ROLE_NAME: Record<Role, string> = { guest: 'a guest', buyer: 'the buyer', seller: 'the seller', ops: 'Operations' };

export const STATUS_LABEL: Record<TransactionStatus, string> = {
  won_awaiting_balance: 'Won — awaiting balance payment',
  balance_paid: 'Balance paid — awaiting lifting date',
  lifting_proposed: 'Lifting date proposed — awaiting seller',
  lifting_scheduled: 'Lifting scheduled',
  material_checked: 'Material checked',
  completed: 'Completed',
  claim_opened: 'Assurance claim opened',
  under_review: 'Under Operations review',
  resolved: 'Resolved',
  defaulted: 'Defaulted',
};

/** Can this actor take this action now? Returns the specific reason if not. */
export function canTransition(tx: Transaction, action: TxActionType, ctx: Ctx): Rejection | null {
  const rule = TX_RULES[action];
  const { actor } = ctx;
  const isParty =
    actor.role === 'ops' ||
    (actor.role === 'buyer' && actor.id === tx.buyerId) ||
    (actor.role === 'seller' && actor.id === tx.sellerId);

  if (actor.role !== rule.role || !isParty) {
    return {
      code: 'forbidden',
      what: `Only ${ROLE_NAME[rule.role]} on this transaction can ${rule.label.toLowerCase()}.`,
      next: rule.role === 'ops' ? 'Ask Operations to take this step.' : `Sign in as ${ROLE_NAME[rule.role]} to continue.`,
    };
  }
  if (!rule.from.includes(tx.status)) {
    return {
      code: 'invalid_state',
      what: `You can't ${rule.label.toLowerCase()} while the transaction is "${STATUS_LABEL[tx.status]}".`,
      next: nextStep(tx)?.label ? `Next step: ${nextStep(tx)?.label}.` : 'No further action is needed.',
    };
  }
  const pending = !!tx.balancePayment && !tx.balancePayment.decision;
  if (action === 'submit_balance_payment' && pending) {
    return { code: 'already_submitted', what: 'Your balance payment is already waiting for the seller to confirm.', next: 'You’ll be notified when the seller confirms it.' };
  }
  if ((action === 'confirm_balance_payment' || action === 'reject_balance_payment') && !pending) {
    return { code: 'no_payment_reported', what: 'The buyer hasn’t reported a balance payment yet.', next: 'You’ll be notified when they do.' };
  }
  if (action === 'mark_defaulted' && pending) {
    return { code: 'payment_pending', what: 'The buyer has reported a balance payment that the seller hasn’t confirmed yet.', next: 'Wait for the seller to confirm or reject it.' };
  }
  if (action === 'record_refund' && refundDue(tx) <= 0) {
    return { code: 'nothing_due', what: 'No refund is due on this transaction.', next: 'Nothing to record.' };
  }
  if (action === 'mark_defaulted' && ms(ctx.now) <= ms(tx.paymentDeadline)) {
    return {
      code: 'deadline_not_passed',
      what: 'The payment deadline has not passed yet.',
      next: `The buyer has until ${new Date(tx.paymentDeadline).toLocaleString('en-IN')} to pay (provisional policy).`,
    };
  }
  return null;
}

export interface TxResult {
  tx: Transaction;
  audit: AuditEntry[];
}

export function applyTransition(tx: Transaction, lot: Lot, action: TxAction, ctx: Ctx): Result<TxResult> {
  const blocked = canTransition(tx, action.type, ctx);
  if (blocked) return { ok: false, error: blocked };

  let next: Transaction = { ...tx };
  switch (action.type) {
    case 'submit_balance_payment': {
      const problem = paymentProblem(action.payment, balanceDue(tx), ctx.now, () => true);
      if (problem) return { ok: false, error: problem };
      const submission = { ...action.payment, reference: action.payment.reference.trim(), payerName: action.payment.payerName.trim(), submittedAt: ctx.now, submittedBy: ctx.actor.id };
      next = { ...next, balancePayment: { submission, decision: null }, paymentHistory: [...(tx.paymentHistory ?? []), { type: 'submitted', submission }] };
      break;
    }
    case 'confirm_balance_payment':
    case 'reject_balance_payment': {
      const reason = action.type === 'reject_balance_payment' ? action.reason.trim() : '';
      if (action.type === 'reject_balance_payment' && reason.length < 5) {
        return fail('reason_required', 'Say why the payment is rejected (for example “no credit with this UTR”).', 'The buyer sees this reason and can correct it.');
      }
      const decision = { decision: action.type === 'confirm_balance_payment' ? ('confirmed' as const) : ('rejected' as const), reason: reason || null, decidedBy: ctx.actor.id, decidedAt: ctx.now };
      const submission = tx.balancePayment?.submission;
      /* v8 ignore next -- canTransition already requires a reported payment */
      if (!submission) return fail('no_payment_reported', 'The buyer hasn’t reported a balance payment yet.', 'You’ll be notified when they do.');
      next = { ...next, balancePayment: { submission, decision }, paymentHistory: [...(tx.paymentHistory ?? []), { type: 'decided', decision }] };
      if (decision.decision === 'confirmed') next = { ...next, balancePaid: submission.amount, balancePaidAt: ctx.now, status: 'balance_paid' };
      break;
    }
    case 'record_refund': {
      const due = refundDue(tx);
      const problem = refundProblem(action.refund, due, ctx.now);
      if (problem) return { ok: false, error: problem };
      const refund = { ...action.refund, reference: action.refund.reference.trim(), note: action.refund.note.trim(), recordedBy: ctx.actor.id, recordedAt: ctx.now };
      next = { ...next, refunds: [...(tx.refunds ?? []), refund], paymentHistory: [...(tx.paymentHistory ?? []), { type: 'refund_recorded', refund }] };
      break;
    }
    case 'propose_lifting': {
      if (!action.at || Number.isNaN(ms(action.at))) {
        return fail('invalid_date', 'Choose a lifting date.', 'Pick the day your truck will arrive.');
      }
      if (ms(action.at) < ms(ctx.now)) {
        return fail('invalid_date', 'The lifting date is in the past.', 'Choose today or a later date.');
      }
      if (!action.vehicle.trim()) {
        return fail('vehicle_required', 'Enter the vehicle number for the gate pass.', 'For example MH 04 GP 8812.');
      }
      next = { ...next, liftingProposedFor: action.at, liftingVehicle: action.vehicle.trim(), status: 'lifting_proposed' };
      break;
    }
    case 'confirm_lifting': {
      next = { ...next, liftingConfirmedAt: ctx.now, status: 'lifting_scheduled' };
      break;
    }
    case 'record_weighbridge': {
      if (tx.weighbridge) {
        return fail('already_recorded', 'The weighbridge measurement is already recorded.', 'It cannot be changed; raise a claim if it is wrong.');
      }
      const missing: string[] = [];
      if (!action.ticketRef.trim()) missing.push('ticket reference');
      if (!action.weighbridge.trim()) missing.push('weighbridge name');
      if (!(action.measuredMt > 0)) missing.push('measured quantity');
      if (!action.ticketMediaId) missing.push('ticket photo or scan');
      if (missing.length) {
        return fail('incomplete_measurement', `The measurement is missing: ${missing.join(', ')}.`, 'Fill in every field so the measurement can be accepted.');
      }
      if (action.grossMt !== null && action.tareMt !== null) {
        const net = action.grossMt - action.tareMt;
        if (Math.abs(net - action.measuredMt) > 0.05) {
          return fail('net_mismatch', `Gross minus tare is ${net.toFixed(2)} MT, not ${action.measuredMt} MT.`, 'Check the ticket and correct the figures.');
        }
      }
      next = {
        ...next,
        weighbridge: {
          ticketRef: action.ticketRef.trim(),
          weighbridge: action.weighbridge.trim(),
          grossMt: action.grossMt,
          tareMt: action.tareMt,
          measuredMt: action.measuredMt,
          ticketMediaId: action.ticketMediaId,
          measuredAt: ctx.now,
          recordedBy: ctx.actor.id,
        },
      };
      break;
    }
    case 'record_condition': {
      if (!lot.assurance.enabled) {
        return fail('not_assured', 'Condition checks are part of Lot Assurance; this is a standard lot.', 'Record the weighbridge measurement, then complete.');
      }
      if (tx.condition) {
        return fail('already_recorded', 'The condition check is already recorded.', 'It cannot be changed; raise a claim if needed.');
      }
      const v = action.observedContaminationPct;
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return fail('invalid_value', 'Observed contamination must be between 0 and 100%.', 'Enter your estimate from the lifting inspection.');
      }
      if (action.photoMediaIds.length === 0) {
        return fail('evidence_required', 'Attach at least one timestamped lifting photo.', 'Add a photo of the material as loaded.');
      }
      next = {
        ...next,
        condition: {
          observedContaminationPct: v,
          notes: action.notes.trim(),
          photoMediaIds: action.photoMediaIds,
          checkedAt: ctx.now,
          recordedBy: ctx.actor.id,
        },
      };
      break;
    }
    case 'complete': {
      const wb = tx.weighbridge;
      /* v8 ignore next 3 -- material_checked guarantees a measurement; kept as a safety net */
      if (!wb) {
        return fail('incomplete', 'The weighbridge measurement is missing.', 'Record it before completing.');
      }
      const payable = computePayable(wb.measuredMt, tx.pricePerMt);
      next = {
        ...next,
        status: 'completed',
        loadingCompletedAt: ctx.now,
        finalQtyMt: wb.measuredMt,
        finalPayable: payable - tx.adjustment,
        resolution: 'completed',
        completedAt: ctx.now,
      };
      break;
    }
    case 'mark_defaulted': {
      if (!action.reason.trim()) {
        return fail('reason_required', 'Give a reason for marking this transaction defaulted.', 'It is recorded in the audit trail.');
      }
      next = { ...next, status: 'defaulted' };
      break;
    }
  }

  // Both lifting records present (condition only for assured lots) → material checked.
  if (
    next.status === 'lifting_scheduled' &&
    next.weighbridge &&
    (next.condition || !lot.assurance.enabled)
  ) {
    next = { ...next, status: 'material_checked' };
  }

  const entries = [
    audit(ctx, {
      entity: 'transaction',
      entityId: tx.id,
      action: action.type,
      from: tx.status,
      to: next.status,
      reason:
        action.type === 'mark_defaulted'
          ? action.reason
          : action.type === 'reject_balance_payment'
            ? action.reason.trim()
            : action.type === 'submit_balance_payment'
              ? `${formatINR(action.payment.amount)} · ref ${action.payment.reference.trim()}`
              : action.type === 'record_refund'
                ? `${formatINR(action.refund.amount)} · ref ${action.refund.reference.trim()}`
                : null,
    }),
  ];
  return ok({ tx: next, audit: entries });
}

// ── Guidance for the UI ──────────────────────────────────────────────────────

export interface NextStep {
  role: Role;
  label: string;
  action: TxActionType | 'respond_claim' | 'decide_claim' | null;
}

/** The single next action and who owns it — drives "one clear next action" on every card. */
export function nextStep(tx: Transaction, assured = true): NextStep | null {
  switch (tx.status) {
    case 'won_awaiting_balance':
      return tx.balancePayment && !tx.balancePayment.decision
        ? { role: 'seller', label: `Confirm the balance payment of ${formatINR(tx.balancePayment.submission.amount)}`, action: 'confirm_balance_payment' }
        : { role: 'buyer', label: `Pay the balance of ${formatINR(balanceDue(tx))} and report it`, action: 'submit_balance_payment' };
    case 'balance_paid':
      return { role: 'buyer', label: 'Propose a lifting date', action: 'propose_lifting' };
    case 'lifting_proposed':
      return { role: 'seller', label: 'Confirm the lifting date', action: 'confirm_lifting' };
    case 'lifting_scheduled':
      if (!tx.weighbridge) return { role: 'buyer', label: 'Record the weighbridge measurement', action: 'record_weighbridge' };
      if (assured && !tx.condition) return { role: 'buyer', label: 'Record the condition check', action: 'record_condition' };
      return null;
    case 'material_checked':
      return { role: 'buyer', label: 'Complete the transaction', action: 'complete' };
    case 'claim_opened':
      return { role: 'seller', label: 'Respond to the assurance claim', action: 'respond_claim' };
    case 'under_review':
      return { role: 'ops', label: 'Review the disputed claim', action: 'decide_claim' };
    default:
      return null;
  }
}

/** Stepper: Won → Balance paid → Lifting scheduled → Material checked → Completed. */
export const TX_STEPS = ['Won', 'Balance paid', 'Lifting scheduled', 'Material checked', 'Completed'] as const;

/**
 * `current` is the step being worked towards (1-based); steps before it are done, and 6 means all
 * done. A claim takes the place of "Completed" — material has been checked but completion is on hold.
 */
export function stepperState(tx: Transaction): { current: number; claim: boolean; done: boolean } {
  const index: Record<TransactionStatus, number> = {
    won_awaiting_balance: 2,
    balance_paid: 3,
    lifting_proposed: 3,
    lifting_scheduled: 4,
    material_checked: 5,
    completed: 6,
    claim_opened: 5,
    under_review: 5,
    resolved: 6,
    defaulted: 2,
  };
  return {
    current: index[tx.status],
    claim: tx.status === 'claim_opened' || tx.status === 'under_review',
    done: tx.status === 'completed' || tx.status === 'resolved',
  };
}
