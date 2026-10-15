import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import type { CategoryId, LotFilters, LotSort, Role, StatusFilter, Viewer } from '@auctionit/domain';
import type { DsResult } from '@auctionit/client';
import type { Env } from './env';
import { ApiError } from './errors';
import * as S from './schemas';
import type { Service } from './services/DbService';
import type { MediaStore } from './services/storage';

export type ApiService = Service & { verifySession(role: string, userId: string): Promise<boolean> };

const FORBIDDEN_CODES = new Set(['forbidden', 'not_buyer', 'not_owner', 'own_lot']);

/** Domain result → HTTP. Rule rejections keep their code and wording; the client shows them as-is. */
function send<T>(res: Response, r: DsResult<T>) {
  if (r.ok) return res.json({ data: r.data });
  const status = r.error.kind === 'network' ? 503 : r.error.code === 'not_found' ? 404 : FORBIDDEN_CODES.has(r.error.code) ? 403 : 422;
  return res.status(status).json({ error: { code: r.error.code, message: r.error.what, what: r.error.what, next: r.error.next } });
}

const viewerOf = (res: Response): Viewer => res.locals.viewer as Viewer;

/**
 * Session ("role:userId") from the x-demo-session header; the user must exist with that role.
 * Not authentication — see docs/PRODUCTION_GAPS.md #13 (D-066).
 */
function session(service: ApiService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.header('x-demo-session');
    res.locals.viewer = { id: null, role: 'guest' } satisfies Viewer;
    if (!raw) return next();
    const [role, userId] = decodeURIComponent(raw).split(':');
    if (!role || !userId || !(await service.verifySession(role, userId))) {
      return next(new ApiError(401, 'invalid_session', 'Your session isn’t valid any more.', 'Sign in again — the account may no longer exist.'));
    }
    res.locals.viewer = { id: userId, role: role as Role } satisfies Viewer;
    next();
  };
}

/** Presenter-only controls refuse unless DEMO_CONTROLS_ENABLED. */
function presenterOnly(env: Env, what: string, next = 'Nothing was changed.') {
  if (!env.DEMO_CONTROLS_ENABLED) throw new ApiError(403, 'not_available', what, next);
}

const ROLE_NAME: Record<string, string> = { buyer: 'a buyer', seller: 'a seller', ops: 'Operations' };

