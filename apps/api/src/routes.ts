import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import type { CategoryId, LotFilters, LotSort, Role, StatusFilter, Viewer } from '@auctionit/domain';
import type { DsResult } from '@auctionit/client';
import type { Env } from './env';
import { ApiError } from './errors';
import * as S from './schemas';
import type { Service } from './services/DbService';
import type { MediaStore } from './services/storage';
import type { AuthGate, AuthUser, DocumentStore } from './services/supabase';

export type ApiService = Service & {
  verifySession(role: string, userId: string): Promise<boolean>;
  profileForAuthUser(authUserId: string): Promise<{ id: string; role: 'buyer' | 'seller' | 'ops' } | null>;
  authUserByEmail(email: string): Promise<{ id: string; confirmed: boolean } | null>;
};

export interface Identity {
  /** Verifies Supabase access tokens; null when the API has no Supabase project (in-memory demo). */
  auth: AuthGate | null;
  documents: DocumentStore;
}

const FORBIDDEN_CODES = new Set(['forbidden', 'other_region', 'not_buyer', 'not_owner', 'own_lot', 'not_eligible']);
const CONFLICT_CODES = new Set(['already_staff', 'duplicate_account', 'duplicate_identity', 'already_registered']);

/** Domain result → HTTP. Rule rejections keep their code and wording; the client shows them as-is. */
function send<T>(res: Response, r: DsResult<T>) {
  if (r.ok) return res.json({ data: r.data });
  const status = r.error.kind === 'network' ? 503 : r.error.code === 'not_found' ? 404 : FORBIDDEN_CODES.has(r.error.code) ? 403 : CONFLICT_CODES.has(r.error.code) ? 409 : 422;
  return res.status(status).json({ error: { code: r.error.code, message: r.error.what, what: r.error.what, next: r.error.next } });
}

const viewerOf = (res: Response): Viewer => res.locals.viewer as Viewer;
const authUserOf = (res: Response): AuthUser | null => (res.locals.authUser as AuthUser | undefined) ?? null;

/**
 * Who is calling. Live site: `Authorization: Bearer <Supabase access token>`, verified by Supabase Auth; the
 * profile linked to that auth user decides id and role (docs/PHASE1_MVP.md). Presenter controls only (local
 * data): the `x-demo-session: role:userId` header of the sample accounts. Otherwise the caller is a guest.
 */
function session(service: ApiService, env: Env, auth: AuthGate | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    res.locals.viewer = { id: null, role: 'guest' } satisfies Viewer;
    const bearer = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '')?.[1];
    if (bearer) {
      const user = auth ? await auth.verify(bearer) : null;
      if (!user) return next(new ApiError(401, 'invalid_session', 'Your sign-in has expired or isn’t valid.', 'Sign in again.'));
      res.locals.authUser = user;
      const profile = user.emailVerified ? await service.profileForAuthUser(user.id) : null;
      if (profile) res.locals.viewer = { id: profile.id, role: profile.role } satisfies Viewer;
      return next();
    }
    const raw = env.DEMO_CONTROLS_ENABLED ? req.header('x-demo-session') : undefined;
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

/** Where invitation links land: the web app (first allowed origin). */
const siteUrl = (env: Env) => (env.ALLOWED_ORIGINS.split(',')[0] ?? '').trim().replace(/\/$/, '');

