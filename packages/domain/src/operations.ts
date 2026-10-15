/**
 * Commands over a full state snapshot. Pure: each takes a state and returns the next state plus
 * a result, so the in-browser DemoDataSource and the API (Phase 2) apply identical rules.
 */
import { closeAuction, deriveAuctionStatus, hasEmd, highestBid, validateBid } from './auction';
import type { Actor, Ctx } from './context';
import { audit } from './context';
import { formatINR } from './format';
import { NEW_ID_START, type DemoState } from './seed';
import { createTransaction } from './transaction';
import type { Bid, Company, EmdRecord, Iso, Notification, Rejection, Rupees, User } from './types';

/** States are plain JSON (they persist to localStorage and Postgres), so a JSON copy is exact. */
export function clone(state: DemoState): DemoState {
  return JSON.parse(JSON.stringify(state)) as DemoState;
}

export type OpResult<T> = { ok: true; state: DemoState; value: T } | { ok: false; state: DemoState; error: Rejection };

/** Context whose ids continue from the state's counters (persisted with the state). */
export function stateCtx(state: DemoState, now: Iso, actor: Actor): Ctx {
  return {
    now,
    actor,
    newId: (prefix) => {
      const n = state.counters[prefix] ?? NEW_ID_START;
      state.counters[prefix] = n + 1;
      return `${prefix}-${n}`;
    },
  };
}

function rejected<T>(state: DemoState, code: string, what: string, next: string): OpResult<T> {
  return { ok: false, state, error: { code, what, next } };
}

function pushNotification(state: DemoState, ctx: Ctx, n: Omit<Notification, 'id' | 'read' | 'at'>) {
  state.notifications.push({ ...n, id: ctx.newId('N'), read: false, at: ctx.now });
}

const SYSTEM: Actor = { id: 'system', role: 'ops' };

export type NotificationDraft = Omit<Notification, 'id' | 'read' | 'at'>;

/** Who hears what when a bid is accepted — shared by demo mode and the API. */
export function bidNotifications(lotId: string, bidderId: string, amountPerMt: Rupees, previousLeaderId: string | null): NotificationDraft[] {
  const href = `/auctions/${lotId}`;
  const out: NotificationDraft[] = [
    { userId: bidderId, kind: 'bid_accepted', title: `Bid placed on ${lotId}`, body: `You are leading at ${formatINR(amountPerMt, { perMt: true })}.`, href },
  ];
  if (previousLeaderId && previousLeaderId !== bidderId) {
    out.push({ userId: previousLeaderId, kind: 'outbid', title: `You were outbid on ${lotId}`, body: `Current highest bid is ${formatINR(amountPerMt, { perMt: true })}.`, href });
  }
  return out;
}

/** Who hears what when an auction closes — shared by demo mode and the API. */
export function closeNotifications(
  lot: { id: string; title: string; sellerId: string },
  win: { bidderId: string; amountPerMt: Rupees; transactionId: string } | null,
  bidders: readonly string[],
): NotificationDraft[] {
  if (!win) {
    return [...bidders, lot.sellerId].map((userId) => ({ userId, kind: 'auction_closed', title: `${lot.id} closed unsold`, body: 'No bid met the reserve price.', href: `/auctions/${lot.id}` }));
  }
  const price = formatINR(win.amountPerMt, { perMt: true });
  const txHref = `/transactions/${win.transactionId}`;
  return [
    { userId: win.bidderId, kind: 'auction_won', title: `You won ${lot.id}`, body: `${lot.title} at ${price}. Pay the balance to continue.`, href: txHref },
    ...bidders
      .filter((b) => b !== win.bidderId)
      .map((userId): NotificationDraft => ({ userId, kind: 'auction_lost', title: `${lot.id} closed`, body: `Another bidder won at ${price}. Your EMD is refunded (simulated).`, href: `/auctions/${lot.id}` })),
    { userId: lot.sellerId, kind: 'auction_closed', title: `${lot.id} sold`, body: `Winning bid ${price}. Transaction ${win.transactionId} started.`, href: txHref },
  ];
}

// ── Auction closing ──────────────────────────────────────────────────────────

