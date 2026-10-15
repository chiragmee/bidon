import type { LotMedia } from './types';

/** Accepted evidence files (SPEC §13, §16): photos, video and PDF documents. */
export const UPLOAD_RULES: Record<LotMedia['kind'], { types: string[]; label: string; maxBytes: number }> = {
  photo: { types: ['image/jpeg', 'image/png', 'image/webp'], label: 'JPG, PNG or WebP', maxBytes: 15 * 1024 * 1024 },
  video: { types: ['video/mp4', 'video/quicktime', 'video/webm'], label: 'MP4, MOV or WebM', maxBytes: 50 * 1024 * 1024 },
  document: { types: ['application/pdf'], label: 'PDF', maxBytes: 15 * 1024 * 1024 },
};

export const ACCEPT = Object.values(UPLOAD_RULES).flatMap((r) => r.types).join(',');

export function kindOf(type: string): LotMedia['kind'] | null {
  for (const [kind, r] of Object.entries(UPLOAD_RULES)) if (r.types.includes(type)) return kind as LotMedia['kind'];
  return null;
}

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** What's wrong with this file, in words that say how to fix it — or null if it's fine. */
export function validateUpload(file: { name: string; type: string; size: number }, allowed: LotMedia['kind'][] = ['photo', 'video', 'document']): string | null {
  const kind = kindOf(file.type);
  if (!kind || !allowed.includes(kind)) {
    const ok = allowed.map((k) => UPLOAD_RULES[k].label).join(', ');
    return `${file.name} isn't a supported file type. Use ${ok}.`;
  }
  if (file.size === 0) return `${file.name} is empty. Choose the file again.`;
  const max = UPLOAD_RULES[kind].maxBytes;
  if (file.size > max) return `${file.name} is ${mb(file.size)}, over the ${mb(max)} limit for ${kind}s. Compress it or choose a smaller file.`;
  return null;
}

