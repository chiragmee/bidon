import { expect, it } from 'vitest';
import { buildManifest } from './demoImages';

it('lists only media files, sorted, as public paths', () => {
  const out = buildManifest(['hms-2.jpg', 'README.md', 'hms-1.JPG', '.gitkeep', 'walk.mp4']);
  expect(out).toContain('["/demo-images/hms-1.JPG","/demo-images/hms-2.jpg","/demo-images/walk.mp4"]');
});
