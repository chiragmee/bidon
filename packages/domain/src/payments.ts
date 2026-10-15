/**
 * Offline payments (docs/PHASE1_MVP.md). The payer reports a payment made outside Bid ON; the receiving seller
 * checks their own account and confirms or rejects it. Bid ON never collects, moves or verifies money — it keeps
 * the shared record and its history. Pure over a state snapshot, like operations.ts.
 */
import { deriveAuctionStatus } from './auction';
import type { Actor } from './context';
import { audit, ms } from './context';
import { eligibilityRejection, isEligible } from './eligibilityPolicy';
import { PAYMENT_METHODS } from './eligibilityPolicy';
import { formatINR } from './format';
import type { OpResult } from './operations';
import { clone, stateCtx } from './operations';
import type { DemoState } from './seed';
import type { PaymentInput, RefundInput } from './paymentRules';
import { paymentProblem, refundProblem } from './paymentRules';
import type { EmdRecord, Iso, PaymentDecision, PaymentSubmission, RefundRecord, Rupees } from './types';

export type { PaymentInput, RefundInput } from './paymentRules';
export { paymentProblem, refundProblem } from './paymentRules';

function rejected<T>(state: DemoState, code: string, what: string, next: string): OpResult<T> {
  return { ok: false, state, error: { code, what, next } };
}

const ownReceipt = (state: DemoState, actor: Actor) => (docId: string) => {
  const companyId = state.users.find((u) => u.id === actor.id)?.companyId;
  return state.documents.some((d) => d.id === docId && d.kind === 'payment_receipt' && d.companyId === companyId);
};

/** The buyer's current EMD record for a lot (one per buyer and lot). */
export function emdFor(state: Pick<DemoState, 'emds'>, lotId: string, buyerId: string): EmdRecord | undefined {
  return state.emds.find((e) => e.lotId === lotId && e.buyerId === buyerId);
}

/** Buyer reports an EMD paid outside Bid ON. It does not allow bidding until the seller confirms it. */
export function submitEmd(state: DemoState, lotId: string, input: PaymentInput, actor: Actor, now: Iso): OpResult<EmdRecord> {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot || lot.status === 'draft') return rejected(state, 'not_found', 'That lot does not exist.', 'Go back to the auctions list.');
  if (actor.role !== 'buyer') return rejected(state, 'not_buyer', 'Only buyer accounts pay an EMD.', 'Sign in with a buyer account.');
  if (lot.sellerId === actor.id) return rejected(state, 'own_lot', 'Sellers cannot bid on their own lots.', 'Use a buyer account for other lots.');
  const user = state.users.find((u) => u.id === actor.id);
  const company = state.companies.find((c) => c.id === user?.companyId);
  if (!isEligible(company)) return { ok: false, state, error: eligibilityRejection(company) };
  const status = deriveAuctionStatus(lot, now);
  if (status !== 'live' && status !== 'scheduled') return rejected(state, 'auction_closed', 'This auction has closed, so no EMD is needed.', 'Browse other live auctions.');
  const existing = emdFor(state, lotId, actor.id);
  if (existing && existing.status === 'submitted') return rejected(state, 'already_submitted', 'Your EMD payment is already waiting for the seller to confirm.', 'You’ll be notified when the seller confirms it.');
  if (existing && existing.status !== 'rejected') return rejected(state, 'already_paid', 'Your EMD for this lot is already confirmed.', 'You can place a bid now.');
  const problem = paymentProblem(input, lot.emdAmount, now, ownReceipt(state, actor));
  if (problem) return { ok: false, state, error: problem };

  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const submission: PaymentSubmission = { ...input, reference: input.reference.trim(), payerName: input.payerName.trim(), submittedAt: now, submittedBy: actor.id };
  let emd: EmdRecord;
  if (existing) {
    // Corrected after a rejection: same record, the earlier submission and decision stay in the history.
    emd = { ...existing, status: 'submitted', reference: submission.reference, payment: submission, decision: null, history: [...(existing.history ?? []), { type: 'submitted', submission }] };
    next.emds = next.emds.map((e) => (e.id === existing.id ? emd : e));
  } else {
    emd = { id: ctx.newId('EMD'), lotId, buyerId: actor.id, amount: lot.emdAmount, status: 'submitted', reference: submission.reference, mode: 'manual', createdAt: now, payment: submission, decision: null, refund: null, history: [{ type: 'submitted', submission }] };
    next.emds.push(emd);
  }
  next.audit.push(audit(ctx, { entity: 'emd', entityId: emd.id, action: existing ? 'resubmit_emd' : 'submit_emd', from: existing?.status ?? null, to: 'submitted' }));
  next.notifications.push({ id: ctx.newId('N'), userId: lot.sellerId, kind: 'emd_submitted', title: `EMD reported on ${lot.id}`, body: `${formatINR(input.amount)} by ${PAYMENT_METHODS.find((m) => m.id === input.method)?.label ?? input.method}, ref ${submission.reference}. Check your account, then confirm or reject it.`, href: `/seller/lots/${lot.id}`, read: false, at: now });
  return { ok: true, state: next, value: emd };
}

