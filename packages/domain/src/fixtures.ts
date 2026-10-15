/** Test builders. Not exported from the package. */
import type { Ctx } from './context';
import { sequentialIds } from './context';
import type { Bid, EmdRecord, Lot, LotMedia, Role, Transaction } from './types';
import { decideEmd, submitEmd } from './payments';
import type { DemoState } from './seed';
import { balanceDue } from './transaction';
import { runTxAction } from './workflow';

export const T0 = '2026-01-10T06:00:00.000Z';
export const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

export function ctx(role: Role, id: string, now = T0): Ctx {
  return { now, actor: { id, role }, newId: sequentialIds() };
}

export function media(kind: LotMedia['kind'], n: number, stage: LotMedia['stage'] = 'listing'): LotMedia[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${stage}-${kind}-${i}`,
    kind,
    url: `/demo-images/${kind}-${i}.jpg`,
    caption: `${kind} ${i}`,
    stage,
    uploadedAt: T0,
  }));
}

export function lot(over: Partial<Lot> = {}): Lot {
  return {
    id: 'LOT-1',
    sellerId: 'U-SELLER',
    sellerCompanyId: 'C-SELLER',
    title: 'HMS 1 & 2 Steel Scrap',
    category: 'ferrous_hms',
    grade: 'HMS 1 & 2 (80:20)',
    description: 'Cut structural sections.',
    location: { yard: 'Raipur Yard #4', city: 'Raipur', state: 'Chhattisgarh' },
    estimatedQtyMt: 40,
    declaration: { contaminationPct: 5, grade: 'HMS 1 & 2', form: 'Cut sections', notes: '' },
    attributes: { form: 'Cut sections', thickness: '> 6 mm' },
    reservePerMt: 32_000,
    reserveVisible: true,
    emdAmount: 100_000,
    bidIncrement: 500,
    startAt: at(-60),
    endAt: at(180),
    status: 'scheduled',
    assurance: { enabled: true, agreedAt: at(-120) },
    media: [...media('photo', 6), ...media('video', 1)],
    measurementBasis: 'Net weight at agreed weighbridge',
    createdAt: at(-200),
    publishedAt: at(-120),
    closedAt: null,
    winningBidId: null,
    ...over,
  };
}

export function bid(amount: number, bidderId = 'U-B1', minutes = 0, id = `BID-${amount}-${bidderId}`): Bid {
  return { id, lotId: 'LOT-1', bidderId, amountPerMt: amount, placedAt: at(minutes), clientRequestId: `req-${id}` };
}

export function emd(buyerId = 'U-BUYER', status: EmdRecord['status'] = 'confirmed'): EmdRecord {
  return { id: `EMD-${buyerId}`, lotId: 'LOT-1', buyerId, amount: 100_000, status, reference: 'SIM-1', mode: 'simulated', createdAt: T0 };
}

export function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'TX-1',
    lotId: 'LOT-1',
    buyerId: 'U-BUYER',
    sellerId: 'U-SELLER',
    winningBidId: 'BID-1',
    pricePerMt: 36_000,
    estimatedQtyMt: 40,
    emdAmount: 100_000,
    status: 'won_awaiting_balance',
    balancePaid: 0,
    balancePaidAt: null,
    paymentDeadline: at(72 * 60),
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
    createdAt: T0,
    completedAt: null,
    media: [],
    ...over,
  };
}

/** TX-1042-like state: balance paid, lifting confirmed, both checks recorded (38.6 MT, 14%). */
export function checkedTx(over: Partial<Transaction> = {}): Transaction {
  return tx({
    status: 'material_checked',
    balancePaid: 1_340_000,
    balancePaidAt: at(10),
    liftingProposedFor: at(60 * 24),
    liftingVehicle: 'MH 04 GP 8812',
    liftingConfirmedAt: at(30),
    weighbridge: {
      ticketRef: 'WB-2025-10429',
      weighbridge: 'Raipur Gate #2',
      grossMt: 54.2,
      tareMt: 15.6,
      measuredMt: 38.6,
      ticketMediaId: 'M-TICKET',
      measuredAt: at(40),
      recordedBy: 'U-BUYER',
    },
    condition: { observedContaminationPct: 14, notes: 'Slag below top layer', photoMediaIds: ['M-1'], checkedAt: at(41), recordedBy: 'U-BUYER' },
    ...over,
  });
}

// ── Offline payments: report, then the seller confirms (docs/PHASE1_MVP.md) ──

export const payment = (amount: number, now: string, reference = 'UTR000123456') => ({
  amount,
  method: 'neft' as const,
  paidOn: now.slice(0, 10),
  reference,
  payerName: 'Test payer',
  receiptDocumentId: null,
});

/** Buyer reports the lot's EMD and the lot's seller confirms it. */
export function confirmedEmd(state: DemoState, lotId: string, buyer: { id: string; role: 'buyer' }, now: string): DemoState {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`no lot ${lotId}`);
  const s = submitEmd(state, lotId, payment(lot.emdAmount, now), buyer, now);
  if (!s.ok) throw new Error(s.error.what);
  const d = decideEmd(s.state, s.value.id, { decision: 'confirmed', reason: '' }, { id: lot.sellerId, role: 'seller' }, now);
  if (!d.ok) throw new Error(d.error.what);
  return d.state;
}

/** Buyer reports the balance and the seller confirms it. */
export function paidBalance(state: DemoState, txId: string, now: string): DemoState {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) throw new Error(`no tx ${txId}`);
  const s = runTxAction(state, txId, { type: 'submit_balance_payment', payment: payment(balanceDue(tx), now, 'UTR-BAL-0001') }, { id: tx.buyerId, role: 'buyer' }, now);
  if (!s.ok) throw new Error(s.error.what);
  const c = runTxAction(s.state, txId, { type: 'confirm_balance_payment' }, { id: tx.sellerId, role: 'seller' }, now);
  if (!c.ok) throw new Error(c.error.what);
  return c.state;
}
