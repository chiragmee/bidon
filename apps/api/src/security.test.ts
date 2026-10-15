/**
 * Role security (PHASES 6.2): every API route called as guest, buyer, seller and Operations.
 * Guards are the same whatever the data backend, so this runs on the in-memory service.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS } from '@auctionit/domain';
import { createApp } from './app';
import { loadEnv } from './env';
import { MemoryService } from './services/MemoryService';

type Who = 'guest' | 'buyer' | 'seller' | 'ops';
type Access = 'public' | 'signed_in' | Exclude<Who, 'guest'>;

const SESSION: Record<Who, string | null> = {
  guest: null,
  buyer: 'buyer:U-RAHUL',
  seller: 'seller:U-SURESH',
  ops: 'ops:U-DEVENDRA',
};

/** [method, path, who may call it, body]. Ids are real seed records so allowed calls reach the domain. */
const ROUTES: [string, string, Access, unknown?][] = [
  ['get', '/lots', 'public'],
  ['get', '/lots/LOT-2025-0891', 'public'],
  ['post', '/lots/LOT-2025-0891/emd', 'buyer', { outcome: 'failure' }],
  ['post', '/lots/LOT-2025-0891/bids', 'buyer', { amountPerMt: 1, clientRequestId: 'sec', seenHighestPerMt: null }],
  ['post', '/lots/LOT-2025-0910/close', 'ops', {}],
  ['get', '/buyer/dashboard', 'buyer'],
  ['get', '/transactions/TX-1042/summary', 'signed_in'],
  ['get', '/transactions/TX-1042', 'signed_in'],
  ['post', '/transactions/TX-1038/actions', 'signed_in', { action: { type: 'complete' } }],
  ['post', '/transactions/TX-1038/claims', 'buyer', { input: { type: 'contamination', observedValue: 1, mediaIds: [], expected: 'x', observed: 'x', explanation: 'x', requestedRemedy: 'price_adjustment' } }],
  ['post', '/claims/CLM-1042-01/response', 'seller', { response: { decision: 'accept', explanation: '' } }],
  ['post', '/claims/CLM-1042-01/decision', 'ops', { outcome: 'reject', reason: 'short' }],
  ['get', '/claims/CLM-1042-01', 'ops'],
  ['get', '/ops/overview', 'ops'],
  ['get', '/seller/dashboard', 'seller'],
  ['get', '/seller/lots/LOT-2025-0920', 'seller'],
  ['post', '/seller/lots', 'seller', { title: 'Security test lot' }],
  ['put', '/seller/lots/LOT-2025-0920', 'seller', { title: 'Security test lot' }],
  ['post', '/seller/lots/LOT-2025-0920/publish', 'seller', {}],
  ['delete', '/seller/lots/LOT-2025-0920', 'seller'],
  ['post', '/onboarding/buyer', 'public', {}],
  ['post', '/onboarding/seller', 'public', {}],
  ['get', '/users/exists?email=x@y.example', 'public'],
  ['get', '/notifications', 'signed_in'],
  ['post', '/notifications/read', 'signed_in', {}],
  ['post', '/media?stage=lifting&name=a.png&type=image/png', 'signed_in'],
];

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp(loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000' }), new MemoryService());
});

function call(method: string, path: string, who: Who, body?: unknown) {
  const req = (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path);
  const s = SESSION[who];
  if (s) req.set('x-demo-session', s);
  return body === undefined ? req : req.send(body as object);
}

const guardForbidden = (res: request.Response) => res.status === 403 && res.body?.error?.code === 'forbidden' && String(res.body.error.what).startsWith('This needs');

describe('route guard matrix', () => {
  for (const [method, path, access, body] of ROUTES) {
    for (const who of ['guest', 'buyer', 'seller', 'ops'] as Who[]) {
      const allowed = access === 'public' || (access === 'signed_in' ? who !== 'guest' : access === who);
      it(`${method.toUpperCase()} ${path} as ${who} → ${allowed ? 'passes the guard' : who === 'guest' ? '401' : '403'}`, async () => {
        const res = await call(method, path, who, body);
        if (allowed) {
          expect(res.status, JSON.stringify(res.body)).not.toBe(401);
          expect(guardForbidden(res)).toBe(false);
        } else if (who === 'guest') {
          expect(res.status).toBe(401);
          expect(res.body.error).toMatchObject({ code: 'unauthenticated', what: 'You need to sign in for this.' });
        } else {
          expect(guardForbidden(res), JSON.stringify(res.body)).toBe(true);
        }
      });
    }
  }
});