function closeLot(state: DemoState, lotId: string, ctx: Ctx, early: boolean) {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) return;
  const bids = state.bids.filter((b) => b.lotId === lotId);
  const result = closeAuction(lot, bids);
  const from = lot.status;
  lot.closedAt = ctx.now;
  if (early) lot.endAt = ctx.now;
  const bidders = [...new Set(bids.map((b) => b.bidderId))];

  if (result.status === 'closed_unsold' || !result.winningBid) {
    lot.status = 'closed_unsold';
    state.audit.push(audit(ctx, { entity: 'lot', entityId: lot.id, action: early ? 'close_demo_auction' : 'close_auction', from, to: 'closed_unsold', reason: 'No bid met the reserve.' }));
    for (const n of closeNotifications(lot, null, bidders)) pushNotification(state, ctx, n);
    return;
  }

  const win = result.winningBid;
  lot.status = 'awarded';
  lot.winningBidId = win.id;
  const tx = createTransaction(lot, win, ctx);
  state.transactions.push(tx);
  state.audit.push(audit(ctx, { entity: 'lot', entityId: lot.id, action: early ? 'close_demo_auction' : 'close_auction', from, to: 'awarded', reason: `Highest bid ${formatINR(win.amountPerMt, { perMt: true })} met the reserve.` }));
  state.audit.push(audit(ctx, { entity: 'transaction', entityId: tx.id, action: 'create', to: tx.status }));
  for (const uid of bidders.filter((b) => b !== win.bidderId)) {
    const emd = state.emds.find((e) => e.lotId === lot.id && e.buyerId === uid && e.status === 'succeeded');
    if (emd) emd.status = 'refunded';
  }
  for (const n of closeNotifications(lot, { bidderId: win.bidderId, amountPerMt: win.amountPerMt, transactionId: tx.id }, bidders)) pushNotification(state, ctx, n);
}

/** Close every auction past its end time (close on first access — D-020). Returns closed lot ids. */
export function processDueClosures(state: DemoState, now: Iso): { state: DemoState; closed: string[] } {
  const due = state.lots.filter((l) => deriveAuctionStatus(l, now) === 'ended').map((l) => l.id);
  if (due.length === 0) return { state, closed: [] };
  const next = clone(state);
  const ctx = stateCtx(next, now, SYSTEM);
  for (const id of due) closeLot(next, id, ctx, false);
  return { state: next, closed: due };
}

/** Operations' demo action: end a live auction now, deciding the result from stored bids. */
export function closeDemoAuction(state: DemoState, lotId: string, actor: Actor, now: Iso): OpResult<{ status: string; transactionId: string | null }> {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) return rejected(state, 'not_found', 'That lot does not exist.', 'Go back to the auctions list.');
  if (actor.role !== 'ops') return rejected(state, 'forbidden', 'Only Operations can close a demo auction early.', 'Auctions close automatically at their end time.');
  const status = deriveAuctionStatus(lot, now);
  if (status !== 'live' && status !== 'ended') {
    return rejected(state, 'not_live', `This auction is ${status.replace(/_/g, ' ')}, so it cannot be closed.`, 'Only live auctions can be closed.');
  }
  const next = clone(state);
  closeLot(next, lotId, stateCtx(next, now, actor), true);
  const closed = next.lots.find((l) => l.id === lotId);
  const tx = next.transactions.find((t) => t.lotId === lotId);
  return { ok: true, state: next, value: { status: closed?.status ?? 'closed_unsold', transactionId: tx?.id ?? null } };
}

// ── EMD ──────────────────────────────────────────────────────────────────────

