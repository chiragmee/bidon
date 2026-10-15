/** Request bodies (zod). Business rules stay in packages/domain; these only check shape. */
import { z } from 'zod';

const iso = z.string().min(1);
const media = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(['photo', 'video', 'document']),
  url: z.string().max(2048),
  caption: z.string().max(200),
  stage: z.enum(['listing', 'lifting', 'claim', 'claim_response']),
  uploadedAt: z.string(),
});
export const MediaList = z.array(media).max(40);
export type MediaInput = z.infer<typeof media>;

export const EmdBody = z.object({ outcome: z.enum(['success', 'failure']) });

// Amount is left to the domain so a bad value gets the same "invalid_amount" answer as demo mode.
export const BidBody = z.object({
  amountPerMt: z.unknown(),
  clientRequestId: z.string().min(1).max(120),
  seenHighestPerMt: z.number().int().nullable(),
});

const num = z.number();
export const TxAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pay_balance') }),
  z.object({ type: z.literal('propose_lifting'), at: z.string(), vehicle: z.string().max(40) }),
  z.object({ type: z.literal('confirm_lifting') }),
  z.object({
    type: z.literal('record_weighbridge'),
    ticketRef: z.string().max(80),
    weighbridge: z.string().max(120),
    grossMt: num.nullable(),
    tareMt: num.nullable(),
    measuredMt: num,
    ticketMediaId: z.string().nullable(),
  }),
  z.object({ type: z.literal('record_condition'), observedContaminationPct: num, notes: z.string().max(1000), photoMediaIds: z.array(z.string()).max(40) }),
  z.object({ type: z.literal('complete') }),
  z.object({ type: z.literal('mark_defaulted'), reason: z.string().max(500) }),
]);
export const TxActionBody = z.object({ action: TxAction, media: MediaList.default([]) });

export const ClaimBody = z.object({
  input: z.object({
    type: z.enum(['quantity', 'grade', 'contamination', 'condition']),
    observedValue: num,
    mediaIds: z.array(z.string()).max(40),
    expected: z.string().max(300),
    observed: z.string().max(300),
    explanation: z.string().max(2000),
    requestedRemedy: z.enum(['price_adjustment', 'exit_refund']),
  }),
  media: MediaList.default([]),
});

export const ResponseBody = z.object({
  response: z.object({ decision: z.enum(['accept', 'dispute']), explanation: z.string().max(2000) }),
  media: MediaList.default([]),
});

export const DecisionBody = z.object({ outcome: z.enum(['approve_adjustment', 'approve_exit', 'reject']), reason: z.string().max(2000) });

const category = z.enum(['ferrous_hms', 'mixed_steel', 'non_ferrous', 'e_waste', 'machinery']);
export const DraftBody = z
  .object({
    title: z.string().max(200),
    category,
    grade: z.string().max(200),
    description: z.string().max(4000),
    yard: z.string().max(200),
    city: z.string().max(100),
    state: z.string().max(100),
    estimatedQtyMt: num,
    contaminationPct: num.nullable(),
    attributes: z.record(z.string(), z.string().max(300)),
    media: MediaList,
    reservePerMt: num,
    emdAmount: num,
    startAt: iso,
    endAt: iso,
    assuranceEnabled: z.boolean(),
    assuranceAgreed: z.boolean(),
    reserveVisible: z.boolean(),
  })
  .partial();

export const BuyerRegistration = z.object({
  name: z.string().max(120),
  email: z.string().max(200),
  companyName: z.string().max(200),
  businessType: z.string().max(120),
  city: z.string().max(100),
  state: z.string().max(100),
  industry: z.string().max(200),
  materials: z.array(z.string().max(100)).max(20),
});

export const SellerRegistration = z.object({
  name: z.string().max(120),
  companyName: z.string().max(200),
  businessType: z.string().max(120),
  yard: z.string().max(200),
  city: z.string().max(100),
  state: z.string().max(100),
  categories: z.array(category).max(10),
  email: z.string().max(200),
  phone: z.string().max(30),
});

export const STAGES = ['listing', 'lifting', 'claim', 'claim_response'] as const;
