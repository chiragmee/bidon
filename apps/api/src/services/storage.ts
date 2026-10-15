import { createClient } from '@supabase/supabase-js';
import { kindOf, validateUpload, type LotMedia } from '@auctionit/domain';
import type { DsResult } from '@auctionit/client';
import type { Env } from '../env';

export const BUCKET = 'lot-media';

export interface MediaStore {
  put(file: { name: string; type: string; bytes: Buffer }, stage: LotMedia['stage']): Promise<DsResult<LotMedia>>;
  /** URLs we accept back on media objects (our bucket, demo images, or none). */
  isOurUrl(url: string): boolean;
}

const newId = () => `M-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Evidence files go to the Supabase Storage bucket with the service-role key (server only). */
export function createMediaStore(env: Env): MediaStore {
  const client = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
  const publicBase = env.SUPABASE_URL ? `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/` : null;

  return {
    isOurUrl: (url) => url === '' || url.startsWith('/demo-images/') || (!!publicBase && url.startsWith(publicBase)),
    async put(file, stage) {
      const problem = validateUpload({ name: file.name, type: file.type, size: file.bytes.length });
      if (problem) return { ok: false, error: { kind: 'rule', code: 'invalid_file', what: problem, next: 'Choose a different file.' } };
      const id = newId();
      const kind = kindOf(file.type) ?? 'document';
      if (!client) {
        // Demo API without storage: keep the record, no stored file (as browser demo mode does for video/PDF).
        return { ok: true, data: { id, kind, url: '', caption: file.name, stage, uploadedAt: new Date().toISOString() } };
      }
      const path = `${stage}/${new Date().toISOString().slice(0, 10)}/${id}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await client.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: false });
      if (up.error) {
        return { ok: false, error: { kind: 'network', code: 'storage_failed', what: `The upload of ${file.name} was interrupted.`, next: 'Retry the upload. Nothing else was changed.' } };
      }
      const url = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      return { ok: true, data: { id, kind, url, caption: file.name, stage, uploadedAt: new Date().toISOString() } };
    },
  };
}
