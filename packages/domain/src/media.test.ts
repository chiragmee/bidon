import { describe, expect, it } from 'vitest';
import { kindOf, validateUpload } from './media';

describe('evidence uploads', () => {
  it('accepts photos, video and PDF within limits', () => {
    expect(validateUpload({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateUpload({ name: 'a.mp4', type: 'video/mp4', size: 40 * 1024 * 1024 })).toBeNull();
    expect(kindOf('application/pdf')).toBe('document');
  });
  it('explains unsupported type, empty and oversize files', () => {
    expect(validateUpload({ name: 'a.gif', type: 'image/gif', size: 1 })).toMatch(/isn't a supported file type. Use JPG, PNG or WebP, MP4/);
    expect(validateUpload({ name: 'a.png', type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(validateUpload({ name: 'big.jpg', type: 'image/jpeg', size: 20 * 1024 * 1024 })).toBe('big.jpg is 20 MB, over the 15 MB limit for photos. Compress it or choose a smaller file.');
  });
  it('can restrict to photos only', () => {
    expect(validateUpload({ name: 'a.pdf', type: 'application/pdf', size: 1 }, ['photo'])).toMatch(/Use JPG, PNG or WebP\./);
  });
});