describe('sessions and the rules behind the guards', () => {
  it('rejects a malformed, unknown or spoofed session', async () => {
    for (const header of ['nonsense', 'buyer:U-NOBODY', 'ops:U-RAHUL']) {
      const res = await request(app).get('/notifications').set('x-demo-session', header);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('invalid_session');
    }
  });

  it('buyers never see another party’s transaction or profile', async () => {
    const tx = await call('get', '/transactions/TX-1031', 'buyer');
    expect(tx.status).toBe(200);
    expect(tx.body.data).toBeNull();
    const other = await call('get', '/users/U-ANITA', 'buyer');
    expect(other.status).toBe(403);
    expect((await call('get', '/users/U-RAHUL', 'buyer')).body.data.user.id).toBe('U-RAHUL');
  });

  it('a seller cannot change another seller’s lot', async () => {
    const res = await request(app).put('/seller/lots/LOT-2025-0920').set('x-demo-session', 'seller:U-IMRAN').send({ title: 'Not my lot at all' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('not_owner');
  });

  it('only Operations marks defaults; parties get a domain refusal', async () => {
    const res = await call('post', '/transactions/TX-1035/actions', 'seller', { action: { type: 'mark_defaulted', reason: 'Seller trying to default.' } });
    expect(res.status).toBe(403);
    expect(res.body.error.what).toMatch(/Only Operations/);
  });

  describe('presenter controls are off against a real database', () => {
    // DATA_MODE=supabase without DEMO_CONTROLS_ENABLED is the live deployment's configuration.
    const live = loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000', DATA_MODE: 'supabase', DATABASE_URL: 'postgres://unused' });
    const locked = createApp(live, new MemoryService());
    const as = (role: string, userId: string) => ({ 'x-demo-session': `${role}:${userId}` });

    it('defaults to off for supabase and on for the in-memory demo', () => {
      expect(live.DEMO_CONTROLS_ENABLED).toBe(false);
      expect(loadEnv({}).DEMO_CONTROLS_ENABLED).toBe(true);
      expect(loadEnv({ DATA_MODE: 'supabase', DATABASE_URL: 'x', DEMO_CONTROLS_ENABLED: 'true' }).DEMO_CONTROLS_ENABLED).toBe(true);
    });

    it('refuses a data reset', async () => {
      const res = await request(locked).post('/demo/reset');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('reset_disabled');
    });

    it('refuses closing an auction early, even for Operations', async () => {
      const res = await request(locked).post('/lots/LOT-2025-0891/close').set(as('ops', DEMO_ACCOUNTS.ops));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({ code: 'not_available', next: 'Auctions close automatically at their end time.' });
    });

    it('refuses a simulated failed payment but still records the EMD', async () => {
      const fail = await request(locked).post('/lots/LOT-2025-0891/emd').set(as('buyer', DEMO_ACCOUNTS.buyer)).send({ outcome: 'failure' });
      expect(fail.status).toBe(403);
      expect(fail.body.error.code).toBe('not_available');
      const ok = await request(locked).post('/lots/LOT-2025-0891/emd').set(as('buyer', DEMO_ACCOUNTS.buyer)).send({ outcome: 'success' });
      expect(ok.status).toBe(200);
    });
  });

  it('rejects bodies with the wrong shape before any rule runs', async () => {
    const res = await call('post', '/claims/CLM-1042-01/decision', 'ops', { outcome: 'pay_everyone', reason: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'invalid_request', what: expect.stringContaining('outcome') });
  });

  it('refuses media that wasn’t uploaded through the API', async () => {
    const res = await call('post', '/transactions/TX-1038/actions', 'buyer', {
      action: { type: 'pay_balance' },
      media: [{ id: 'M-x', kind: 'photo', url: 'https://evil.example/x.jpg', caption: 'x.jpg', stage: 'lifting', uploadedAt: '' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid_media');
  });
});