export function createRouter(service: ApiService, media: MediaStore, env: Env, identity: Identity): Router {
  const r = express.Router();
  const withSession = session(service, env, identity.auth);
  r.use((req, res, next) => {
    withSession(req, res, next).catch(next);
  });

  const checkMedia = (list: S.MediaInput[]) => {
    const bad = list.find((m) => !media.isOurUrl(m.url));
    if (bad) throw new ApiError(422, 'invalid_media', `${bad.caption} wasn’t uploaded through Bid ON.`, 'Upload the file again, then retry.');
    return list;
  };
  const id = (req: Request) => String(req.params.id);

  // ── Lots and bidding ──
  r.get('/lots', wrap(async (req, res) => send(res, await service.listLots(filtersFrom(req.query)))));
  r.get('/lots/:id', wrap(async (req, res) => send(res, await service.getLot(id(req), viewerOf(res)))));
  // EMD paid outside Bid ON: the buyer reports it, the lot's seller confirms or rejects it, and records refunds.
  r.post('/lots/:id/emd', requireRole('buyer'), wrap(async (req, res) => send(res, await service.submitEmd(id(req), S.PaymentBody.parse(req.body), viewerOf(res)))));
  r.post('/emds/:id/decision', requireRole('seller'), wrap(async (req, res) => send(res, await service.decideEmd(id(req), S.PaymentDecisionBody.parse(req.body), viewerOf(res)))));
  r.post('/emds/:id/refund', requireRole('seller'), wrap(async (req, res) => send(res, await service.recordEmdRefund(id(req), S.RefundBody.parse(req.body), viewerOf(res)))));
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
  r.post('/seller/lots/:id/withdraw', requireRole('seller'), wrap(async (req, res) => send(res, await service.withdrawLot(id(req), S.WithdrawBody.parse(req.body).reason, viewerOf(res)))));
  r.post('/seller/lots/:id/media', requireRole('seller'), wrap(async (req, res) => send(res, await service.addLotMedia(id(req), checkMedia(S.LotMediaBody.parse(req.body).media), viewerOf(res)))));
  r.delete('/seller/lots/:id', requireRole('seller'), wrap(async (req, res) => send(res, await service.deleteDraft(id(req), viewerOf(res)))));

  // ── Accounts ──
  /**
   * Create the buyer or seller profile for a verified sign-in. Email and auth id come from the verified token,
   * never from the form; one profile per sign-in, and the role can't be changed afterwards (no role switching).
   * Without a sign-in this is allowed only with presenter controls (sample-data demo, local data).
   */
  const register = (role: 'buyer' | 'seller') =>
    wrap(async (req, res) => {
      const user = authUserOf(res);
      if (!user && !env.DEMO_CONTROLS_ENABLED) throw new ApiError(401, 'unauthenticated', 'Create your sign-in and verify your email first.', 'Sign up, open the link we email you, then sign in.');
      if (user && !user.emailVerified) throw new ApiError(403, 'email_not_verified', 'Your email address isn’t verified yet.', 'Open the link in the email we sent you, then sign in again.');
      if (user && (await service.profileForAuthUser(user.id))) throw new ApiError(409, 'already_registered', 'This sign-in already has a Bid ON account.', 'Each sign-in holds one account. Go to your dashboard.');
      if (!user && viewerOf(res).role !== 'guest') throw new ApiError(409, 'already_registered', 'You’re signed in to an existing account.', 'Sign out first to create a new account.');
      const fromToken = user ? { email: user.email, authUserId: user.id } : {};
      const r =
        role === 'buyer'
          ? await service.registerBuyer({ ...S.BuyerRegistration.parse(req.body), ...fromToken })
          : await service.registerSeller({ ...S.SellerRegistration.parse(req.body), ...fromToken });
      if (r.ok && user) await identity.auth?.setProfile(user.id, { role, profileId: r.data.user.id });
      send(res, r);
    });
  r.post('/onboarding/buyer', register('buyer'));
  r.post('/onboarding/seller', register('seller'));
  /** The signed-in account, or null for a guest or a verified sign-in that hasn't created its profile yet. */
  r.get('/me', wrap(async (_req, res) => send(res, await service.me(viewerOf(res)))));

  // ── Eligibility: the account holder's application and documents ──
  r.get('/account', requireRole('buyer', 'seller'), wrap(async (_req, res) => send(res, await service.accountView(viewerOf(res)))));
  r.put('/account/eligibility', requireRole('buyer', 'seller'), wrap(async (req, res) => send(res, await service.saveEligibility(S.EligibilityBody.parse(req.body), viewerOf(res)))));
  r.post('/account/eligibility/submit', requireRole('buyer', 'seller'), wrap(async (_req, res) => send(res, await service.submitEligibility(viewerOf(res)))));
  r.post(
    '/account/documents',
    requireRole('buyer', 'seller'),
    express.raw({ type: () => true, limit: '11mb' }),
    wrap(async (req, res) => {
      const kind = String(req.query.kind) as (typeof S.DOCUMENT_KINDS)[number];
      if (!S.DOCUMENT_KINDS.includes(kind)) throw new ApiError(422, 'invalid_kind', 'Unknown document type.', 'Upload from your account page or the payment form.');
      const viewer = viewerOf(res);
      const me = await service.me(viewer);
      const companyId = me.ok ? me.data?.company?.id : undefined;
      if (!companyId) throw new ApiError(403, 'forbidden', 'Only a buyer or seller account can upload documents.', 'Sign in to your own account.');
      const name = String(req.query.name ?? 'document');
      const type = String(req.query.type ?? req.header('content-type') ?? '');
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const stored = await identity.documents.put({ name, type, bytes }, companyId);
      if (!stored.ok) return send(res, stored);
      send(res, await service.addDocument({ kind, fileName: name, contentType: type, size: bytes.length, path: stored.data.path }, viewer));
    }),
  );
  r.delete('/account/documents/:id', requireRole('buyer', 'seller'), wrap(async (req, res) => send(res, await service.removeDocument(id(req), viewerOf(res)))));
  /** A one-minute signed link to a private file — only for its owner, a reviewer, or the seller a receipt was sent to. */
  r.get(
    '/documents/:id/url',
    requireRole('signed_in'),
    wrap(async (req, res) => {
      const r2 = await service.documentUrl(id(req), viewerOf(res));
      if (!r2.ok) return send(res, r2);
      const path = r2.data.url;
      send(res, { ok: true, data: { url: path && !path.startsWith('data:') ? await identity.documents.signedUrl(path) : path } });
    }),
  );

  // ── Eligibility review (internal reviewers: the ops role, never offered at sign-up) ──
  r.get('/ops/eligibility', requireRole('ops'), wrap(async (_req, res) => send(res, await service.eligibilityQueue(viewerOf(res)))));
  r.get('/ops/eligibility/:id', requireRole('ops'), wrap(async (req, res) => send(res, await service.eligibilityReview(id(req), viewerOf(res)))));
  r.post('/ops/eligibility/:id/decision', requireRole('ops'), wrap(async (req, res) => send(res, await service.reviewEligibility(id(req), S.ReviewBody.parse(req.body), viewerOf(res)))));
  r.put('/ops/eligibility/:id/state', requireRole('ops'), wrap(async (req, res) => send(res, await service.setApplicationState(id(req), S.StateBody.parse(req.body).state, viewerOf(res)))));

  // ── Team: the admin appoints regional reviewers (D-102); the domain refuses anyone but the admin ──
  r.get('/ops/team', requireRole('ops'), wrap(async (_req, res) => send(res, await service.team(viewerOf(res)))));
  r.post(
    '/ops/team/reviewers',
    requireRole('ops'),
    wrap(async (req, res) => {
      const viewer = viewerOf(res);
      const body = S.AppointBody.parse(req.body);
      const input = { ...body, email: body.email.trim().toLowerCase(), authUserId: null as string | null };
      if (!identity.auth) return send(res, await service.appointReviewer(input, viewer)); // in-memory demo: no sign-in to invite
      // Check the rules before any email goes out, then invite (unless they already have a sign-in), then record.
      const check = await service.appointReviewer(input, viewer, { dryRun: true });
      if (!check.ok) return send(res, check);
      const existing = await service.authUserByEmail(input.email);
      if (existing?.confirmed) input.authUserId = existing.id;
      else {
        const invited = await identity.auth.invite(input.email, input.name.trim(), `${siteUrl(env)}/auth/invite`);
        if (!invited.ok) throw new ApiError(502, 'invite_failed', 'The invitation email couldn’t be sent.', 'Check the address and try again in a few minutes. Nothing was changed.');
        input.authUserId = invited.authUserId;
      }
      const r2 = await service.appointReviewer(input, viewer);
      if (r2.ok && input.authUserId) await identity.auth.setProfile(input.authUserId, { role: 'ops', profileId: r2.data.id });
      send(res, r2);
    }),
  );
  r.put('/ops/team/reviewers/:id/regions', requireRole('ops'), wrap(async (req, res) => send(res, await service.setReviewerRegions(id(req), S.RegionsBody.parse(req.body).regions, viewerOf(res)))));
  r.delete(
    '/ops/team/reviewers/:id',
    requireRole('ops'),
    wrap(async (req, res) => {
      const r2 = await service.removeReviewer(id(req), viewerOf(res));
      if (r2.ok && r2.data.authUserId && identity.auth) await identity.auth.clearProfile(r2.data.authUserId);
      send(res, r2);
    }),
  );

  // ── Notifications ──
  // Lets anyone test whether an email holds an account, so only for the sample-data demo; the live sign-up checks duplicates itself.
  r.get(
    '/users/exists',
    wrap(async (req, res) => {
      presenterOnly(env, 'This check isn’t available.', 'Continue with sign-up; duplicates are refused there.');
      send(res, await service.emailExists(String(req.query.email ?? '')));
    }),
  );
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
