/**
 * DemoState ⇄ table rows. The API loads a snapshot, runs the same packages/domain operation as
 * demo mode, and writes back only the rows that changed (see repo.ts).
 */
import type {
  AccountDocument,
  AuditEntry,
  Bid,
  Claim,
  Company,
  DemoState,
  EmdRecord,
  Lot,
  LotMedia,
  Notification,
  Transaction,
  User,
} from '@auctionit/domain';

import { isRegion } from '@auctionit/domain';

export type Row = Record<string, unknown>;
export type Rows = Record<TableName, Row[]>;

/** Insert order respects foreign keys; deletes run in reverse. */
export const TABLES = [
  ['companies', 'id'],
  ['profiles', 'id'],
  ['account_documents', 'id'],
  ['lots', 'id'],
  ['bids', 'id'],
  ['emd_records', 'id'],
  ['transactions', 'id'],
  ['media', 'id'],
  ['weighbridge_measurements', 'transaction_id'],
  ['condition_checks', 'transaction_id'],
  ['assurance_claims', 'id'],
  ['notifications', 'id'],
  ['audit_log', 'id'],
  ['id_counters', 'prefix'],
  ['app_meta', 'key'],
] as const;
export type TableName = (typeof TABLES)[number][0];
export const JSON_COLUMNS: Partial<Record<TableName, string[]>> = {
  lots: ['attributes'],
  app_meta: ['value'],
  companies: ['eligibility'],
  emd_records: ['payment', 'decision', 'refund', 'history'],
  transactions: ['balance_payment', 'payment_history', 'refunds'],
};

/** Seeded rows written before manual payments (D-090) used 'succeeded' / 'failed'. */
const EMD_STATUS: Record<string, EmdRecord['status']> = { succeeded: 'confirmed', failed: 'rejected' };

const ts = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const iso = (v: unknown): string => ts(v) ?? '';
const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function mediaRows(media: LotMedia[], owner: { lot_id?: string; transaction_id?: string }): Row[] {
  return media.map((m, i) => ({
    id: m.id,
    lot_id: owner.lot_id ?? null,
    transaction_id: owner.transaction_id ?? null,
    kind: m.kind,
    url: m.url,
    caption: m.caption,
    stage: m.stage,
    uploaded_at: ts(m.uploadedAt),
    position: i,
  }));
}