/** The lot's seller confirms receipt (bidding opens for the buyer) or rejects it with a reason. */
export function decideEmd(state: DemoState, emdId: string, input: { decision: 'confirmed' | 'rejected'; reason: string }, actor: Actor, now: Iso): OpResult<EmdRecord> {
  const emd = state.emds.find((e) => e.id === emdId);
  const lot = emd && state.lots.find((l) => l.id === emd.lotId);
  if (!emd || !lot) return rejected(state, 'not_found', 'That EMD record does not exist.', 'Refresh the lot page.');
  if (actor.role !== 'seller' || lot.sellerId !== actor.id) return rejected(state, 'forbidden', 'Only the seller of this lot can confirm its EMD payments.', 'Sign in as the lot’s seller.');
  if (emd.status !== 'submitted') return rejected(state, 'not_pending', 'This EMD payment isn’t waiting for confirmation.', 'Refresh the page to see its current status.');
  const reason = input.reason.trim();
  if (input.decision === 'rejected' && reason.length < 5) return rejected(state, 'reason_required', 'Say why the payment is rejected (for example “no credit with this UTR”).', 'The buyer sees this reason and can correct it.');

  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const decision: PaymentDecision = { decision: input.decision, reason: reason || null, decidedBy: actor.id, decidedAt: now };
  // Confirmed after the auction closed without this buyer winning: the money is owed back straight away.
  const closed = !['live', 'scheduled'].includes(deriveAuctionStatus(lot, now));
  const lost = closed && !(lot.winningBidId && next.bids.find((b) => b.id === lot.winningBidId)?.bidderId === emd.buyerId);
  const status: EmdRecord['status'] = input.decision === 'rejected' ? 'rejected' : lost ? 'refund_due' : 'confirmed';
  const updated: EmdRecord = { ...emd, status, decision, history: [...(emd.history ?? []), { type: 'decided', decision }] };
  next.emds = next.emds.map((e) => (e.id === emdId ? updated : e));
  next.audit.push(audit(ctx, { entity: 'emd', entityId: emdId, action: input.decision === 'confirmed' ? 'confirm_emd' : 'reject_emd', from: 'submitted', to: status, reason: reason || null }));
  next.notifications.push(
    input.decision === 'confirmed'
      ? { id: ctx.newId('N'), userId: emd.buyerId, kind: 'emd_confirmed', title: `EMD confirmed on ${lot.id}`, body: closed ? 'The seller confirmed receipt. The auction has closed; your refund is due.' : 'The seller confirmed receipt. You can now bid.', href: `/auctions/${lot.id}`, read: false, at: now }
      : { id: ctx.newId('N'), userId: emd.buyerId, kind: 'emd_rejected', title: `EMD not confirmed on ${lot.id}`, body: `The seller says: “${reason}”. Correct the details and submit again.`, href: `/auctions/${lot.id}`, read: false, at: now },
  );
  return { ok: true, state: next, value: updated };
}

