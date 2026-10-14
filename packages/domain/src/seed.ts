/**
 * Canonical demo seed (docs/PLAN.md §4). One seed feeds both Supabase and demo mode.
 *
 * Every timestamp is relative to `now` (the moment of reset), so live lots are live on any day.
 * All companies, people, prices and histories are fictional SAMPLE DATA (D-026).
 */
import { suggestedEmd } from './policy';
import type {
  AuditEntry,
  Bid,
  CategoryId,
  Claim,
  Company,
  EmdRecord,
  Iso,
  Lot,
  LotMedia,
  Notification,
  Transaction,
  User,
} from './types';
import { computePayable } from './transaction';

export interface DemoState {
  version: number;
  seededAt: Iso;
  companies: Company[];
  users: User[];
  lots: Lot[];
  bids: Bid[];
  emds: EmdRecord[];
  transactions: Transaction[];
  claims: Claim[];
  audit: AuditEntry[];
  notifications: Notification[];
  /** Per-prefix counters for ids created after reset (TX-2000, BID-2000 …). */
  counters: Record<string, number>;
}

export const SEED_VERSION = 1;

/** One-click demo accounts (CLAUDE.md Roles). */
export const DEMO_ACCOUNTS = {
  buyer: 'U-RAHUL',
  seller: 'U-SURESH',
  ops: 'U-DEVENDRA',
} as const;

/** New records created after a reset start numbering here, clear of seeded ids. */
export const NEW_ID_START = 2000;

const companies: Company[] = [
  { id: 'C-VARDHAN', name: 'Vardhan Infra Projects Pvt Ltd', kind: 'buyer', city: 'Nagpur', state: 'Maharashtra', businessType: 'EPC contractor', sample: true, verification: 'demo_approved' },
  { id: 'C-KAVERI', name: 'Kaveri Recyclers', kind: 'buyer', city: 'Bhilai', state: 'Chhattisgarh', businessType: 'Scrap trader / stockist', sample: true, verification: 'demo_approved' },
  { id: 'C-SAIKRUPA', name: 'Sai Krupa Traders', kind: 'buyer', city: 'Raipur', state: 'Chhattisgarh', businessType: 'Scrap trader / stockist', sample: true, verification: 'demo_approved' },
  { id: 'C-DECCAN', name: 'Deccan Foundry Works', kind: 'buyer', city: 'Kolhapur', state: 'Maharashtra', businessType: 'Foundry and castings', sample: true, verification: 'demo_approved' },
  { id: 'C-BALAJI', name: 'Shree Balaji Steels', kind: 'seller', city: 'Raipur', state: 'Chhattisgarh', businessType: 'Steel processor', yard: 'Raipur Yard #4, Urla Industrial Area', sample: true, verification: 'demo_approved' },
  { id: 'C-NATIONAL', name: 'National Smelters', kind: 'seller', city: 'Bhilai', state: 'Chhattisgarh', businessType: 'Smelter', sample: true, verification: 'demo_approved' },
  { id: 'C-MAHALAXMI', name: 'Mahalaxmi Metals', kind: 'seller', city: 'Pune', state: 'Maharashtra', businessType: 'Aluminium extruder', sample: true, verification: 'demo_approved' },
];

const users: User[] = [
  { id: 'U-RAHUL', name: 'Rahul Sharma', email: 'rahul.sharma@vardhan.example', role: 'buyer', companyId: 'C-VARDHAN', title: 'Procurement lead' },
  { id: 'U-ANITA', name: 'Anita Rao', email: 'anita@kaveri.example', role: 'buyer', companyId: 'C-KAVERI', title: 'Partner' },
  { id: 'U-VIKAS', name: 'Vikas Jain', email: 'vikas@saikrupa.example', role: 'buyer', companyId: 'C-SAIKRUPA', title: 'Owner' },
  { id: 'U-MEERA', name: 'Meera Patil', email: 'meera@deccanfoundry.example', role: 'buyer', companyId: 'C-DECCAN', title: 'Purchase manager' },
  { id: 'U-SURESH', name: 'Suresh Agrawal', email: 'suresh@balajisteels.example', role: 'seller', companyId: 'C-BALAJI', title: 'Dispatch head' },
  { id: 'U-IMRAN', name: 'Imran Qureshi', email: 'imran@nationalsmelters.example', role: 'seller', companyId: 'C-NATIONAL', title: 'Commercial manager' },
  { id: 'U-PRIYA', name: 'Priya Kulkarni', email: 'priya@mahalaxmi.example', role: 'seller', companyId: 'C-MAHALAXMI', title: 'Director' },
  { id: 'U-DEVENDRA', name: 'Devendra Nath', email: 'devendra.nath@auctionit.example', role: 'ops', companyId: null, title: 'Operations lead' },
];