/** Route guard (CLAUDE.md: guard routes in the web app and every API route). */
function requireRole(...roles: (Role | 'signed_in')[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const v = viewerOf(res);
    if (v.role === 'guest') return next(new ApiError(401, 'unauthenticated', 'You need to sign in for this.', 'Sign in and try again.'));
    if (roles.includes('signed_in') || roles.includes(v.role)) return next();
    const need = roles.map((r) => ROLE_NAME[r] ?? r).join(' or ');
    next(new ApiError(403, 'forbidden', `This needs ${need}.`, 'Sign in with an account that has this role.'));
  };
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

function filtersFrom(q: Request['query']): LotFilters {
  const list = (k: string) => (typeof q[k] === 'string' ? (q[k] as string).split(',').filter(Boolean) : []);
  return {
    q: typeof q.q === 'string' ? q.q : undefined,
    categories: list('cat') as CategoryId[],
    city: typeof q.city === 'string' ? q.city : undefined,
    assured: q.assured === '1',
    statuses: list('status') as StatusFilter[],
    endingSoon: q.soon === '1',
    sort: typeof q.sort === 'string' ? (q.sort as LotSort) : undefined,
  };
}

export function createRouter(service: ApiService, media: MediaStore, env: Env): Router {
  const r = express.Router();
  const withSession = session(service);
  r.use((req, res, next) => {
    withSession(req, res, next).catch(next);
  });

  const checkMedia = (list: S.MediaInput[]) => {
    const bad = list.find((m) => !media.isOurUrl(m.url));
    if (bad) throw new ApiError(422, 'invalid_media', `${bad.caption} wasn’t uploaded through AuctionIT.`, 'Upload the file again, then retry.');
    return list;
  };
  const id = (req: Request) => String(req.params.id);

  // ── Lots and bidding ──
  r.get('/lots', wrap(async (req, res) => send(res, await service.listLots(filtersFrom(req.query)))));
  r.get('/lots/:id', wrap(async (req, res) => send(res, await service.getLot(id(req), viewerOf(res)))));
  r.post(
    '/lots/:id/emd',
    requireRole('buyer'),
    wrap(async (req, res) => {
      const { outcome } = S.EmdBody.parse(req.body);
      if (outcome === 'failure') presenterOnly(env, 'Simulating a failed payment isn’t available here.');
      send(res, await service.payEmd(id(req), outcome, viewerOf(res)));
    }),
  );
  r.post(
    '/lots/:id/bids',
    requireRole('buyer'),
    wrap(async (req, res) => {
      const b = S.BidBody.parse(req.body);
      send(res, await service.placeBid({ lotId: id(req), amountPerMt: b.amountPerMt as number | null, clientRequestId: b.clientRequestId, seenHighestPerMt: b.seenHighestPerMt }, viewerOf(res)));
    }),
  );
  r.post(
    '/lots/:id/close',
    requireRole('ops'),
    wrap(async (req, res) => {
      presenterOnly(env, 'Closing an auction early isn’t available here.', 'Auctions close automatically at their end time.');
      send(res, await service.closeDemoAuction(id(req), viewerOf(res)));
    }),
  );

  // ── Buyer / transactions / claims ──
  r.get('/buyer/dashboard', requireRole('buyer'), wrap(async (_req, res) => send(res, await service.buyerDashboard(viewerOf(res)))));
  r.get('/transactions/:id/summary', requireRole('signed_in'), wrap(async (req, res) => send(res, await service.transactionSummary(id(req), viewerOf(res)))));
  r.get('/transactions/:id', requireRole('signed_in'), wrap(async (req, res) => send(res, await service.transactionDetail(id(req), viewerOf(res)))));
  r.post(
    '/transactions/:id/actions',
    requireRole('signed_in'),
    wrap(async (req, res) => {
      const b = S.TxActionBody.parse(req.body);
      send(res, await service.txAction(id(req), b.action, viewerOf(res), checkMedia(b.media)));
    }),
  );
  r.post(
    '/transactions/:id/claims',
    requireRole('buyer'),
    wrap(async (req, res) => {
      const b = S.ClaimBody.parse(req.body);
      send(res, await service.submitClaim(id(req), b.input, viewerOf(res), checkMedia(b.media)));
    }),
  );
  r.post(
    '/claims/:id/response',
    requireRole('seller'),
    wrap(async (req, res) => {
      const b = S.ResponseBody.parse(req.body);
      send(res, await service.respondClaim(id(req), b.response, viewerOf(res), checkMedia(b.media)));
    }),
  );
  r.post('/claims/:id/decision', requireRole('ops'), wrap(async (req, res) => send(res, await service.decideClaim(id(req), S.DecisionBody.parse(req.body), viewerOf(res)))));
  r.get('/claims/:id', requireRole('ops'), wrap(async (req, res) => send(res, await service.claimReview(id(req), viewerOf(res)))));
  r.get('/ops/overview', requireRole('ops'), wrap(async (_req, res) => send(res, await service.opsOverview(viewerOf(res)))));

  // ── Seller ──
  r.get('/seller/dashboard', requireRole('seller'), wrap(async (_req, res) => send(res, await service.sellerDashboard(viewerOf(res)))));
  r.get('/seller/lots/:id', requireRole('seller'), wrap(async (req, res) => send(res, await service.sellerLot(id(req), viewerOf(res)))));
  r.post('/seller/lots', requireRole('seller'), wrap(async (req, res) => send(res, await service.saveDraft(null, { ...S.DraftBody.parse(req.body), media: checkMedia(S.DraftBody.parse(req.body).media ?? []) }, viewerOf(res)))));
  r.put('/seller/lots/:id', requireRole('seller'), wrap(async (req, res) => send(res, await service.saveDraft(id(req), { ...S.DraftBody.parse(req.body), media: checkMedia(S.DraftBody.parse(req.body).media ?? []) }, viewerOf(res)))));
  r.post('/seller/lots/:id/publish', requireRole('seller'), wrap(async (req, res) => send(res, await service.publishLot(id(req), viewerOf(res)))));
  r.delete('/seller/lots/:id', requireRole('seller'), wrap(async (req, res) => send(res, await service.deleteDraft(id(req), viewerOf(res)))));

  // ── Accounts and notifications ──
  r.post('/onboarding/buyer', wrap(async (req, res) => send(res, await service.registerBuyer(S.BuyerRegistration.parse(req.body)))));
  r.post('/onboarding/seller', wrap(async (req, res) => send(res, await service.registerSeller(S.SellerRegistration.parse(req.body)))));
  r.get('/users/exists', wrap(async (req, res) => send(res, await service.emailExists(String(req.query.email ?? '')))));
  r.get(
    '/users/:id',
    requireRole('signed_in'),
    wrap(async (req, res) => {
      const v = viewerOf(res);
      if (v.id !== id(req) && v.role !== 'ops') throw new ApiError(403, 'forbidden', 'You can only view your own profile.', 'Open your own account.');
      send(res, await service.getUser(id(req)));
    }),
  );
  r.get('/notifications', requireRole('signed_in'), wrap(async (_req, res) => send(res, await service.notifications(viewerOf(res)))));
  r.post('/notifications/read', requireRole('signed_in'), wrap(async (_req, res) => send(res, await service.markNotificationsRead(viewerOf(res)))));

  // ── Evidence upload (raw body; type and size checked by the shared domain rules) ──
  r.post(
    '/media',
    requireRole('signed_in'),
    express.raw({ type: () => true, limit: '55mb' }),
    wrap(async (req, res) => {
      const stage = String(req.query.stage) as (typeof S.STAGES)[number];
      if (!S.STAGES.includes(stage)) throw new ApiError(422, 'invalid_stage', 'Unknown upload stage.', 'Upload from the listing, lifting or claim form.');
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      send(res, await media.put({ name: String(req.query.name ?? 'file'), type: String(req.query.type ?? req.header('content-type') ?? ''), bytes }, stage));
    }),
  );

  // ── Presenter controls (DEMO_CONTROLS_ENABLED; off against a real database) ──
  r.post(
    '/demo/reset',
    wrap(async (_req, res) => {
      if (!env.DEMO_CONTROLS_ENABLED) throw new ApiError(403, 'reset_disabled', 'Resetting data isn’t available here.', 'Nothing was changed.');
      send(res, await service.reset());
    }),
  );
  return r;
}