/** The seller records an EMD refund they made outside Bid ON (losing bidder, or an exit remedy). */
export function recordEmdRefund(state: DemoState, emdId: string, input: RefundInput, actor: Actor, now: Iso): OpResult<EmdRecord> {
  const emd = state.emds.find((e) => e.id === emdId);
  const lot = emd && state.lots.find((l) => l.id === emd.lotId);
  if (!emd || !lot) return rejected(state, 'not_found', 'That EMD record does not exist.', 'Refresh the lot page.');
  if (actor.role !== 'seller' || lot.sellerId !== actor.id) return rejected(state, 'forbidden', 'Only the seller who received this EMD records its refund.', 'Sign in as the lot’s seller.');
  if (emd.status !== 'refund_due') return rejected(state, 'nothing_due', 'No refund is due on this EMD.', 'Refresh the page to see its current status.');
  const problem = refundProblem(input, emd.amount, now);
  if (problem) return { ok: false, state, error: problem };
  if (input.amount !== emd.amount) return rejected(state, 'invalid_refund', `Refund the full EMD of ${formatINR(emd.amount)}.`, 'EMD refunds are made in full.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const refund: RefundRecord = { ...input, reference: input.reference.trim(), note: input.note.trim(), recordedBy: actor.id, recordedAt: now };
  const updated: EmdRecord = { ...emd, status: 'refunded', refund, history: [...(emd.history ?? []), { type: 'refund_recorded', refund }] };
  next.emds = next.emds.map((e) => (e.id === emdId ? updated : e));
  next.audit.push(audit(ctx, { entity: 'emd', entityId: emdId, action: 'record_emd_refund', from: 'refund_due', to: 'refunded', reason: `Ref ${refund.reference}` }));
  next.notifications.push({ id: ctx.newId('N'), userId: emd.buyerId, kind: 'refund_recorded', title: `EMD refund recorded on ${lot.id}`, body: `The seller recorded a refund of ${formatINR(refund.amount)} on ${refund.refundedOn}, ref ${refund.reference}. Check your account.`, href: `/auctions/${lot.id}`, read: false, at: now });
  return { ok: true, state: next, value: updated };
}

/** Bank details buyers pay into — shown only to eligible buyers (data minimisation). */
export function paymentInstructions(state: DemoState, sellerId: string) {
  const companyId = state.users.find((u) => u.id === sellerId)?.companyId;
  const company = state.companies.find((c) => c.id === companyId);
  const b = company?.eligibility?.bankDetails;
  return b ? { payee: b.accountName, bankName: b.bankName, accountNumber: b.accountNumber, ifsc: b.ifsc, upiId: b.upiId || null } : null;
}

export const isPast = (iso: Iso, now: Iso) => ms(iso) <= ms(now);

/** One EMD as both parties see it: the same record, status and history. */
export interface EmdView {
  id: string;
  lotId: string;
  lotTitle: string;
  buyerId: string;
  /** The buyer's business name (shown to the seller who receives the money). */
  buyer: string;
  amount: Rupees;
  status: EmdRecord['status'];
  mode: EmdRecord['mode'];
  payment: PaymentSubmission | null;
  decision: PaymentDecision | null;
  refund: RefundRecord | null;
  history: NonNullable<EmdRecord['history']>;
}

export function emdView(state: DemoState, e: EmdRecord): EmdView {
  const companyId = state.users.find((u) => u.id === e.buyerId)?.companyId;
  return {
    id: e.id,
    lotId: e.lotId,
    lotTitle: state.lots.find((l) => l.id === e.lotId)?.title ?? e.lotId,
    buyerId: e.buyerId,
    buyer: state.companies.find((c) => c.id === companyId)?.name ?? 'Buyer',
    amount: e.amount,
    status: e.status,
    mode: e.mode,
    payment: e.payment ?? null,
    decision: e.decision ?? null,
    refund: e.refund ?? null,
    history: e.history ?? [],
  };
}
