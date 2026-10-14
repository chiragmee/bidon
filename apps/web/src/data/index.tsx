'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DataSource, DsError, DsResult } from './DataSource';
import { DemoDataSource } from './DemoDataSource';
import { subscribe as subscribeStore, wasRecovered } from './demoStore';

export * from './DataSource';

interface DataCtx {
  ds: DataSource;
  /** Why we are on demo data when real mode was asked for; null when as configured. */
  fallbackReason: string | null;
}

const DataContext = createContext<DataCtx | null>(null);

function choose(): DataCtx {
  const want = process.env.NEXT_PUBLIC_DATA_SOURCE ?? 'demo';
  if (want === 'http') {
    // HttpDataSource arrives in Phase 2 (fast-track order, D-015). Never fall back silently.
    return {
      ds: new DemoDataSource(),
      fallbackReason: 'The live backend isn’t connected in this build, so you’re seeing demo data stored in this browser.',
    };
  }
  return { ds: new DemoDataSource(), fallbackReason: null };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [value] = useState(choose);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataCtx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

export function useDataRecovered(): boolean {
  return useSyncExternalStore(subscribeStore, wasRecovered, () => false);
}

export interface QueryState<T> {
  data: T | undefined;
  error: DsError | null;
  loading: boolean;
  /** Re-run; keeps showing current data while refreshing. */
  reload: () => void;
}

/**
 * Minimal query hook: runs `fn`, re-runs when `key` changes, when data changes in any tab, and
 * every `pollMs` (lot pages refresh the current bid every 5s — PHASES 3.5).
 */
export function useQuery<T>(key: string, fn: (ds: DataSource) => Promise<DsResult<T>>, opts: { pollMs?: number; enabled?: boolean; keepPrevious?: boolean } = {}): QueryState<T> {
  const { ds } = useData();
  const { pollMs, enabled = true, keepPrevious = false } = opts;
  const [state, setState] = useState<{ key: string; data: T | undefined; error: DsError | null; loading: boolean }>({ key, data: undefined, error: null, loading: enabled });
  // A new key starts from a clean slate (reset during render, not in an effect).
  // keepPrevious shows the old results (dimmed) while a new filter loads instead of flashing skeletons.
  if (state.key !== key) setState({ key, data: keepPrevious ? state.data : undefined, error: null, loading: enabled });

  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const seq = useRef(0);

  const run = useCallback(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    fnRef.current(ds).then((r) => {
      if (mine !== seq.current) return; // a newer request superseded this one
      setState((s) => (r.ok ? { ...s, data: r.data, error: null, loading: false } : { ...s, error: r.error, loading: false }));
    });
  }, [ds, enabled]);

  useEffect(() => {
    run();
  }, [key, run]);

  useEffect(() => ds.subscribe(run), [ds, run]);

  useEffect(() => {
    if (!pollMs || !enabled) return;
    const id = setInterval(run, pollMs);
    return () => clearInterval(id);
  }, [pollMs, run, enabled]);

  return { data: state.data, error: state.error, loading: state.loading, reload: run };
}