export function payEmd(
  state: DemoState,
  input: { lotId: string; outcome: 'success' | 'failure' },
  actor: Actor,
  now: Iso,
): OpResult<EmdRecord> {
  const lot = state.lots.find((l) => l.id === input.lotId);
  if (!lot) return rejected(state, 'not_found', 'That lot does not exist.', 'Go back to the auctions list.');
  if (actor.role !== 'buyer') return rejected(state, 'not_buyer', 'Only buyer accounts pay an EMD.', 'Switch to a buyer account.');
  if (lot.sellerId === actor.id) return rejected(state, 'own_lot', 'Sellers cannot bid on their own lots.', 'Use a buyer account for other lots.');
  const status = deriveAuctionStatus(lot, now);
  if (status !== 'live' && status !== 'scheduled') {
    return rejected(state, 'auction_closed', 'This auction has closed, so no EMD is needed.', 'Browse other live auctions.');
  }
  if (hasEmd(state.emds, lot.id, actor.id)) {
    return rejected(state, 'already_paid', 'Your EMD for this lot is already recorded.', 'You can place a bid now.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const emd: EmdRecord = {
    id: ctx.newId('EMD'),
    lotId: lot.id,
    buyerId: actor.id,
    amount: lot.emdAmount,
    status: input.outcome === 'success' ? 'succeeded' : 'failed',
    reference: `SIM-${Date.parse(now).toString(36).toUpperCase()}`,
    mode: 'simulated',
    createdAt: now,
  };
  next.emds.push(emd);
  next.audit.push(audit(ctx, { entity: 'emd', entityId: emd.id, action: 'pay_emd_simulated', to: emd.status }));
  if (input.outcome === 'failure') {
    return { ok: false, state: next, error: { code: 'payment_failed', what: 'The simulated EMD payment failed. Nothing was charged.', next: 'Try the payment again.' } };
  }
  return { ok: true, state: next, value: emd };
}

// ── Bidding ──────────────────────────────────────────────────────────────────

export function placeBid(
  state: DemoState,
  input: { lotId: string; amountPerMt: unknown; clientRequestId: string; seenHighestPerMt: Rupees | null },
  actor: Actor,
  now: Iso,
): OpResult<{ bid: Bid; minNext: Rupees; leading: boolean }> {
  const lot = state.lots.find((l) => l.id === input.lotId);
  if (!lot) return rejected(state, 'not_found', 'That lot does not exist.', 'Go back to the auctions list.');
  const bids = state.bids.filter((b) => b.lotId === lot.id);
  const v = validateBid({ lot, bids, emds: state.emds, actor, now, ...input });
  if (!v.ok) return { ok: false, state, error: v.error };

  const next = clone(state);
  const ctx = stateCtx(next, now, actor);
  const previousLeader = highestBid(bids);
  const bid: Bid = { id: ctx.newId('BID'), lotId: lot.id, bidderId: actor.id, amountPerMt: v.value.amountPerMt, placedAt: now, clientRequestId: input.clientRequestId };
  next.bids.push(bid);
  next.audit.push(audit(ctx, { entity: 'bid', entityId: bid.id, action: 'place_bid', to: formatINR(bid.amountPerMt, { perMt: true }) }));
  for (const n of bidNotifications(lot.id, actor.id, bid.amountPerMt, previousLeader?.bidderId ?? null)) pushNotification(next, ctx, n);
  return { ok: true, state: next, value: { bid, minNext: bid.amountPerMt + lot.bidIncrement, leading: true } };
}

// ── Buyer registration (demo onboarding, SPEC §9) ────────────────────────────

export interface BuyerRegistration {
  name: string;
  email: string;
  companyName: string;
  businessType: string;
  city: string;
  state: string;
  industry: string;
  materials: string[];
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your work email.';
  if (/\.\./.test(e)) return `"${e}" has two dots in a row. Check the address.`;
  if (!EMAIL.test(e)) return `"${e}" isn't a valid email address. Use the format name@company.com.`;
  return null;
}

export function registerBuyer(state: DemoState, input: BuyerRegistration, now: Iso): OpResult<{ user: User; company: Company }> {
  const missing: string[] = (
    [
      ['name', 'your name'],
      ['companyName', 'company name'],
      ['businessType', 'business type'],
      ['city', 'city'],
      ['state', 'state'],
      ['industry', 'industry'],
    ] as const
  )
    .filter(([k]) => !input[k].trim())
    .map(([, label]) => label);
  if (input.materials.length === 0) missing.push('materials of interest');
  if (missing.length) return rejected(state, 'incomplete_profile', `Your profile is missing: ${missing.join(', ')}.`, 'Go back and fill in the highlighted fields.');
  const emailError = validateEmail(input.email);
  if (emailError) return rejected(state, 'invalid_email', emailError, 'Correct the email and try again.');
  const email = input.email.trim().toLowerCase();
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    return rejected(state, 'duplicate_email', 'An account with this email already exists.', 'Sign in with the demo buyer, or use a different email.');
  }
  const next = clone(state);
  const ctx = stateCtx(next, now, { id: 'guest', role: 'guest' });
  const company: Company = {
    id: ctx.newId('C'),
    name: input.companyName.trim(),
    kind: 'buyer',
    city: input.city.trim(),
    state: input.state.trim(),
    businessType: input.businessType,
    sample: true,
    verification: 'demo_approved',
  };
  const user: User = { id: ctx.newId('U'), name: input.name.trim(), email, role: 'buyer', companyId: company.id, title: input.industry.trim() };
  next.companies.push(company);
  next.users.push(user);
  next.audit.push(audit({ ...ctx, actor: { id: user.id, role: 'buyer' } }, { entity: 'user', entityId: user.id, action: 'register_buyer_demo', to: 'demo_approved' }));
  return { ok: true, state: next, value: { user, company } };
}

/** Mark a user's notifications read. */
export function markNotificationsRead(state: DemoState, userId: string): DemoState {
  const next = clone(state);
  for (const n of next.notifications) if (n.userId === userId) n.read = true;
  return next;
}
