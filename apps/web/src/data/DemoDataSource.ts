import { LocalDataSource, type StateStore } from '@auctionit/client';
import { keepDocument, previewUrl } from '@/lib/uploads';
import { loadState, resetState, saveState, subscribe } from './demoStore';

/**
 * sessionStorage key: operation name (or "*") that fails with a simulated network error until the
 * key is removed — lets tests and presenters show error and retry states.
 */
export const FAIL_KEY = 'auctionit:fail-next';

const browserStore: StateStore = { load: loadState, save: saveState, reset: resetState, subscribe };

function shouldFail(op: string): boolean {
  try {
    const want = window.sessionStorage.getItem(FAIL_KEY);
    return !!want && (want === op || want === '*');
  } catch {
    return false;
  }
}

/** Demo mode: packages/domain running in the browser over localStorage (shared across tabs). */
export class DemoDataSource extends LocalDataSource {
  constructor() {
    super(browserStore, { latencyMs: [150, 400], shouldFail, preview: previewUrl, keepDocument });
  }
}
