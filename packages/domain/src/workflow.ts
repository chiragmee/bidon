/**
 * Post-win workflow over a state snapshot: transaction steps, lifting checks, claims and the
 * notifications each one sends (SPEC §15, §16, §18). Pure, like operations.ts.
 */
import type { ClaimInput } from './assurance';
import { decideClaim as decideClaimRule, describeRemedy, openClaim as openClaimRule, respondToClaim } from './assurance';
import type { Actor, Ctx } from './context';
import { formatINR, formatMt } from './format';
import type { OpResult } from './operations';
import { clone, stateCtx } from './operations';
import { policyFor } from './policy';
import type { DemoState } from './seed';
import type { TxAction } from './transaction';
import { applyTransition, balanceDue } from './transaction';
import type { Claim, Iso, LotMedia, Notification, OpsDecision, SellerResponse, Transaction } from './types';

function notify(state: DemoState, ctx: Ctx, n: Omit<Notification, 'id' | 'read' | 'at'>) {
  state.notifications.push({ ...n, id: ctx.newId('N'), read: false, at: ctx.now });
}

function rejected<T>(state: DemoState, code: string, what: string, next: string): OpResult<T> {
  return { ok: false, state, error: { code, what, next } };
}

/** Attach uploaded files to the transaction, stamped with the stage and upload time. */
function attach(tx: Transaction, media: readonly LotMedia[], stage: LotMedia['stage'], now: Iso) {
  for (const m of media) tx.media.push({ ...m, stage, uploadedAt: m.uploadedAt || now });
}

/** Run one transaction action (with any files it needs), then notify the other party. */
export function runTxAction(
  state: DemoState,
  txId: string,
  action: TxAction,
  actor: Actor,
  now: Iso,
  media: readonly LotMedia[] = [],
): OpResult<Transaction> {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return rejected(state, 'not_found', 'That transaction does not exist.', 'Go back to your dashboard.');
  const lot = state.lots.find((l) => l.id === tx.lotId);
  /* v8 ignore next -- seeds and closes always create a transaction with its lot */
  if (!lot) return rejected(state, 'not_found', 'The lot for this transaction is missing.', 'Contact Operations.');

  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const r = applyTransition(tx, lot, action, ctx);
  if (!r.ok) return { ok: false, state, error: r.error };

  const updated: Transaction = { ...r.value.tx, media: [...r.value.tx.media] };
  if (action.type === 'record_weighbridge' || action.type === 'record_condition') attach(updated, media, 'lifting', now);
  next.transactions = next.transactions.map((t) => (t.id === txId ? updated : t));
  next.audit.push(...r.value.audit);

  const href = `/transactions/${tx.id}`;
  const to = (userId: string, kind: Notification['kind'], title: string, body: string) => notify(next, ctx, { userId, kind, title, body, href });
  switch (action.type) {
    case 'pay_balance':
      to(tx.sellerId, 'balance_paid', `Balance paid on ${tx.id}`, `${formatINR(balanceDue(tx))} paid (simulated). The buyer will propose a lifting date.`);
      to(tx.buyerId, 'balance_paid', `Balance paid on ${tx.id}`, `${formatINR(balanceDue(tx))} recorded (simulated). Next: propose a lifting date.`);
      break;
    case 'propose_lifting':
      to(tx.sellerId, 'lifting_proposed', `Lifting date proposed for ${tx.id}`, `The buyer proposed ${new Date(action.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Confirm it to proceed.`);
      break;
    case 'confirm_lifting':
      to(tx.buyerId, 'lifting_confirmed', `Lifting confirmed for ${tx.id}`, 'The seller confirmed your lifting date. Record the weighbridge measurement at lifting.');
      break;
    case 'complete':
      for (const u of [tx.buyerId, tx.sellerId]) {
        to(u, 'transaction_completed', `${tx.id} completed`, `Final quantity ${formatMt(updated.finalQtyMt ?? 0)} · final value ${formatINR(updated.finalPayable ?? 0)} (simulated).`);
      }
      break;
    case 'mark_defaulted': {
      const emd = next.emds.find((e) => e.lotId === tx.lotId && e.buyerId === tx.buyerId && e.status === 'succeeded');
      if (emd) emd.status = policyFor(lot.category).emdOutcome.defaulted;
      for (const u of [tx.buyerId, tx.sellerId]) {
        to(u, 'transaction_defaulted', `${tx.id} marked defaulted`, `The balance wasn’t paid by the deadline. EMD ${formatINR(tx.emdAmount)} forfeited (simulated, provisional policy).`);
      }
      break;
    }
    default:
      break;
  }
  return { ok: true, state: next, value: updated };
}

// ── Claims ───────────────────────────────────────────────────────────────────

