import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateDocumentFile } from '@auctionit/domain';
import type { DsResult } from '@auctionit/client';
import type { Env } from '../env';

export const DOCUMENT_BUCKET = 'account-documents';

/** A Supabase Auth user, verified from their access token by Supabase itself. */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthGate {
  /** Verify an access token with Supabase Auth; null when it is invalid or expired. */
  verify(token: string): Promise<AuthUser | null>;
  /**
   * Copy the role and profile id to app_metadata (only the server can write it) so the web app's layout and route
   * guard know who is signed in from the verified JWT. The API itself always decides from the profile row.
   */
  setProfile(authUserId: string, profile: { role: 'buyer' | 'seller' | 'ops'; profileId: string }): Promise<void>;
  /** Take the role off a sign-in (a removed reviewer, D-102). */
  clearProfile(authUserId: string): Promise<void>;
  /** Email an invitation; the link opens `redirectTo` (/auth/invite) to choose a password. Returns the new sign-in's id. */
  invite(email: string, name: string, redirectTo: string): Promise<{ ok: true; authUserId: string } | { ok: false; message: string }>;
}

/** Private files: never public URLs; links are signed for one minute. */
export interface DocumentStore {
  put(file: { name: string; type: string; bytes: Buffer }, companyId: string): Promise<DsResult<{ path: string }>>;
  signedUrl(path: string): Promise<string | null>;
}

function admin(env: Env): SupabaseClient | null {
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** Tokens are re-checked with Supabase at most once a minute each (sign-out and expiry still take effect within a minute). */
export function createAuthGate(env: Env): AuthGate | null {
  const client = admin(env);
  if (!client) return null;
  const cache = new Map<string, { user: AuthUser | null; until: number }>();
  return {
    async verify(token) {
      const hit = cache.get(token);
      if (hit && hit.until > Date.now()) return hit.user;
      const { data, error } = await client.auth.getUser(token);
      const user = error || !data.user ? null : { id: data.user.id, email: (data.user.email ?? '').toLowerCase(), emailVerified: !!data.user.email_confirmed_at };
      if (cache.size > 5000) cache.clear();
      cache.set(token, { user, until: Date.now() + 60_000 });
      return user;
    },
    async setProfile(authUserId, profile) {
      const { error } = await client.auth.admin.updateUserById(authUserId, { app_metadata: { role: profile.role, profile_id: profile.profileId } });
      if (error) console.warn(`Could not copy the profile to app_metadata for ${authUserId}: ${error.message}`);
    },
    async clearProfile(authUserId) {
      const { error } = await client.auth.admin.updateUserById(authUserId, { app_metadata: { role: null, profile_id: null } });
      if (error) console.warn(`Could not clear app_metadata for ${authUserId}: ${error.message}`);
    },
    async invite(email, name, redirectTo) {
      const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo, data: { invited_as: 'reviewer', name } });
      return error || !data.user ? { ok: false, message: error?.message ?? 'no user returned' } : { ok: true, authUserId: data.user.id };
    },
  };
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createDocumentStore(env: Env): DocumentStore {
  const client = admin(env);
  return {
    async put(file, companyId) {
      const problem = validateDocumentFile({ name: file.name, type: file.type, size: file.bytes.length });
      if (problem) return { ok: false, error: { kind: 'rule', code: 'invalid_file', what: problem, next: 'Choose a different file.' } };
      // In-memory demo API without storage: keep the record, no file.
      if (!client) return { ok: true, data: { path: '' } };
      const path = `${companyId}/${newId()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await client.storage.from(DOCUMENT_BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: false });
      if (up.error) return { ok: false, error: { kind: 'network', code: 'storage_failed', what: `The upload of ${file.name} was interrupted.`, next: 'Retry the upload. Nothing else was changed.' } };
      return { ok: true, data: { path } };
    },
    async signedUrl(path) {
      if (!client || !path) return null;
      const { data, error } = await client.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 60);
      return error ? null : data.signedUrl;
    },
  };
}