const SELLER_COMPANY: Record<string, string> = { 'U-SURESH': 'C-BALAJI', 'U-IMRAN': 'C-NATIONAL', 'U-PRIYA': 'C-MAHALAXMI' };

const INCREMENT: Record<CategoryId, number> = { ferrous_hms: 500, mixed_steel: 500, non_ferrous: 2_000, e_waste: 1_000, machinery: 1_000 };

export function createSeed(nowIso: Iso = new Date().toISOString()): DemoState {
  const now = Date.parse(nowIso);
  const h = (hours: number): Iso => new Date(now + hours * 3_600_000).toISOString();

  const lots: Lot[] = [];
  const bids: Bid[] = [];
  const emds: EmdRecord[] = [];
  const transactions: Transaction[] = [];
  const claims: Claim[] = [];
  const audit: AuditEntry[] = [];
  const notifications: Notification[] = [];

  // ── helpers ────────────────────────────────────────────────────────────────
  const photoSet = (slug: string, n: number, stage: LotMedia['stage'], at: Iso, captions: string[] = []): LotMedia[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `M-${slug}-${stage}-p${i + 1}`,
      kind: 'photo' as const,
      url: `/demo-images/${slug}-${i + 1}.jpg`,
      caption: captions[i] ?? `Yard photo ${i + 1}`,
      stage,
      uploadedAt: at,
    }));
  const video = (slug: string, at: Iso): LotMedia => ({
    id: `M-${slug}-listing-v1`,
    kind: 'video',
    url: `/demo-images/${slug}-walkthrough.mp4`,
    caption: 'Yard walkthrough video (0:45)',
    stage: 'listing',
    uploadedAt: at,
  });

  type LotSpec = Pick<Lot, 'id' | 'sellerId' | 'title' | 'category' | 'grade' | 'description' | 'estimatedQtyMt' | 'reservePerMt'> & {
    location: Lot['location'];
    contaminationPct?: number | null;
    attributes?: Record<string, string>;
    startH: number;
    endH: number;
    status?: Lot['status'];
    assured?: boolean;
    slug: string;
    photos?: number;
    withVideo?: boolean;
    reserveVisible?: boolean;
  };

  function addLot(s: LotSpec): Lot {
    const created = h(s.startH - 48);
    const assured = s.assured ?? false;
    const media = [...photoSet(s.slug, s.photos ?? (assured ? 6 : 3), 'listing', created, LISTING_CAPTIONS), ...(s.withVideo ?? assured ? [video(s.slug, created)] : [])];
    const lot: Lot = {
      id: s.id,
      sellerId: s.sellerId,
      sellerCompanyId: SELLER_COMPANY[s.sellerId] ?? '',
      title: s.title,
      category: s.category,
      grade: s.grade,
      description: s.description,
      location: s.location,
      estimatedQtyMt: s.estimatedQtyMt,
      declaration: { contaminationPct: s.contaminationPct ?? null, grade: s.grade, form: s.attributes?.form ?? '', notes: s.description },
      attributes: s.attributes ?? {},
      reservePerMt: s.reservePerMt,
      reserveVisible: s.reserveVisible ?? true,
      emdAmount: suggestedEmd(s.category, s.reservePerMt, s.estimatedQtyMt),
      bidIncrement: INCREMENT[s.category],
      startAt: h(s.startH),
      endAt: h(s.endH),
      status: s.status ?? 'scheduled',
      assurance: { enabled: assured, agreedAt: assured ? created : null },
      media,
      measurementBasis: 'Final payable quantity is the net weight at the mutually agreed certified weighbridge at lifting.',
      createdAt: created,
      publishedAt: s.status === 'draft' ? null : h(s.startH - 24),
      closedAt: null,
      winningBidId: null,
    };
    lots.push(lot);
    return lot;
  }

  function addBids(lot: Lot, series: [bidder: string, amount: number, hour: number][]): Bid[] {
    const out = series.map(([bidderId, amountPerMt, hr], i) => ({
      id: `BID-${lot.id.slice(-4)}-${String(i + 1).padStart(2, '0')}`,
      lotId: lot.id,
      bidderId,
      amountPerMt,
      placedAt: h(hr),
      clientRequestId: `seed-${lot.id}-${i + 1}`,
    }));
    bids.push(...out);
    for (const bidderId of new Set(out.map((b) => b.bidderId))) addEmd(lot, bidderId, out[0]?.placedAt ?? lot.startAt);
    return out;
  }

  function addEmd(lot: Lot, buyerId: string, before: Iso, status: EmdRecord['status'] = 'succeeded') {
    if (emds.some((e) => e.lotId === lot.id && e.buyerId === buyerId)) return;
    emds.push({
      id: `EMD-${lot.id.slice(-4)}-${buyerId.slice(2)}`,
      lotId: lot.id,
      buyerId,
      amount: lot.emdAmount,
      status,
      reference: `SIM-${lot.id.slice(-4)}${buyerId.slice(2, 5)}`,
      mode: 'simulated',
      createdAt: new Date(Date.parse(before) - 30 * 60_000).toISOString(),
    });
  }

  function award(lot: Lot, winning: Bid, closedH: number, over: Partial<Transaction> & { id: string }): Transaction {
    lot.status = 'awarded';
    lot.closedAt = h(closedH);
    lot.winningBidId = winning.id;
    const t: Transaction = {
      lotId: lot.id,
      buyerId: winning.bidderId,
      sellerId: lot.sellerId,
      winningBidId: winning.id,
      pricePerMt: winning.amountPerMt,
      estimatedQtyMt: lot.estimatedQtyMt,
      emdAmount: lot.emdAmount,
      status: 'won_awaiting_balance',
      balancePaid: 0,
      balancePaidAt: null,
      paymentDeadline: h(closedH + 72),
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
      createdAt: h(closedH),
      completedAt: null,
      media: [],
      ...over,
    };
    transactions.push(t);
    log('lot', lot.id, 'close_auction', 'scheduled', 'awarded', closedH, 'system');
    return t;
  }

  /** Fill a transaction through to completion with plausible lifting records. */
  function completed(t: Transaction, closedH: number, measuredMt: number, contamination: number | null, extra: Partial<Transaction> = {}): Transaction {
    const paidAt = h(closedH + 20);
    const lifting = h(closedH + 60);
    const payable = computePayable(measuredMt, t.pricePerMt);
    Object.assign(t, {
      status: 'completed',
      balancePaid: Math.max(0, computePayable(t.estimatedQtyMt, t.pricePerMt) - t.emdAmount),
      balancePaidAt: paidAt,
      liftingProposedFor: lifting,
      liftingVehicle: 'CG 04 HX 2211',
      liftingConfirmedAt: h(closedH + 26),
      loadingCompletedAt: h(closedH + 62),
      weighbridge: { ticketRef: `WB-${t.id.slice(3)}`, weighbridge: 'Raipur Gate #2 weighbridge', grossMt: null, tareMt: null, measuredMt, ticketMediaId: null, measuredAt: h(closedH + 61), recordedBy: t.buyerId },
      condition: contamination === null ? null : { observedContaminationPct: contamination, notes: 'Within declared range.', photoMediaIds: [], checkedAt: h(closedH + 61), recordedBy: t.buyerId },
      finalQtyMt: measuredMt,
      finalPayable: payable,
      resolution: 'completed',
      completedAt: h(closedH + 62),
      ...extra,
    } satisfies Partial<Transaction>);
    return t;
  }

  function log(entity: AuditEntry['entity'], entityId: string, action: string, from: string | null, to: string | null, hr: number, actorId: string, reason: string | null = null) {
    const role = actorId === 'system' ? 'ops' : users.find((u) => u.id === actorId)?.role ?? 'ops';
    audit.push({ id: `AUD-${String(audit.length + 1).padStart(4, '0')}`, entity, entityId, action, actorId, actorRole: role, from, to, reason, at: h(hr) });
  }

  function notify(userId: string, kind: Notification['kind'], title: string, body: string, href: string, hr: number, read = false) {
    notifications.push({ id: `N-${String(notifications.length + 1).padStart(4, '0')}`, userId, kind, title, body, href, read, at: h(hr) });
  }

  const RAIPUR = { yard: 'Raipur Yard #4, Urla Industrial Area', city: 'Raipur', state: 'Chhattisgarh' };
  const BHILAI = { yard: 'Bhilai Yard #2', city: 'Bhilai', state: 'Chhattisgarh' };

  // ── Live and upcoming auctions ─────────────────────────────────────────────

  // Journey A: the assured HMS lot. Rahul has no EMD here yet — the demo pays it live.
  const l0891 = addLot({
    id: 'LOT-2025-0891', sellerId: 'U-SURESH', slug: 'hms', title: 'HMS 1 & 2 steel scrap', category: 'ferrous_hms',
    grade: 'HMS 1 & 2 (80:20)', description: 'Heavy melting steel: cut structural sections and sheared plate, furnace-ready. Stored on a concrete bay.',
    location: RAIPUR, estimatedQtyMt: 40, reservePerMt: 32_000, contaminationPct: 5, startH: -21, endH: 3, assured: true,
    attributes: { form: 'Cut structural sections and sheared plate, max 1.5 m', thickness: 'Mostly above 6 mm', storage: 'Concrete bay, no earth contact' },
  });
  addBids(l0891, [['U-VIKAS', 32_500, -18], ['U-ANITA', 33_000, -12], ['U-MEERA', 33_500, -7], ['U-VIKAS', 34_000, -4], ['U-ANITA', 34_500, -1.5]]);

  // Standard lot contrast; Rahul leading.
  const l0899 = addLot({
    id: 'LOT-2025-0899', sellerId: 'U-IMRAN', slug: 'copper', title: 'Armoured copper cable scrap', category: 'non_ferrous',
    grade: 'Armoured copper cable, mixed gauge', description: 'Decommissioned armoured power cable, cut to 1 m lengths.',
    location: BHILAI, estimatedQtyMt: 15, reservePerMt: 5_80_000, contaminationPct: 12, startH: -18, endH: 6,
    attributes: { alloy: 'Copper with steel armour and PVC sheath', form: 'Cut cable, 1 m lengths' },
  });
  addBids(l0899, [['U-MEERA', 5_82_000, -15], ['U-ANITA', 5_96_000, -9], ['U-RAHUL', 6_10_000, -2]]);

  // Ends in 40 minutes; Rahul outbid. New seller with no track record.
  const l0894 = addLot({
    id: 'LOT-2025-0894', sellerId: 'U-PRIYA', slug: 'aluminium', title: 'Aluminium extrusion scrap 6063', category: 'non_ferrous',
    grade: 'Alloy 6063 extrusion offcuts', description: 'Clean extrusion offcuts and rejected profiles from the press line.',
    location: { yard: 'Chakan MIDC Plant 1', city: 'Pune', state: 'Maharashtra' }, estimatedQtyMt: 22, reservePerMt: 1_80_000,
    contaminationPct: 2, startH: -23, endH: 40 / 60, attributes: { alloy: 'Aluminium 6063', form: 'Extrusion offcuts' },
  });
  addBids(l0894, [['U-RAHUL', 1_84_000, -10], ['U-MEERA', 1_90_000, -3]]);

  addLot({
    id: 'LOT-2025-0910', sellerId: 'U-IMRAN', slug: 'dross', title: 'Aluminium dross and skimmings', category: 'non_ferrous',
    grade: 'Dross, approx. 40% metal', description: 'Furnace skimmings in jumbo bags.',
    location: { yard: 'Rourkela Yard #1', city: 'Rourkela', state: 'Odisha' }, estimatedQtyMt: 25, reservePerMt: 75_000,
    contaminationPct: 60, startH: 24, endH: 30, reserveVisible: false, attributes: { alloy: 'Aluminium dross', form: 'Bagged skimmings' },
  });

  addLot({
    id: 'LOT-2025-0905', sellerId: 'U-SURESH', slug: 'rebar', title: 'Mixed steel rebar cut-ends', category: 'mixed_steel',
    grade: 'TMT rebar cut-ends with structural offcuts', description: 'Site returns from a bridge project, sorted and stacked.',
    location: RAIPUR, estimatedQtyMt: 80, reservePerMt: 30_000, contaminationPct: 4, startH: 48, endH: 54, assured: true,
    attributes: { form: 'Rebar cut-ends, 0.3–2 m', mix: 'About 70% rebar, 30% structural offcuts' },
  });

  // Draft — incomplete on purpose (no reserve, EMD or dates) to show the edit-draft path.
  const draft = addLot({
    id: 'LOT-2025-0920', sellerId: 'U-SURESH', slug: 'plate', title: 'MS plate cuttings', category: 'ferrous_hms',
    grade: 'MS plate cuttings', description: 'Plasma-cut plate offcuts from fabrication.', location: RAIPUR,
    estimatedQtyMt: 18, reservePerMt: 0, contaminationPct: 2, startH: 0, endH: 0, status: 'draft', photos: 2, withVideo: false,
    attributes: { form: 'Plate offcuts' },
  });
  Object.assign(draft, { startAt: '', endAt: '', emdAmount: 0, bidIncrement: 0, publishedAt: null });

  // ── Closed auctions and transactions ───────────────────────────────────────

  // Won by Rahul, awaiting balance (deadline in the future).
  const l0861 = addLot({
    id: 'LOT-2025-0861', sellerId: 'U-SURESH', slug: 'hms2', title: 'HMS 2 steel scrap', category: 'ferrous_hms',
    grade: 'HMS 2', description: 'Light melting scrap, baled.', location: RAIPUR, estimatedQtyMt: 30, reservePerMt: 29_000,
    contaminationPct: 6, startH: -40, endH: -12, assured: true, attributes: { form: 'Baled light scrap', thickness: '3–6 mm' },
  });
  const b0861 = addBids(l0861, [['U-ANITA', 29_500, -30], ['U-RAHUL', 30_500, -14]]);
  const tx1038 = award(l0861, nth(b0861, 1), -12, { id: 'TX-1038' });
  notify('U-RAHUL', 'auction_won', 'You won LOT-2025-0861', 'HMS 2 steel scrap at ₹30,500/MT. Pay the balance to continue.', `/transactions/${tx1038.id}`, -12);

  // Payment deadline passed → Operations may mark defaulted.
  const l0855 = addLot({
    id: 'LOT-2025-0855', sellerId: 'U-IMRAN', slug: 'castiron', title: 'Cast iron scrap', category: 'ferrous_hms',
    grade: 'Cast iron, mixed machinery parts', description: 'Broken machine beds and housings.', location: BHILAI,
    estimatedQtyMt: 20, reservePerMt: 27_000, contaminationPct: 3, startH: -130, endH: -82, attributes: { form: 'Broken castings', thickness: 'Heavy section' },
  });
  const b0855 = addBids(l0855, [['U-ANITA', 27_500, -100], ['U-MEERA', 28_000, -90]]);
  award(l0855, nth(b0855, 1), -82, { id: 'TX-1035', paymentDeadline: h(-10) });

  // Unsold: no bids reached the reserve.
  const l0866 = addLot({
    id: 'LOT-2025-0866', sellerId: 'U-IMRAN', slug: 'machinery', title: 'Used lathe machines (6 units)', category: 'machinery',
    grade: 'Centre lathes, 1990s', description: 'Six centre lathes, not tested, sold as scrap or for refurbishment.', location: BHILAI,
    estimatedQtyMt: 12, reservePerMt: 45_000, startH: -60, endH: -36, attributes: { make: 'Various Indian makes', condition: 'Not tested' },
  });
  l0866.status = 'closed_unsold';
  l0866.closedAt = h(-36);
  log('lot', l0866.id, 'close_auction', 'scheduled', 'closed_unsold', -36, 'system', 'No bid met the reserve.');

  // Journey C: TX-1042 with disputed claim CLM-1042-01 under Operations review.
  const l0873 = addLot({
    id: 'LOT-2025-0873', sellerId: 'U-SURESH', slug: 'hms', title: 'HMS 1 & 2 steel scrap', category: 'ferrous_hms',
    grade: 'HMS 1 & 2 (80:20)', description: 'Heavy melting steel, sheared to furnace size. Negligible non-metallic attachments.',
    location: RAIPUR, estimatedQtyMt: 40, reservePerMt: 32_000, contaminationPct: 5, startH: -150, endH: -100, assured: true,
    attributes: { form: 'Sheared plate and sections', thickness: 'Above 6 mm', storage: 'Concrete bay #3' },
  });
  const b0873 = addBids(l0873, [['U-ANITA', 34_000, -130], ['U-VIKAS', 35_000, -115], ['U-RAHUL', 36_000, -104]]);
  const liftingPhotos = photoSet('lifting', 3, 'lifting', h(-55), ['Top layer slag', 'Mid-bed foreign matter', 'Weighbridge ticket WB-2025-10429']);
  const sellerEvidence = photoSet('staging', 1, 'claim_response', h(-49), ['Bay #3 before staging']);
  const tx1042 = award(l0873, nth(b0873, 2), -100, {
    id: 'TX-1042',
    status: 'under_review',
    balancePaid: 13_40_000,
    balancePaidAt: h(-80),
    paymentDeadline: h(-28),
    liftingProposedFor: h(-56),
    liftingVehicle: 'MH 04 GP 8812',
    liftingConfirmedAt: h(-75),
    weighbridge: { ticketRef: 'WB-2025-10429', weighbridge: 'Raipur Gate #2 weighbridge', grossMt: 54.2, tareMt: 15.6, measuredMt: 38.6, ticketMediaId: nth(liftingPhotos, 2).id, measuredAt: h(-55), recordedBy: 'U-RAHUL' },
    condition: { observedContaminationPct: 14, notes: 'Mud and un-sheared slag found below the top layer during loading of bay #3.', photoMediaIds: [nth(liftingPhotos, 0).id, nth(liftingPhotos, 1).id], checkedAt: h(-54.5), recordedBy: 'U-RAHUL' },
    media: [...liftingPhotos, ...sellerEvidence],
  });
  claims.push({
    id: 'CLM-1042-01',
    transactionId: tx1042.id,
    lotId: l0873.id,
    buyerId: 'U-RAHUL',
    sellerId: 'U-SURESH',
    type: 'contamination',
    expected: 'Up to 5% declared; agreed limit 8% (demo policy)',
    observedValue: 14,
    observed: '14% slag and debris',
    explanation: 'Substantial mud and un-sheared slag below the top layer. Sample sorting at bay #3 indicated about 14% contamination.',
    requestedRemedy: 'price_adjustment',
    mediaIds: liftingPhotos.map((m) => m.id),
    status: 'under_review',
    sellerResponse: {
      decision: 'dispute',
      explanation: 'We inspect all lots before staging. The material on top is standard HMS 1. The buyer’s transporter mixed sweepings from the adjacent bay during loading. We offer a 1% goodwill adjustment but reject the 6% deduction.',
      mediaIds: sellerEvidence.map((m) => m.id),
      respondedAt: h(-49),
      respondedBy: 'U-SURESH',
    },
    opsDecision: null,
    openedAt: h(-52),
    resolvedAt: null,
  });
  log('transaction', 'TX-1042', 'pay_balance', 'won_awaiting_balance', 'balance_paid', -80, 'U-RAHUL');
  log('transaction', 'TX-1042', 'propose_lifting', 'balance_paid', 'lifting_proposed', -78, 'U-RAHUL');
  log('transaction', 'TX-1042', 'confirm_lifting', 'lifting_proposed', 'lifting_scheduled', -75, 'U-SURESH');
  log('transaction', 'TX-1042', 'record_weighbridge', 'lifting_scheduled', 'lifting_scheduled', -55, 'U-RAHUL');
  log('transaction', 'TX-1042', 'record_condition', 'lifting_scheduled', 'material_checked', -54.5, 'U-RAHUL');
  log('claim', 'CLM-1042-01', 'open_claim', null, 'open', -52, 'U-RAHUL');
  log('transaction', 'TX-1042', 'open_claim', 'material_checked', 'claim_opened', -52, 'U-RAHUL');
  log('claim', 'CLM-1042-01', 'seller_dispute', 'open', 'seller_responded', -49, 'U-SURESH');
  log('claim', 'CLM-1042-01', 'escalate_to_ops', 'seller_responded', 'under_review', -49, 'U-SURESH');
  log('transaction', 'TX-1042', 'escalate_to_ops', 'claim_opened', 'under_review', -49, 'U-SURESH');
  notify('U-RAHUL', 'seller_responded', 'Seller disputed your claim CLM-1042-01', 'Operations will review the evidence and decide.', '/transactions/TX-1042', -49);
  notify('U-DEVENDRA', 'claim_submitted', 'Disputed claim CLM-1042-01 needs review', 'Contamination 14% vs 8% limit on LOT-2025-0873.', '/ops/claims/CLM-1042-01', -49);

  // Lifting date proposed by Rahul; waiting for the seller to confirm (seller demo action).
  const l0879 = addLot({
    id: 'LOT-2025-0879', sellerId: 'U-SURESH', slug: 'mixedsteel', title: 'Mixed steel scrap', category: 'mixed_steel',
    grade: 'Mixed structural and plate', description: 'Dismantled shed structure and plate offcuts.', location: RAIPUR,
    estimatedQtyMt: 35, reservePerMt: 28_000, contaminationPct: 6, startH: -90, endH: -60, assured: true,
    attributes: { form: 'Dismantled sections and plate', mix: 'About 60% sections, 40% plate' },
  });
  const b0879 = addBids(l0879, [['U-VIKAS', 28_500, -80], ['U-RAHUL', 29_500, -64]]);
  award(l0879, nth(b0879, 1), -60, {
    id: 'TX-1045', status: 'lifting_proposed', balancePaid: computePayable(35, 29_500) - l0879.emdAmount, balancePaidAt: h(-40),
    paymentDeadline: h(12), liftingProposedFor: h(26), liftingVehicle: 'CG 07 BK 4410',
  });
  log('transaction', 'TX-1045', 'pay_balance', 'won_awaiting_balance', 'balance_paid', -40, 'U-RAHUL');
  log('transaction', 'TX-1045', 'propose_lifting', 'balance_paid', 'lifting_proposed', -6, 'U-RAHUL');
  notify('U-SURESH', 'lifting_proposed', 'Lifting date proposed for TX-1045', 'Vardhan Infra Projects proposed a lifting slot. Confirm it to proceed.', '/transactions/TX-1045', -6);

  // Completed standard sale (National Smelters).
  const l0848 = addLot({
    id: 'LOT-2025-0848', sellerId: 'U-IMRAN', slug: 'copperturnings', title: 'Copper turnings', category: 'non_ferrous',
    grade: 'Bright copper turnings', description: 'Machining turnings, dry, bagged.', location: BHILAI,
    estimatedQtyMt: 10, reservePerMt: 6_20_000, contaminationPct: 1, startH: -260, endH: -230, attributes: { alloy: 'Copper', form: 'Turnings' },
  });
  const b0848 = addBids(l0848, [['U-MEERA', 6_22_000, -240], ['U-ANITA', 6_30_000, -232]]);
  completed(award(l0848, nth(b0848, 1), -230, { id: 'TX-1031' }), -230, 9.8, null);

  // ── Seller histories ───────────────────────────────────────────────────────
  // Shree Balaji: 6 completed assured sales, one with a resolved claim (price adjustment).
  const history: [id: string, qty: number, price: number, measured: number, contam: number, buyer: string][] = [
    ['LOT-2025-0812', 38, 31_500, 37.2, 4.5, 'U-ANITA'],
    ['LOT-2025-0818', 42, 32_000, 42.6, 5.2, 'U-VIKAS'],
    ['LOT-2025-0824', 30, 30_500, 29.4, 6.0, 'U-MEERA'],
    ['LOT-2025-0829', 45, 33_000, 44.1, 4.8, 'U-ANITA'],
    ['LOT-2025-0834', 36, 32_500, 36.5, 9.5, 'U-RAHUL'],
    ['LOT-2025-0840', 40, 33_500, 39.0, 5.5, 'U-VIKAS'],
  ];
  history.forEach(([id, qty, price, measured, contam, buyer], i) => {
    const startH = -900 + i * 110;
    const l = addLot({
      id, sellerId: 'U-SURESH', slug: 'hms', title: 'HMS 1 & 2 steel scrap', category: 'ferrous_hms', grade: 'HMS 1 & 2 (80:20)',
      description: 'Heavy melting steel, sheared.', location: RAIPUR, estimatedQtyMt: qty, reservePerMt: price - 1_000,
      contaminationPct: 5, startH, endH: startH + 30, assured: true, attributes: { form: 'Sheared sections', thickness: 'Above 6 mm' },
    });
    const [win] = addBids(l, [[buyer, price, startH + 25]]);
    const t = completed(award(l, nth([win], 0), startH + 30, { id: `TX-09${String(70 + i)}` }), startH + 30, measured, contam);
    if (contam > 8) {
      // 9.5% vs 8% limit → seller accepted the buyer's price adjustment.
      const adj = Math.round(((contam - 8) / 100) * measured * price);
      Object.assign(t, { status: 'resolved', resolution: 'price_adjustment', adjustment: adj, finalPayable: computePayable(measured, price) - adj });
      claims.push({
        id: 'CLM-0998-01', transactionId: t.id, lotId: l.id, buyerId: buyer, sellerId: 'U-SURESH', type: 'contamination',
        expected: 'Up to 5% declared; agreed limit 8% (demo policy)', observedValue: contam, observed: `${contam}% mixed debris`,
        explanation: 'Debris found in the lower layer.', requestedRemedy: 'price_adjustment', mediaIds: [], status: 'resolved',
        sellerResponse: { decision: 'accept', explanation: 'Accepted after reviewing photos.', mediaIds: [], respondedAt: h(startH + 61.5), respondedBy: 'U-SURESH' },
        opsDecision: null, openedAt: h(startH + 61.2), resolvedAt: h(startH + 61.5),
      });
    }
  });

  // National Smelters: two more completed sales (3 total with TX-1031).
  (
    [
      ['LOT-2025-0802', 'Copper cable scrap', 12, 5_90_000, 11.7, 'U-MEERA'],
      ['LOT-2025-0806', 'Brass scrap', 8, 3_80_000, 8.1, 'U-ANITA'],
    ] as const
  ).forEach(([id, title, qty, price, measured, buyer], i) => {
    const startH = -700 + i * 150;
    const l = addLot({
      id, sellerId: 'U-IMRAN', slug: 'copper', title, category: 'non_ferrous', grade: title, description: `${title}, sorted.`,
      location: BHILAI, estimatedQtyMt: qty, reservePerMt: price - 10_000, contaminationPct: 3, startH, endH: startH + 30,
      attributes: { alloy: title.split(' ')[0] ?? '', form: 'Sorted' },
    });
    const [win] = addBids(l, [[buyer, price, startH + 25]]);
    completed(award(l, nth([win], 0), startH + 30, { id: `TX-09${60 + i}` }), startH + 30, measured, null);
  });

  // ── Buyer notifications (Rahul) ────────────────────────────────────────────
  notify('U-RAHUL', 'outbid', 'You were outbid on LOT-2025-0894', 'Current highest bid is ₹1,90,000/MT. The auction ends in under an hour.', '/auctions/LOT-2025-0894', -3);
  notify('U-RAHUL', 'bid_accepted', 'Bid placed on LOT-2025-0899', 'You are leading at ₹6,10,000/MT.', '/auctions/LOT-2025-0899', -2, true);

  lots.sort((a, b) => b.id.localeCompare(a.id));
  return { version: SEED_VERSION, seededAt: nowIso, companies, users, lots, bids, emds, transactions, claims, audit, notifications, counters: {} };
}

/** Seed lookups that must exist; throws instead of silently producing a broken seed. */
function nth<T>(list: readonly (T | undefined)[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`seed: missing item ${i}`);
  return v;
}

const LISTING_CAPTIONS = [
  'Overhead view of the pile',
  'Close-up of section thickness',
  'Bay surface — concrete, no earth contact',
  'Mid-pile sample',
  'Edge of the pile',
  'Plate gauge measurement',
];
