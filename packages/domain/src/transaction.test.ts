import { describe, expect, it } from 'vitest';
import { at, bid, checkedTx, ctx, lot, payment, T0, tx } from './fixtures';
import {
  applyTransition,
  balanceDue,
  canTransition,
  computePayable,
  createTransaction,
  nextStep,
  reconcile,
  refundDue,
  stepperState,
  TX_RULES,
  type TxAction,
} from './transaction';
import type { Transaction, TransactionStatus } from './types';

const buyer = ctx('buyer', 'U-BUYER');
const seller = ctx('seller', 'U-SELLER');
const ops = ctx('ops', 'U-OPS');

const weighbridge: TxAction = {
  type: 'record_weighbridge',
  ticketRef: 'WB-2025-10429',
  weighbridge: 'Raipur Gate #2',
  grossMt: 54.2,
  tareMt: 15.6,
  measuredMt: 38.6,
  ticketMediaId: 'M-T',
};
const condition: TxAction = { type: 'record_condition', observedContaminationPct: 6, notes: 'Clean', photoMediaIds: ['P1'] };

function run(t: Transaction, action: TxAction, c = buyer, l = lot()) {
  const r = applyTransition(t, l, action, c);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.what}`);
  return r.value;
}
function reject(t: Transaction, action: TxAction, c = buyer, l = lot()) {
  const r = applyTransition(t, l, action, c);
  if (r.ok) throw new Error('expected rejection');
  expect(r.error.what).toBeTruthy();
  expect(r.error.next).toBeTruthy();
  return r.error.code;
}

describe('money', () => {
  it('payable = measured × rate (TX-1042: 38.6 × ₹36,000 = ₹13,89,600)', () => {
    expect(computePayable(38.6, 36_000)).toBe(1_389_600);
  });
  it('balance due = estimate × rate − EMD (₹13,40,000)', () => {
    expect(balanceDue(tx())).toBe(1_340_000);
    expect(balanceDue(tx({ estimatedQtyMt: 1, emdAmount: 100_000 }))).toBe(0);
  });
  it('reconcile shows the refund due after weighing', () => {
    expect(reconcile(tx())).toBeNull();
    expect(reconcile(checkedTx())).toEqual({ payable: 1_389_600, adjustment: 0, paid: 1_440_000, difference: -50_400 });
  });
});

describe('createTransaction', () => {
  it('starts awaiting balance with a policy payment deadline', () => {
    const t = createTransaction(lot(), bid(36_000, 'U-BUYER'), buyer);
    expect(t).toMatchObject({ status: 'won_awaiting_balance', pricePerMt: 36_000, buyerId: 'U-BUYER', emdAmount: 100_000 });
    expect(Date.parse(t.paymentDeadline) - Date.parse(T0)).toBe(72 * 3_600_000);
  });
});

describe('happy path: won → completed (assured lot)', () => {
  it('walks every step with the right role', () => {
    let t = tx();
    t = run(t, { type: 'submit_balance_payment', payment: payment(1_340_000, T0) }).tx;
    expect(t).toMatchObject({ status: 'won_awaiting_balance', balancePaid: 0, balancePayment: { submission: { amount: 1_340_000 }, decision: null } });
    t = run(t, { type: 'confirm_balance_payment' }, seller).tx;
    expect(t).toMatchObject({ status: 'balance_paid', balancePaid: 1_340_000, balancePayment: { decision: { decision: 'confirmed', decidedBy: 'U-SELLER' } } });
    t = run(t, { type: 'propose_lifting', at: at(60 * 24), vehicle: ' MH 04 GP 8812 ' }).tx;
    expect(t).toMatchObject({ status: 'lifting_proposed', liftingVehicle: 'MH 04 GP 8812' });
    t = run(t, { type: 'confirm_lifting' }, seller).tx;
    expect(t.status).toBe('lifting_scheduled');
    t = run(t, weighbridge).tx;
    expect(t.status).toBe('lifting_scheduled'); // condition still missing on an assured lot
    const r = run(t, condition);
    t = r.tx;
    expect(t.status).toBe('material_checked');
    expect(r.audit[0]).toMatchObject({ actorId: 'U-BUYER', from: 'lifting_scheduled', to: 'material_checked' });
    t = run(t, { type: 'complete' }).tx;
    expect(t).toMatchObject({ status: 'completed', finalQtyMt: 38.6, finalPayable: 1_389_600, resolution: 'completed' });
    expect(t.loadingCompletedAt).toBe(T0);
  });

  it('standard lot needs only the weighbridge', () => {
    const std = lot({ assurance: { enabled: false, agreedAt: null } });
    const t = run(tx({ status: 'lifting_scheduled' }), weighbridge, buyer, std).tx;
    expect(t.status).toBe('material_checked');
    expect(reject(tx({ status: 'lifting_scheduled' }), condition, buyer, std)).toBe('not_assured');
  });

  it('buyer can re-propose a lifting date before the seller confirms', () => {
    const t = run(tx({ status: 'lifting_proposed' }), { type: 'propose_lifting', at: at(100), vehicle: 'X' }).tx;
    expect(t.liftingProposedFor).toBe(at(100));
  });
});

describe('role and state guards', () => {
  it('every action rejects the wrong role', () => {
    for (const [action, rule] of Object.entries(TX_RULES)) {
      const wrong = rule.role === 'buyer' ? seller : buyer;
      const t = tx({ status: rule.from[0] });
      expect(canTransition(t, action as keyof typeof TX_RULES, wrong)?.code).toBe('forbidden');
    }
  });

  it('a buyer who is not on this transaction is rejected', () => {
    expect(reject(tx(), { type: 'submit_balance_payment', payment: payment(1_340_000, T0) }, ctx('buyer', 'U-STRANGER'))).toBe('forbidden');
  });

  it('every action rejects states outside its "from" list, with the next step', () => {
    const all: TransactionStatus[] = ['won_awaiting_balance', 'balance_paid', 'lifting_proposed', 'lifting_scheduled', 'material_checked', 'completed', 'claim_opened', 'under_review', 'resolved', 'defaulted'];
    for (const [action, rule] of Object.entries(TX_RULES)) {
      const c = rule.role === 'buyer' ? buyer : rule.role === 'seller' ? seller : ops;
      for (const s of all.filter((x) => !rule.from.includes(x))) {
        expect(canTransition(tx({ status: s }), action as keyof typeof TX_RULES, c)?.code).toBe('invalid_state');
      }
    }
  });

  it('cannot complete before material is checked (won ≠ completed)', () => {
    expect(reject(tx(), { type: 'complete' })).toBe('invalid_state');
    expect(reject(tx({ status: 'lifting_scheduled' }), { type: 'complete' })).toBe('invalid_state');
  });

  it('wrong-role error names who can act', () => {
    expect(canTransition(tx({ status: 'won_awaiting_balance' }), 'mark_defaulted', buyer)?.next).toMatch(/Operations/);
    expect(canTransition(tx({ status: 'lifting_proposed' }), 'confirm_lifting', buyer)?.next).toMatch(/seller/);
  });

  it('terminal states say no further action is needed', () => {
    expect(canTransition(tx({ status: 'completed' }), 'submit_balance_payment', buyer)?.next).toMatch(/No further action/);
  });
});

describe('balance payment: buyer reports, seller confirms (offline)', () => {
  const reported = () => run(tx(), { type: 'submit_balance_payment', payment: payment(1_340_000, T0) }).tx;

  it('only the exact balance, with the payment details, can be reported — once at a time', () => {
    expect(reject(tx(), { type: 'submit_balance_payment', payment: payment(1_000, T0) })).toBe('amount_mismatch');
    expect(reject(tx(), { type: 'submit_balance_payment', payment: { ...payment(1_340_000, T0), reference: '' } })).toBe('invalid_payment');
    expect(reject(reported(), { type: 'submit_balance_payment', payment: payment(1_340_000, T0) })).toBe('already_submitted');
  });

  it('the seller confirms only a reported payment; rejection needs a reason and lets the buyer resubmit', () => {
    expect(reject(tx(), { type: 'confirm_balance_payment' }, seller)).toBe('no_payment_reported');
    expect(reject(reported(), { type: 'reject_balance_payment', reason: '' }, seller)).toBe('reason_required');
    const r = run(reported(), { type: 'reject_balance_payment', reason: 'Not received yet' }, seller);
    expect(r.tx).toMatchObject({ status: 'won_awaiting_balance', balancePaid: 0, balancePayment: { decision: { decision: 'rejected', reason: 'Not received yet' } } });
    expect(r.audit[0]).toMatchObject({ action: 'reject_balance_payment', reason: 'Not received yet', actorRole: 'seller' });
    const again = run(r.tx, { type: 'submit_balance_payment', payment: payment(1_340_000, T0, 'UTR-SECOND') }).tx;
    expect(again.paymentHistory?.map((h) => h.type)).toEqual(['submitted', 'decided', 'submitted']);
    expect(nextStep(again)).toMatchObject({ role: 'seller', action: 'confirm_balance_payment' });
  });

  it('Operations cannot mark a default while a reported payment awaits the seller', () => {
    const late = ctx('ops', 'U-OPS', at(73 * 60));
    expect(reject(reported(), { type: 'mark_defaulted', reason: 'No balance within 72h' }, late)).toBe('payment_pending');
  });

  it('refunds: owed after measurement below the paid amount; recorded by the seller up to what is due', () => {
    const done = tx({ status: 'completed', balancePaid: 1_340_000, finalPayable: 1_389_600, resolution: 'completed' });
    expect(refundDue(done)).toBe(1_440_000 - 1_389_600);
    expect(reject(done, { type: 'record_refund', refund: { amount: 60_000, refundedOn: T0.slice(0, 10), reference: 'UTR-R1', note: '' } }, seller)).toBe('invalid_refund');
    const r = run(done, { type: 'record_refund', refund: { amount: 50_400, refundedOn: T0.slice(0, 10), reference: 'UTR-R1', note: 'Excess paid' } }, seller);
    expect(refundDue(r.tx)).toBe(0);
    expect(reject(r.tx, { type: 'record_refund', refund: { amount: 1, refundedOn: T0.slice(0, 10), reference: 'UTR-R2', note: '' } }, seller)).toBe('nothing_due');
    expect(refundDue(tx({ status: 'resolved', resolution: 'exit_refund', balancePaid: 1_340_000 }))).toBe(1_340_000);
  });
});

describe('lifting inputs', () => {
  const sched = tx({ status: 'balance_paid' });
  it('rejects past or missing dates and missing vehicle', () => {
    expect(reject(sched, { type: 'propose_lifting', at: at(-5), vehicle: 'X' })).toBe('invalid_date');
    expect(reject(sched, { type: 'propose_lifting', at: 'nope', vehicle: 'X' })).toBe('invalid_date');
    expect(reject(sched, { type: 'propose_lifting', at: at(5), vehicle: '  ' })).toBe('vehicle_required');
  });

  it('weighbridge must be complete and consistent', () => {
    const t = tx({ status: 'lifting_scheduled' });
    const r = applyTransition(t, lot(), { ...weighbridge, ticketRef: '', ticketMediaId: null } as TxAction, buyer);
    expect(r.ok || r.error.what).toMatch(/ticket reference, ticket photo/);
    expect(reject(t, { ...weighbridge, measuredMt: 40 } as TxAction)).toBe('net_mismatch');
    expect(run(t, { ...weighbridge, grossMt: null, tareMt: null } as TxAction).tx.weighbridge?.measuredMt).toBe(38.6);
    expect(reject(checkedTx({ status: 'lifting_scheduled' }), weighbridge)).toBe('already_recorded');
  });

  it('condition check needs a valid value and a photo; recorded once', () => {
    const t = tx({ status: 'lifting_scheduled' });
    expect(reject(t, { ...condition, observedContaminationPct: 101 } as TxAction)).toBe('invalid_value');
    expect(reject(t, { ...condition, photoMediaIds: [] } as TxAction)).toBe('evidence_required');
    expect(reject(checkedTx({ status: 'lifting_scheduled' }), condition)).toBe('already_recorded');
  });
});

describe('default', () => {
  it('only Operations, only after the payment deadline, with a reason', () => {
    const t = tx();
    expect(reject(t, { type: 'mark_defaulted', reason: 'No payment' }, ops)).toBe('deadline_not_passed');
    const late = ctx('ops', 'U-OPS', at(73 * 60));
    expect(reject(t, { type: 'mark_defaulted', reason: ' ' }, late)).toBe('reason_required');
    const r = run(t, { type: 'mark_defaulted', reason: 'No balance within 72h' }, late);
    expect(r.tx.status).toBe('defaulted');
    expect(r.audit[0]).toMatchObject({ actorRole: 'ops', reason: 'No balance within 72h', to: 'defaulted' });
  });
});

describe('nextStep / stepperState', () => {
  it.each([
    ['won_awaiting_balance', 'buyer', 'submit_balance_payment'],
    ['balance_paid', 'buyer', 'propose_lifting'],
    ['lifting_proposed', 'seller', 'confirm_lifting'],
    ['material_checked', 'buyer', 'complete'],
    ['claim_opened', 'seller', 'respond_claim'],
    ['under_review', 'ops', 'decide_claim'],
  ] as const)('%s → %s %s', (status, role, action) => {
    expect(nextStep(tx({ status }))).toMatchObject({ role, action });
  });

  it('lifting_scheduled asks for whichever record is missing', () => {
    expect(nextStep(tx({ status: 'lifting_scheduled' }))?.action).toBe('record_weighbridge');
    const wbOnly = checkedTx({ status: 'lifting_scheduled', condition: null });
    expect(nextStep(wbOnly)?.action).toBe('record_condition');
    expect(nextStep(wbOnly, false)).toBeNull();
  });

  it('terminal states have no next step', () => {
    expect(nextStep(tx({ status: 'completed' }))).toBeNull();
    expect(nextStep(tx({ status: 'defaulted' }))).toBeNull();
  });

  it('stepper marks claims and completion', () => {
    expect(stepperState(tx())).toEqual({ current: 2, claim: false, done: false });
    expect(stepperState(tx({ status: 'lifting_proposed' })).current).toBe(3);
    expect(stepperState(tx({ status: 'under_review' }))).toEqual({ current: 5, claim: true, done: false });
    expect(stepperState(tx({ status: 'completed' }))).toEqual({ current: 6, claim: false, done: true });
    expect(stepperState(tx({ status: 'resolved' })).done).toBe(true);
  });
});
