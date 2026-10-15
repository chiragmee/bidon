/**
 * The live configuration against Postgres (local `supabase start`): sample data hidden from every view but never
 * deleted, sign-in via verified tokens only, and the database's unique indexes backing the domain's duplicate checks.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createSql, type Sql } from './db/client';
import { reseed } from './db/repo';
import { loadEnv } from './env';
import { DbService } from './services/DbService';
import type { AuthGate, AuthUser, DocumentStore } from './services/supabase';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function dbAvailable(): Promise<boolean> {
  const sql = createSql(DB_URL, 1);
  try {
    await sql`select 1 from account_documents limit 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
const hasDb = await dbAvailable();
if (!hasDb) console.warn(`[live] Postgres with the Phase 1 migrations not reachable at ${DB_URL} — skipped.`);

const users: Record<string, AuthUser> = {
  'tok-asha': { id: '00000000-0000-4000-8000-00000000a5a1', email: 'asha@newco.example', emailVerified: true },
};
const auth: AuthGate = { verify: async (t) => users[t] ?? null, setProfile: async () => {} };
const documents: DocumentStore = { put: async () => ({ ok: true, data: { path: '' } }), signedUrl: async () => null };

describe.skipIf(!hasDb)('live configuration on Postgres', () => {
  let sql: Sql;
  let app: ReturnType<typeof createApp>;
  const env = loadEnv({ ALLOWED_ORIGINS: 'http://localhost:3000', DATA_MODE: 'supabase', DATABASE_URL: DB_URL, SAMPLE_DATA_VISIBLE: 'false' });
  const bearer = { authorization: 'Bearer tok-asha' };

  beforeAll(async () => {
    sql = createSql(DB_URL, 5);
    await reseed(sql);
    // profiles.auth_user_id references auth.users: create the auth user the fake token stands for.
    await sql`insert into auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at, instance_id)
              values (${users['tok-asha']!.id}, 'asha@newco.example', 'authenticated', 'authenticated', now(), now(), now(), '00000000-0000-0000-0000-000000000000')
              on conflict (id) do nothing`;
    app = createApp(env, new DbService(sql, { hideSamples: !env.SAMPLE_DATA_VISIBLE }), undefined, { auth, documents });
  });
  afterAll(async () => {
    await reseed(sql);
    await sql`delete from auth.users where id = ${users['tok-asha']!.id}`;
    await sql.end({ timeout: 2 });
  });

  it('the marketplace shows no sample lots, and the sample-account header is ignored', async () => {
    expect(env).toMatchObject({ DEMO_CONTROLS_ENABLED: false, SAMPLE_DATA_VISIBLE: false });
    expect((await request(app).get('/lots')).body.data.items).toEqual([]);
    expect((await request(app).get('/lots/LOT-2025-0891')).body.data).toBeNull();
    expect((await request(app).get('/notifications').set('x-demo-session', 'ops:U-DEVENDRA')).status).toBe(401);
    expect((await request(app).post('/demo/reset')).status).toBe(403);
  });

  it('a real account is created through a verified sign-in, and hidden sample rows are left untouched', async () => {
    const count = async () => (await sql`select (select count(*) from companies where sample) as c, (select count(*) from lots) as l, (select count(*) from bids) as b`)[0];
    const before = await count();
    const res = await request(app)
      .post('/onboarding/buyer')
      .set(bearer)
      .send({ name: 'Asha Menon', email: 'ignored@x.example', phone: '98765 43210', companyName: 'NewCo Metals', businessType: 'Scrap trader / stockist', city: 'Nagpur', state: 'Maharashtra', industry: 'Steel', materials: ['Ferrous / HMS'] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'asha@newco.example', authUserId: users['tok-asha']!.id });
    expect(await count()).toEqual(before);
    const [row] = await sql`select role, auth_user_id, phone from profiles where id = ${res.body.data.user.id}`;
    expect(row).toMatchObject({ role: 'buyer', auth_user_id: users['tok-asha']!.id, phone: '+919876543210' });
    expect((await request(app).get('/me').set(bearer)).body.data.user.id).toBe(res.body.data.user.id);
  });

  it('the database refuses a PAN another (even hidden) business holds — the domain check’s backstop', async () => {
    // A hidden sample company under review with the PAN: the filtered view can't see it, the unique index can.
    await sql`update companies set verification = 'pending_review', eligibility = ${sql.json({ pan: 'AABCN1234F', gstin: '' })} where id = 'C-KAVERI'`;
    const app2 = request(app);
    await app2
      .put('/account/eligibility')
      .set(bearer)
      .send({ entityType: 'private_limited', legalName: 'NewCo Metals Private Limited', pan: 'AABCN1234F', gstin: '', registrationNumber: 'U27100MH2010PTC123456', registeredAddress: 'Plot 4, MIDC Hingna, Nagpur 440016', representative: { name: 'Asha', designation: 'Director' }, sellerDeclaration: null, bankDetails: null })
      .expect(200);
    for (const kind of ['pan_card', 'constitution', 'address_proof', 'representative_id', 'authorisation_letter']) {
      await app2.post(`/account/documents?kind=${kind}&name=${kind}.pdf&type=application/pdf`).set(bearer).set('content-type', 'application/octet-stream').send(Buffer.from('%PDF-1.4 test')).expect(200);
    }
    const res = await app2.post('/account/eligibility/submit').set(bearer).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'duplicate_identity', what: 'These business details are already registered with AuctionIT.' });
    expect(JSON.stringify(res.body)).not.toMatch(/Kaveri/);
  });
});
