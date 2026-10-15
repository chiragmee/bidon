import { createSeed, type DemoState } from '@auctionit/domain';

/** Where a LocalDataSource keeps its state: localStorage in the browser, memory in tests. */
export interface StateStore {
  load(): DemoState;
  save(state: DemoState): void;
  /** Restore the seed with fresh relative times. */
  reset(): DemoState;
  subscribe(listener: () => void): () => void;
}

export function createMemoryStore(seedAt: () => string = () => new Date().toISOString()): StateStore & { mutate(fn: (s: DemoState) => void): void } {
  let state = createSeed(seedAt());
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    load: () => state,
    save: (s) => {
      state = s;
      emit();
    },
    reset: () => {
      state = createSeed(seedAt());
      emit();
      return state;
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Test back door: change state directly (e.g. move an auction's end time into the past). */
    mutate: (fn) => {
      const next = JSON.parse(JSON.stringify(state)) as DemoState;
      fn(next);
      state = next;
    },
  };
}