export function rowsFromState(s: DemoState): Rows {
  return {
    companies: s.companies.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      city: c.city,
      state: c.state,
      business_type: c.businessType,
      yard: c.yard ?? null,
      sample: c.sample,
      verification: c.verification,
      eligibility: c.eligibility ?? null,
    })),
    profiles: s.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, company_id: u.companyId, title: u.title, phone: u.phone ?? null, auth_user_id: u.authUserId ?? null, staff_level: u.staffLevel ?? null, regions: u.regions ?? [] })),
    account_documents: s.documents.map((d) => ({ id: d.id, company_id: d.companyId, kind: d.kind, file_name: d.fileName, content_type: d.contentType, size: d.size, path: d.path, uploaded_at: ts(d.uploadedAt), uploaded_by: d.uploadedBy })),
    lots: s.lots.map((l) => ({
      id: l.id,
      seller_id: l.sellerId,
      seller_company_id: l.sellerCompanyId,
      title: l.title,
      category: l.category,
      grade: l.grade,
      description: l.description,
      yard: l.location.yard,
      city: l.location.city,
      state: l.location.state,
      estimated_qty_mt: l.estimatedQtyMt,
      contamination_pct: l.declaration.contaminationPct,
      declared_grade: l.declaration.grade,
      declared_form: l.declaration.form,
      declared_notes: l.declaration.notes,
      attributes: l.attributes,
      reserve_per_mt: l.reservePerMt,
      reserve_visible: l.reserveVisible,
      emd_amount: l.emdAmount,
      bid_increment: l.bidIncrement,
      start_at: ts(l.startAt),
      end_at: ts(l.endAt),
      status: l.status,
      assurance_enabled: l.assurance.enabled,
      assurance_agreed_at: ts(l.assurance.agreedAt),
      measurement_basis: l.measurementBasis,
      created_at: ts(l.createdAt),
      published_at: ts(l.publishedAt),
      closed_at: ts(l.closedAt),
      winning_bid_id: l.winningBidId,
    })),
    bids: s.bids.map((b) => ({ id: b.id, lot_id: b.lotId, bidder_id: b.bidderId, amount_per_mt: b.amountPerMt, placed_at: ts(b.placedAt), client_request_id: b.clientRequestId })),
    emd_records: s.emds.map((e) => ({
      id: e.id,
      lot_id: e.lotId,
      buyer_id: e.buyerId,
      amount: e.amount,
      status: e.status,
      reference: e.reference,
      mode: e.mode,
      created_at: ts(e.createdAt),
      payment: e.payment ?? null,
      decision: e.decision ?? null,
      refund: e.refund ?? null,
      history: e.history ?? [],
    })),
    transactions: s.transactions.map((t) => ({
      id: t.id,
      lot_id: t.lotId,
      buyer_id: t.buyerId,
      seller_id: t.sellerId,
      winning_bid_id: t.winningBidId,
      price_per_mt: t.pricePerMt,
      estimated_qty_mt: t.estimatedQtyMt,
      emd_amount: t.emdAmount,
      status: t.status,
      balance_paid: t.balancePaid,
      balance_paid_at: ts(t.balancePaidAt),
      payment_deadline: ts(t.paymentDeadline),
      lifting_proposed_for: ts(t.liftingProposedFor),
      lifting_vehicle: t.liftingVehicle,
      lifting_confirmed_at: ts(t.liftingConfirmedAt),
      loading_completed_at: ts(t.loadingCompletedAt),
      final_qty_mt: t.finalQtyMt,
      final_payable: t.finalPayable,
      adjustment: t.adjustment,
      resolution: t.resolution,
      created_at: ts(t.createdAt),
      completed_at: ts(t.completedAt),
      balance_payment: t.balancePayment ?? null,
      payment_history: t.paymentHistory ?? [],
      refunds: t.refunds ?? [],
    })),
    media: [...s.lots.flatMap((l) => mediaRows(l.media, { lot_id: l.id })), ...s.transactions.flatMap((t) => mediaRows(t.media, { transaction_id: t.id }))],
    weighbridge_measurements: s.transactions.flatMap((t) =>
      t.weighbridge
        ? [
            {
              transaction_id: t.id,
              ticket_ref: t.weighbridge.ticketRef,
              weighbridge: t.weighbridge.weighbridge,
              gross_mt: t.weighbridge.grossMt,
              tare_mt: t.weighbridge.tareMt,
              measured_mt: t.weighbridge.measuredMt,
              ticket_media_id: t.weighbridge.ticketMediaId,
              measured_at: ts(t.weighbridge.measuredAt),
              recorded_by: t.weighbridge.recordedBy,
            },
          ]
        : [],
    ),
    condition_checks: s.transactions.flatMap((t) =>
      t.condition
        ? [
            {
              transaction_id: t.id,
              observed_contamination_pct: t.condition.observedContaminationPct,
              notes: t.condition.notes,
              photo_media_ids: t.condition.photoMediaIds,
              checked_at: ts(t.condition.checkedAt),
              recorded_by: t.condition.recordedBy,
            },
          ]
        : [],
    ),
    assurance_claims: s.claims.map((c) => ({
      id: c.id,
      transaction_id: c.transactionId,
      lot_id: c.lotId,
      buyer_id: c.buyerId,
      seller_id: c.sellerId,
      type: c.type,
      expected: c.expected,
      observed_value: c.observedValue,
      observed: c.observed,
      explanation: c.explanation,
      requested_remedy: c.requestedRemedy,
      media_ids: c.mediaIds,
      status: c.status,
      seller_decision: c.sellerResponse?.decision ?? null,
      seller_explanation: c.sellerResponse?.explanation ?? null,
      seller_media_ids: c.sellerResponse?.mediaIds ?? null,
      seller_responded_at: ts(c.sellerResponse?.respondedAt),
      seller_responded_by: c.sellerResponse?.respondedBy ?? null,
      ops_outcome: c.opsDecision?.outcome ?? null,
      ops_reason: c.opsDecision?.reason ?? null,
      ops_amount: c.opsDecision?.amount ?? null,
      ops_decided_at: ts(c.opsDecision?.decidedAt),
      ops_decided_by: c.opsDecision?.decidedBy ?? null,
      opened_at: ts(c.openedAt),
      resolved_at: ts(c.resolvedAt),
    })),
    notifications: s.notifications.map((n) => ({ id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body, href: n.href, read: n.read, at: ts(n.at) })),
    audit_log: s.audit.map((a) => ({
      id: a.id,
      entity: a.entity,
      entity_id: a.entityId,
      action: a.action,
      actor_id: a.actorId,
      actor_role: a.actorRole,
      from_status: a.from,
      to_status: a.to,
      reason: a.reason,
      at: ts(a.at),
    })),
    id_counters: Object.entries(s.counters).map(([prefix, next]) => ({ prefix, next })),
    app_meta: [
      { key: 'version', value: s.version },
      { key: 'seeded_at', value: s.seededAt },
    ],
  };
}