export function submitClaim(state: DemoState, txId: string, input: ClaimInput, actor: Actor, now: Iso, media: readonly LotMedia[] = []): OpResult<Claim> {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return rejected(state, 'not_found', 'That transaction does not exist.', 'Go back to your dashboard.');
  const lot = state.lots.find((l) => l.id === tx.lotId);
  /* v8 ignore next */
  if (!lot) return rejected(state, 'not_found', 'The lot for this transaction is missing.', 'Contact Operations.');
  if (state.claims.some((c) => c.transactionId === txId && (c.status === 'open' || c.status === 'under_review'))) {
    return rejected(state, 'duplicate', 'A claim is already open on this transaction.', 'Follow its progress on the transaction page.');
  }
  const ids = [...input.mediaIds, ...media.map((m) => m.id)];
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const r = openClaimRule(lot, tx, { ...input, mediaIds: [...new Set(ids)] }, ctx);
  if (!r.ok) return { ok: false, state, error: r.error };
  const updated = { ...r.value.tx, media: [...r.value.tx.media] };
  attach(updated, media, 'claim', now);
  next.transactions = next.transactions.map((t) => (t.id === txId ? updated : t));
  next.claims.push(r.value.claim);
  next.audit.push(...r.value.audit);
  notify(next, ctx, {
    userId: tx.sellerId,
    kind: 'claim_submitted',
    title: `Assurance claim on ${tx.id}`,
    body: `The buyer reports ${r.value.claim.observed}. Accept the remedy or dispute it with evidence.`,
    href: `/transactions/${tx.id}`,
  });
  return { ok: true, state: next, value: r.value.claim };
}

export function sellerRespond(
  state: DemoState,
  claimId: string,
  response: Pick<SellerResponse, 'decision' | 'explanation'>,
  actor: Actor,
  now: Iso,
  media: readonly LotMedia[] = [],
): OpResult<Claim> {
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return rejected(state, 'not_found', 'That claim does not exist.', 'Go back to the transaction.');
  const tx = state.transactions.find((t) => t.id === claim.transactionId);
  const lot = state.lots.find((l) => l.id === claim.lotId);
  /* v8 ignore next */
  if (!tx || !lot) return rejected(state, 'not_found', 'The transaction for this claim is missing.', 'Contact Operations.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const r = respondToClaim(lot, tx, claim, { ...response, mediaIds: media.map((m) => m.id) }, ctx);
  if (!r.ok) return { ok: false, state, error: r.error };
  const updated = { ...r.value.tx, media: [...r.value.tx.media] };
  attach(updated, media, 'claim_response', now);
  next.transactions = next.transactions.map((t) => (t.id === tx.id ? updated : t));
  next.claims = next.claims.map((c) => (c.id === claimId ? r.value.claim : c));
  next.audit.push(...r.value.audit);
  const href = `/transactions/${tx.id}`;
  if (response.decision === 'accept') {
    const text = describeRemedy(claim.requestedRemedy, claim.requestedRemedy === 'price_adjustment' ? updated.adjustment : tx.emdAmount + tx.balancePaid);
    for (const u of [tx.buyerId, tx.sellerId]) {
      notify(next, ctx, { userId: u, kind: 'claim_resolved', title: `Claim ${claim.id} resolved`, body: `The seller accepted. ${text}.`, href });
    }
  } else {
    notify(next, ctx, { userId: tx.buyerId, kind: 'seller_responded', title: `Seller disputed claim ${claim.id}`, body: 'Operations will review the evidence and decide.', href });
    for (const ops of next.users.filter((u) => u.role === 'ops')) {
      notify(next, ctx, { userId: ops.id, kind: 'claim_submitted', title: `Disputed claim ${claim.id} needs review`, body: `${lot.title} · ${tx.id}`, href: `/ops/claims/${claim.id}` });
    }
  }
  return { ok: true, state: next, value: r.value.claim };
}

export function opsDecide(
  state: DemoState,
  claimId: string,
  decision: { outcome: OpsDecision['outcome']; reason: string },
  actor: Actor,
  now: Iso,
): OpResult<Claim> {
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return rejected(state, 'not_found', 'That claim does not exist.', 'Go back to the assurance queue.');
  const tx = state.transactions.find((t) => t.id === claim.transactionId);
  const lot = state.lots.find((l) => l.id === claim.lotId);
  /* v8 ignore next */
  if (!tx || !lot) return rejected(state, 'not_found', 'The transaction for this claim is missing.', 'Contact Operations.');
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const r = decideClaimRule(lot, tx, claim, decision, ctx);
  if (!r.ok) return { ok: false, state, error: r.error };
  next.transactions = next.transactions.map((t) => (t.id === tx.id ? r.value.tx : t));
  next.claims = next.claims.map((c) => (c.id === claimId ? r.value.claim : c));
  next.audit.push(...r.value.audit);
  if (decision.outcome === 'approve_exit') {
    const emd = next.emds.find((e) => e.lotId === lot.id && e.buyerId === tx.buyerId && e.status === 'succeeded');
    if (emd) emd.status = 'refunded';
  }
  const outcome =
    decision.outcome === 'reject'
      ? 'Claim rejected — the original terms apply.'
      : describeRemedy(decision.outcome === 'approve_adjustment' ? 'price_adjustment' : 'exit_refund', r.value.claim.opsDecision?.amount ?? 0) + '.';
  for (const u of [tx.buyerId, tx.sellerId]) {
    notify(next, ctx, { userId: u, kind: 'claim_resolved', title: `Operations decided claim ${claim.id}`, body: outcome, href: `/transactions/${tx.id}` });
  }
  return { ok: true, state: next, value: r.value.claim };
}
