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
import type { AuthGate, AuthUser, DocumentStore } from './services/supabase';

/** Stand-in for Supabase Auth: known tokens map to users; records role copies. */
function fakeAuth(users: Record<string, AuthUser>, roles: Record<string, string> = {}): AuthGate {
  return {
    verify: async (token) => users[token] ?? null,
    setProfile: async (id, p) => {
      roles[id] = `${p.role}:${p.profileId}`;
    },
    clearProfile: async (id) => {
      roles[id] = 'cleared';
    },
    invite: async (email) => {
      const id = `invited-${email}`;
      users[`tok-${email}`] = { id, email, emailVerified: true };
      return { ok: true, authUserId: id };
    },
  };
}
const noDocs: DocumentStore = { put: async () => ({ ok: true, data: { path: '' } }), signedUrl: async () => null };

type Who = 'guest' | 'buyer' | 'seller' | 'ops';
/** `account` = a buyer or seller account holder (their own eligibility application and documents). */
type Access = 'public' | 'signed_in' | 'account' | Exclude<Who, 'guest'>;

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
  ['post', '/lots/LOT-2025-0891/emd', 'buyer', { amount: 1, method: 'neft', paidOn: '2026-01-01', reference: 'UTR1', payerName: 'x', receiptDocumentId: null }],
  ['post', '/emds/EMD-NOPE/decision', 'seller', { decision: 'confirmed', reason: '' }],
  ['post', '/emds/EMD-NOPE/refund', 'seller', { amount: 1, refundedOn: '2026-01-01', reference: 'UTR1', note: '' }],
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
  ['get', '/me', 'public'],
  ['get', '/account', 'account'],
  ['put', '/account/eligibility', 'account', { entityType: null, legalName: '', pan: '', gstin: '', registrationNumber: '', registeredAddress: '', representative: { name: '', designation: '' }, sellerDeclaration: null, bankDetails: null }],
  ['post', '/account/eligibility/submit', 'account', {}],
  ['post', '/account/documents?kind=pan_card&name=pan.pdf&type=application/pdf', 'account'],
  ['delete', '/account/documents/DOC-NOPE', 'account'],
  ['get', '/documents/DOC-NOPE/url', 'signed_in'],
  ['get', '/ops/eligibility', 'ops'],
  ['get', '/ops/eligibility/C-VARDHAN', 'ops'],
  ['post', '/ops/eligibility/C-VARDHAN/decision', 'ops', { decision: 'approved', reason: '' }],
  ['put', '/ops/eligibility/C-VARDHAN/state', 'ops', { state: 'MH' }],
  ['get', '/ops/team', 'ops'],
  ['post', '/ops/team/reviewers', 'ops', { name: 'Sec Test', email: 'sec@auctionit.example', regions: ['west'] }],
  ['put', '/ops/team/reviewers/U-NOPE/regions', 'ops', { regions: ['west'] }],
  ['delete', '/ops/team/reviewers/U-NOPE', 'ops'],
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
      const allowed = access === 'public' || (access === 'signed_in' ? who !== 'guest' : access === 'account' ? who === 'buyer' || who === 'seller' : access === who);
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
    // The live deployment: a remote database. Even DEMO_CONTROLS_ENABLED=true set by mistake can't switch them on.
    const live = loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000', DATA_MODE: 'supabase', DATABASE_URL: 'postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:5432/postgres', DEMO_CONTROLS_ENABLED: 'true' });
    const locked = createApp(live, new MemoryService());
    const as = (role: string, userId: string) => ({ 'x-demo-session': `${role}:${userId}` });

    it('only a local database can have presenter controls or show sample data', () => {
      expect(live).toMatchObject({ DEMO_CONTROLS_ENABLED: false, SAMPLE_DATA_VISIBLE: false, LOCAL_DATA: false });
      expect(loadEnv({})).toMatchObject({ DEMO_CONTROLS_ENABLED: true, SAMPLE_DATA_VISIBLE: true });
      expect(loadEnv({ DATA_MODE: 'supabase', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })).toMatchObject({ DEMO_CONTROLS_ENABLED: false, SAMPLE_DATA_VISIBLE: true });
      expect(loadEnv({ DATA_MODE: 'supabase', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', DEMO_CONTROLS_ENABLED: 'true', SAMPLE_DATA_VISIBLE: 'false' })).toMatchObject({ DEMO_CONTROLS_ENABLED: true, SAMPLE_DATA_VISIBLE: false });
    });

    it('ignores the sample-account header: nobody can act as another account', async () => {
      const res = await request(locked).get('/notifications').set(as('ops', DEMO_ACCOUNTS.ops));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('refuses sign-up without a verified sign-in, and the email-exists probe', async () => {
      expect((await request(locked).post('/onboarding/buyer').send({})).body.error.code).toBe('unauthenticated');
      expect((await request(locked).get('/users/exists?email=rahul.sharma@vardhan.example')).body.error.code).toBe('not_available');
    });

    it('refuses a data reset', async () => {
      const res = await request(locked).post('/demo/reset');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('reset_disabled');
    });

    it('refuses closing an auction early', async () => {
      // Signed in as Operations through a verified sign-in (fake gate), still refused.
      const ops = createApp(live, new MemoryService(), undefined, { auth: fakeAuth({ 'tok-ops': { id: 'auth-ops', email: 'ops@auctionit.example', emailVerified: true } }), documents: noDocs });
      const res = await request(ops).post('/lots/LOT-2025-0891/close').set('authorization', 'Bearer tok-ops');
      expect(res.status).toBe(401); // no profile linked to this sign-in → guest
      const viaHeader = await request(locked).post('/lots/LOT-2025-0891/close').set(as('ops', DEMO_ACCOUNTS.ops));
      expect(viaHeader.status).toBe(401);
    });
  });

  it('rejects bodies with the wrong shape before any rule runs', async () => {
    const res = await call('post', '/claims/CLM-1042-01/decision', 'ops', { outcome: 'pay_everyone', reason: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'invalid_request', what: expect.stringContaining('outcome') });
  });

  it('refuses media that wasn’t uploaded through the API', async () => {
    const res = await call('post', '/transactions/TX-1038/actions', 'buyer', {
      action: { type: 'confirm_lifting' },
      media: [{ id: 'M-x', kind: 'photo', url: 'https://evil.example/x.jpg', caption: 'x.jpg', stage: 'lifting', uploadedAt: '' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid_media');
  });
});

describe('sign-in (Supabase Auth) and account creation', () => {
  const live = loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000', DATA_MODE: 'supabase', DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres' });
  const users: Record<string, AuthUser> = {
    'tok-asha': { id: 'auth-asha', email: 'asha@newco.example', emailVerified: true },
    'tok-new': { id: 'auth-new', email: 'new@unverified.example', emailVerified: false },
  };
  const roles: Record<string, string> = {};
  let live1: ReturnType<typeof createApp>;
  beforeEach(() => {
    live1 = createApp(live, new MemoryService(), undefined, { auth: fakeAuth(users, roles), documents: noDocs });
  });
  const buyerForm = { name: 'Asha Menon', email: 'attacker-chosen@x.example', phone: '98765 43210', companyName: 'NewCo Metals', businessType: 'Scrap trader / stockist', city: 'Nagpur', state: 'Maharashtra', industry: 'Steel', materials: ['Ferrous / HMS'] };

  it('an invalid or expired token is refused; a valid one without a profile is a guest', async () => {
    expect((await request(live1).get('/me').set('authorization', 'Bearer forged')).body.error.code).toBe('invalid_session');
    expect((await request(live1).get('/me').set('authorization', 'Bearer tok-asha')).body.data).toBeNull();
    expect((await request(live1).get('/buyer/dashboard').set('authorization', 'Bearer tok-asha')).status).toBe(401);
  });

  it('an unverified email cannot create an account', async () => {
    const res = await request(live1).post('/onboarding/buyer').set('authorization', 'Bearer tok-new').send(buyerForm);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('email_not_verified');
  });

  it('creates one profile per sign-in, with the verified email; the role is fixed and copied to app_metadata', async () => {
    const res = await request(live1).post('/onboarding/buyer').set('authorization', 'Bearer tok-asha').send(buyerForm);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'asha@newco.example', role: 'buyer', authUserId: 'auth-asha' });
    expect(res.body.data.company).toMatchObject({ verification: 'incomplete', sample: false });
    expect(roles['auth-asha']).toBe(`buyer:${res.body.data.user.id}`);
    const me = await request(live1).get('/me').set('authorization', 'Bearer tok-asha');
    expect(me.body.data.user).toMatchObject({ role: 'buyer', email: 'asha@newco.example' });
    // No second account and no role switch for the same sign-in.
    for (const path of ['/onboarding/buyer', '/onboarding/seller']) {
      const again = await request(live1).post(path).set('authorization', 'Bearer tok-asha').send({ ...buyerForm, yard: 'Y', categories: ['ferrous_hms'] });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('already_registered');
    }
    // Acting as the account works only through the token; it can't reach other roles' routes.
    expect((await request(live1).get('/account').set('authorization', 'Bearer tok-asha')).body.data).toMatchObject({ status: 'incomplete' });
    expect((await request(live1).get('/ops/eligibility').set('authorization', 'Bearer tok-asha')).status).toBe(403);
    expect((await request(live1).post('/lots/LOT-2025-0891/emd').set('authorization', 'Bearer tok-asha').send({ amount: 100000, method: 'neft', paidOn: '2026-01-01', reference: 'UTR123', payerName: 'Asha', receiptDocumentId: null })).body.error.code).toBe('not_eligible');
  });
});

describe('team: the admin appoints and removes regional reviewers (D-102)', () => {
  const live = loadEnv({ ALLOWED_ORIGINS: 'https://auctionit.example', DATA_MODE: 'supabase', DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres' });
  it('only the admin appoints; the invitee gets the ops role; removal takes Operations access away', async () => {
    const users: Record<string, AuthUser> = { 'tok-admin': { id: 'auth-admin', email: 'devendra.nath@auctionit.example', emailVerified: true } };
    const roles: Record<string, string> = {};
    const svc = new MemoryService();
    // The sample admin signs in through Supabase in this test.
    (svc as unknown as { mem: { mutate(fn: (s: { users: { id: string; authUserId?: string | null }[] }) => void): void } }).mem.mutate((st) => {
      st.users.find((u) => u.id === 'U-DEVENDRA')!.authUserId = 'auth-admin';
    });
    const app2 = createApp(live, svc, undefined, { auth: fakeAuth(users, roles), documents: noDocs });
    const as = (tok: string) => ({ authorization: `Bearer ${tok}` });

    const res = await request(app2).post('/ops/team/reviewers').set(as('tok-admin')).send({ name: 'Wasim West', email: 'West@AuctionIT.example', regions: ['west'] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const id = res.body.data.id as string;
    expect(res.body.data).toMatchObject({ role: 'ops', staffLevel: 'reviewer', regions: ['west'], email: 'west@auctionit.example', authUserId: 'invited-west@auctionit.example' });
    expect(roles['invited-west@auctionit.example']).toBe(`ops:${id}`);

    // The reviewer is Operations but not the admin.
    const reviewer = as('tok-west@auctionit.example');
    expect((await request(app2).get('/ops/eligibility').set(reviewer)).status).toBe(200);
    const byReviewer = await request(app2).post('/ops/team/reviewers').set(reviewer).send({ name: 'X', email: 'x@auctionit.example', regions: ['north'] });
    expect([byReviewer.status, byReviewer.body.error.code]).toEqual([403, 'forbidden']);
    expect((await request(app2).get('/ops/team').set(reviewer)).body.data).toBeNull();
    expect((await request(app2).get('/ops/team').set(as('tok-admin'))).body.data.members.map((m: { name: string }) => m.name)).toContain('Wasim West');

    // A buyer's email can't be appointed, and no invitation goes out for it.
    const buyerEmail = await request(app2).post('/ops/team/reviewers').set(as('tok-admin')).send({ name: 'Rahul', email: 'rahul.sharma@vardhan.example', regions: ['west'] });
    expect([buyerEmail.status, buyerEmail.body.error.code]).toEqual([409, 'duplicate_account']);
    expect(users['tok-rahul.sharma@vardhan.example']).toBeUndefined();

    const removed = await request(app2).delete(`/ops/team/reviewers/${id}`).set(as('tok-admin'));
    expect(removed.status).toBe(200);
    expect(roles['invited-west@auctionit.example']).toBe('cleared');
    // Their sign-in still works, but it no longer reaches Operations.
    expect((await request(app2).get('/ops/eligibility').set(reviewer)).status).toBe(401);
  });
});

