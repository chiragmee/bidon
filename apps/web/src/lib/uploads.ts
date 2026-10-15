import { kindOf } from '@auctionit/domain';

export { ACCEPT, kindOf, UPLOAD_RULES, validateUpload } from '@auctionit/domain';

/**
 * Demo storage: photos are shrunk to a small JPEG data URL so evidence survives reloads in
 * localStorage; videos and PDFs keep only their name (no preview). Supabase Storage in Phase 2.
 */
export async function previewUrl(file: File): Promise<string> {
  if (kindOf(file.type) !== 'photo') return '';
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
}
