'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { HttpDataSource, type DataSource, type DsError, type DsResult } from '@auctionit/client';
import { SESSION_COOKIE } from '@/lib/session';
import { DemoDataSource } from './DemoDataSource';
import { subscribe as subscribeStore, wasRecovered } from './demoStore';

export * from './DataSource';

interface DataCtx {
  ds: DataSource;
  /** Why we are on demo data when real mode was asked for; null when as configured. */
  fallbackReason: string | null;
}

const DataContext = createContext<DataCtx | null>(null);

function sessionFromCookie(): string | null {
  const m = typeof document === 'undefined' ? null : document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

const WANT_HTTP = process.env.NEXT_PUBLIC_DATA_SOURCE === 'http';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * NEXT_PUBLIC_DATA_SOURCE=http uses the API; demo (default) runs in the browser. If the API is
 * unreachable we fall back to demo data with a visible banner — never silently (CLAUDE.md).
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<DataCtx>(() =>
    WANT_HTTP ? { ds: new HttpDataSource({ baseUrl: API_URL, session: sessionFromCookie }), fallbackReason: null } : { ds: new DemoDataSource(), fallbackReason: null },
  );
  useEffect(() => {
    if (!(value.ds instanceof HttpDataSource)) return;
    let cancelled = false;
    void value.ds.health().then((up) => {
      if (!up && !cancelled) {
        setValue({
          ds: new DemoDataSource(),
          fallbackReason: 'The live backend isn’t reachable right now, so you’re seeing demo data stored in this browser. Changes here won’t reach the server.',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value.ds]);
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
