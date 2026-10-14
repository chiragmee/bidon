import { createSeed, SEED_VERSION, type DemoState } from '@auctionit/domain';

/** Versioned so a seed change never loads an incompatible saved state. */
export const STORE_KEY = `auctionit:demo:v${SEED_VERSION}`;
const CHANNEL = 'auctionit:demo-changed';

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: DemoState | null = null;
/** Set when saved data was missing or unreadable and the seed was restored. */
let recoveredFlag = false;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isState(x: unknown): x is DemoState {
  const s = x as DemoState;
  return !!s && s.version === SEED_VERSION && Array.isArray(s.lots) && Array.isArray(s.bids) && typeof s.counters === 'object';
}

export function loadState(): DemoState {
  if (cache) return cache;
  const ls = storage();
  const raw = ls?.getItem(STORE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) return (cache = parsed);
    } catch {
      /* fall through to reseed */
    }
    recoveredFlag = true;
  }
  cache = createSeed(new Date().toISOString());
  // Notify when recovering so the "data was restored" banner appears.
  saveState(cache, recoveredFlag);
  return cache;
}

export function saveState(state: DemoState, notify = true) {
  cache = state;
  try {
    storage()?.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep in memory for this tab */
  }
  if (notify) emit();
}

export function resetState(): DemoState {
  recoveredFlag = false;
  const fresh = createSeed(new Date().toISOString());
  saveState(fresh);
  return fresh;
}

/** True if the saved demo data was unreadable and had to be restored from the seed (until reset). */
export function wasRecovered(): boolean {
  return recoveredFlag;
}

function emit() {
  for (const l of listeners) l();
  try {
    window.dispatchEvent(new Event(CHANNEL));
  } catch {
    /* no window */
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Other tabs: localStorage "storage" events keep a buyer tab and an Ops tab in sync during a demo.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORE_KEY) {
      cache = null;
      listener();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