const byPosition = (a: Row, b: Row) => num(a.position) - num(b.position);
const toMedia = (r: Row): LotMedia => ({
  id: String(r.id),
  kind: r.kind as LotMedia['kind'],
  url: String(r.url),
  caption: String(r.caption),
  stage: r.stage as LotMedia['stage'],
  uploadedAt: iso(r.uploaded_at),
});

export function stateFromRows(r: Rows): DemoState {
  const mediaFor = (key: 'lot_id' | 'transaction_id', id: string) => r.media.filter((m) => m[key] === id).sort(byPosition).map(toMedia);
  const wb = new Map(r.weighbridge_measurements.map((w) => [w.transaction_id as string, w]));
  const cc = new Map(r.condition_checks.map((c) => [c.transaction_id as string, c]));
  const meta = new Map(r.app_meta.map((m) => [m.key as string, m.value]));

  return {
    version: Number(meta.get('version') ?? 1),
    seededAt: String(meta.get('seeded_at') ?? ''),
    companies: r.companies.map(
      (c): Company => ({
        id: String(c.id),
        name: String(c.name),
        kind: c.kind as Company['kind'],
        city: String(c.city),
        state: String(c.state),
        businessType: String(c.business_type),
        ...(c.yard !== null ? { yard: String(c.yard) } : {}),
        sample: Boolean(c.sample),
        verification: c.verification as Company['verification'],
        // Applications saved before regions existed have no state (D-102).
        ...(c.eligibility ? { eligibility: { state: '', ...(c.eligibility as object) } as Company['eligibility'] } : {}),
      }),
    ),
    users: r.profiles.map(
      (u): User => ({
        id: String(u.id),
        name: String(u.name),
        email: String(u.email),
        role: u.role as User['role'],
        companyId: (u.company_id as string | null) ?? null,
        title: String(u.title),
        phone: (u.phone as string | null) ?? null,
        authUserId: (u.auth_user_id as string | null) ?? null,
        ...(u.role === 'ops' ? { staffLevel: (u.staff_level as User['staffLevel']) ?? null, regions: ((u.regions as string[] | null) ?? []).filter(isRegion) } : {}),
      }),
    ),
    documents: r.account_documents.map(
      (d): AccountDocument => ({
        id: String(d.id),
        companyId: String(d.company_id),
        kind: d.kind as AccountDocument['kind'],
        fileName: String(d.file_name),
        contentType: String(d.content_type),
        size: num(d.size),
        path: String(d.path),
        uploadedAt: iso(d.uploaded_at),
        uploadedBy: String(d.uploaded_by),
      }),
    ),
    lots: r.lots.map(
      (l): Lot => ({
        id: String(l.id),
        sellerId: String(l.seller_id),
        sellerCompanyId: String(l.seller_company_id),
        title: String(l.title),
        category: l.category as Lot['category'],
        grade: String(l.grade),
        description: String(l.description),
        location: { yard: String(l.yard), city: String(l.city), state: String(l.state) },
        estimatedQtyMt: num(l.estimated_qty_mt),
        declaration: { contaminationPct: numOrNull(l.contamination_pct), grade: String(l.declared_grade), form: String(l.declared_form), notes: String(l.declared_notes) },
        attributes: (l.attributes ?? {}) as Record<string, string>,
        reservePerMt: num(l.reserve_per_mt),
        reserveVisible: Boolean(l.reserve_visible),
        emdAmount: num(l.emd_amount),
        bidIncrement: num(l.bid_increment),
        startAt: iso(l.start_at),
        endAt: iso(l.end_at),
        status: l.status as Lot['status'],
        assurance: { enabled: Boolean(l.assurance_enabled), agreedAt: ts(l.assurance_agreed_at) },
        media: mediaFor('lot_id', String(l.id)),
        measurementBasis: String(l.measurement_basis),
        createdAt: iso(l.created_at),
        publishedAt: ts(l.published_at),
        closedAt: ts(l.closed_at),
        winningBidId: (l.winning_bid_id as string | null) ?? null,
      }),
    ),
    bids: r.bids.map((b): Bid => ({ id: String(b.id), lotId: String(b.lot_id), bidderId: String(b.bidder_id), amountPerMt: num(b.amount_per_mt), placedAt: iso(b.placed_at), clientRequestId: String(b.client_request_id) })),
    emds: r.emd_records.map(
      (e): EmdRecord => ({
        id: String(e.id),
        lotId: String(e.lot_id),
        buyerId: String(e.buyer_id),
        amount: num(e.amount),
        status: EMD_STATUS[String(e.status)] ?? (e.status as EmdRecord['status']),
        reference: String(e.reference),
        mode: e.mode === 'manual' ? 'manual' : 'simulated',
        createdAt: iso(e.created_at),
        payment: (e.payment as EmdRecord['payment']) ?? null,
        decision: (e.decision as EmdRecord['decision']) ?? null,
        refund: (e.refund as EmdRecord['refund']) ?? null,
        history: (e.history as EmdRecord['history']) ?? [],
      }),
    ),
    transactions: r.transactions.map((t): Transaction => {
      const w = wb.get(String(t.id));
      const c = cc.get(String(t.id));
      return {
        id: String(t.id),
        lotId: String(t.lot_id),
        buyerId: String(t.buyer_id),
        sellerId: String(t.seller_id),
        winningBidId: String(t.winning_bid_id),
        pricePerMt: num(t.price_per_mt),
        estimatedQtyMt: num(t.estimated_qty_mt),
        emdAmount: num(t.emd_amount),
        status: t.status as Transaction['status'],
        balancePaid: num(t.balance_paid),
        balancePaidAt: ts(t.balance_paid_at),
        paymentDeadline: iso(t.payment_deadline),
        liftingProposedFor: ts(t.lifting_proposed_for),
        liftingVehicle: (t.lifting_vehicle as string | null) ?? null,
        liftingConfirmedAt: ts(t.lifting_confirmed_at),
        loadingCompletedAt: ts(t.loading_completed_at),
        weighbridge: w
          ? {
              ticketRef: String(w.ticket_ref),
              weighbridge: String(w.weighbridge),
              grossMt: numOrNull(w.gross_mt),
              tareMt: numOrNull(w.tare_mt),
              measuredMt: num(w.measured_mt),
              ticketMediaId: (w.ticket_media_id as string | null) ?? null,
              measuredAt: iso(w.measured_at),
              recordedBy: String(w.recorded_by),
            }
          : null,
        condition: c
          ? {
              observedContaminationPct: num(c.observed_contamination_pct),
              notes: String(c.notes),
              photoMediaIds: (c.photo_media_ids as string[]) ?? [],
              checkedAt: iso(c.checked_at),
              recordedBy: String(c.recorded_by),
            }
          : null,
        finalQtyMt: numOrNull(t.final_qty_mt),
        finalPayable: numOrNull(t.final_payable),
        adjustment: num(t.adjustment),
        resolution: (t.resolution as Transaction['resolution']) ?? null,
        createdAt: iso(t.created_at),
        completedAt: ts(t.completed_at),
        media: mediaFor('transaction_id', String(t.id)),
        balancePayment: (t.balance_payment as Transaction['balancePayment']) ?? null,
        paymentHistory: (t.payment_history as Transaction['paymentHistory']) ?? [],
        refunds: (t.refunds as Transaction['refunds']) ?? [],
      };
    }),
    claims: r.assurance_claims.map(
      (c): Claim => ({
        id: String(c.id),
        transactionId: String(c.transaction_id),
        lotId: String(c.lot_id),
        buyerId: String(c.buyer_id),
        sellerId: String(c.seller_id),
        type: c.type as Claim['type'],
        expected: String(c.expected),
        observedValue: num(c.observed_value),
        observed: String(c.observed),
        explanation: String(c.explanation),
        requestedRemedy: c.requested_remedy as Claim['requestedRemedy'],
        mediaIds: (c.media_ids as string[]) ?? [],
        status: c.status as Claim['status'],
        sellerResponse: c.seller_decision
          ? {
              decision: c.seller_decision as 'accept' | 'dispute',
              explanation: String(c.seller_explanation ?? ''),
              mediaIds: (c.seller_media_ids as string[]) ?? [],
              respondedAt: iso(c.seller_responded_at),
              respondedBy: String(c.seller_responded_by),
            }
          : null,
        opsDecision: c.ops_outcome
          ? {
              outcome: c.ops_outcome as 'approve_adjustment' | 'approve_exit' | 'reject',
              reason: String(c.ops_reason),
              amount: num(c.ops_amount),
              decidedAt: iso(c.ops_decided_at),
              decidedBy: String(c.ops_decided_by),
            }
          : null,
        openedAt: iso(c.opened_at),
        resolvedAt: ts(c.resolved_at),
      }),
    ),
    notifications: r.notifications.map(
      (n): Notification => ({ id: String(n.id), userId: String(n.user_id), kind: n.kind as Notification['kind'], title: String(n.title), body: String(n.body), href: String(n.href), read: Boolean(n.read), at: iso(n.at) }),
    ),
    audit: r.audit_log.map(
      (a): AuditEntry => ({
        id: String(a.id),
        entity: a.entity as AuditEntry['entity'],
        entityId: String(a.entity_id),
        action: String(a.action),
        actorId: String(a.actor_id),
        actorRole: a.actor_role as AuditEntry['actorRole'],
        from: (a.from_status as string | null) ?? null,
        to: (a.to_status as string | null) ?? null,
        reason: (a.reason as string | null) ?? null,
        at: iso(a.at),
      }),
    ),
    counters: Object.fromEntries(r.id_counters.map((c) => [String(c.prefix), num(c.next)])),
  };
}

/** Normalise a row for comparison (timestamps → ISO, numbers → numbers). */
export function rowKey(row: Row): string {
  return JSON.stringify(row, (_k, v) => (v instanceof Date ? v.toISOString() : v));
}
