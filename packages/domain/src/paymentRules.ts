/** Shape checks for reported payments and refunds — no state, so transaction.ts and payments.ts can share them. */
import { PAYMENT_METHODS } from './eligibilityPolicy';
import { formatINR } from './format';
import type { Iso, PaymentMethod, Rejection, Rupees } from './types';

export interface PaymentInput {
  amount: Rupees;
  method: PaymentMethod;
  /** Date the payment was made (YYYY-MM-DD). */
  paidOn: string;
  reference: string;
  payerName: string;
  receiptDocumentId: string | null;
}

export interface RefundInput {
  amount: Rupees;
  refundedOn: string;
  reference: string;
  note: string;
}

const day = (iso: Iso) => iso.slice(0, 10);

/** Shape checks shared by EMD and balance submissions. `expected` is the amount due. */
export function paymentProblem(input: PaymentInput, expected: Rupees, now: Iso, receiptOk: (id: string) => boolean): Rejection | null {
  const r = (code: string, what: string, next: string) => ({ code, what, next });
  if (!PAYMENT_METHODS.some((m) => m.id === input.method)) return r('invalid_payment', 'Choose how you paid.', 'Pick NEFT, RTGS, IMPS, UPI, cheque or demand draft.');
  if (!Number.isInteger(input.amount) || input.amount <= 0) return r('invalid_payment', 'Enter the amount you paid, in whole rupees.', `The amount due is ${formatINR(expected)}.`);
  if (input.amount !== expected) return r('amount_mismatch', `The amount due is ${formatINR(expected)}, but you entered ${formatINR(input.amount)}.`, 'Enter the exact amount you paid. If you paid a different amount, contact the seller first.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || Number.isNaN(Date.parse(input.paidOn))) return r('invalid_payment', 'Enter the date you made the payment.', 'Use the date shown on your bank statement or receipt.');
  if (input.paidOn > day(now)) return r('invalid_payment', 'The payment date is in the future.', 'Enter the date the payment was actually made.');
  const label = PAYMENT_METHODS.find((m) => m.id === input.method)?.referenceLabel ?? 'payment reference';
  if (input.reference.trim().length < 4) return r('invalid_payment', `Enter the ${label}.`, 'The seller matches it against their bank statement.');
  if (input.payerName.trim().length < 2) return r('invalid_payment', 'Enter the name the payment was made from.', 'Usually the business account holder’s name.');
  if (input.receiptDocumentId && !receiptOk(input.receiptDocumentId)) return r('invalid_receipt', 'That receipt isn’t one of your uploads.', 'Upload the receipt again.');
  return null;
}

export function refundProblem(input: RefundInput, due: Rupees, now: Iso): Rejection | null {
  const r = (code: string, what: string, next: string) => ({ code, what, next });
  if (due <= 0) return r('nothing_due', 'No refund is due here.', 'Nothing to record.');
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > due) return r('invalid_refund', `Enter the refunded amount — up to ${formatINR(due)}.`, 'Record each refund as you make it.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.refundedOn) || input.refundedOn > day(now)) return r('invalid_refund', 'Enter the date the refund was made (not in the future).', 'Use the date on your bank statement.');
  if (input.reference.trim().length < 4) return r('invalid_refund', 'Enter the bank reference (UTR) of the refund.', 'The buyer uses it to find the money.');
  return null;
}
