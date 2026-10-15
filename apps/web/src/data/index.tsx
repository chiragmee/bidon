'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { HttpDataSource, type DataSource, type DsError, type DsResult } from '@auctionit/client';
import { DEMO_CONTROLS } from '@/lib/flags';
import { SESSION_COOKIE } from '@/lib/session';
import { DemoDataSource } from './DemoDataSource';
import { subscribe as subscribeStore, wasRecovered } from './demoStore';

export * from './DataSource';

interface DataCtx {
  ds: DataSource;
  /** Why we are on browser data when real mode was asked for (presenter controls only); null when as configured. */
  fallbackReason: string | null;
  /** The API didn't answer its health check; pages keep calling it and show their own error states. */
  apiDown: boolean;
  /** Re-check the live backend; switches back to it if it answers (banner's retry). */
  retryLive: (() => Promise<boolean>) | null;
}

/** Fired when any call says the session is gone, so the app can offer to sign back in in place. */
export const SESSION_LOST_EVENT = 'auctionit:session-lost';
const SESSION_CODES = new Set(['invalid_session', 'unauthenticated']);

/** Wrap every DataSource method to report lost sessions; results pass through unchanged. */
function watchSessions(ds: DataSource): DataSource {
  return new Proxy(ds, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function' || prop === 'subscribe') return v;
      return (...args: unknown[]) => {
        const out = (v as (...a: unknown[]) => unknown).apply(target, args);
        if (out instanceof Promise) {
          void out.then((r: DsResult<unknown>) => {
            if (r && !r.ok && SESSION_CODES.has(r.error.code)) window.dispatchEvent(new CustomEvent(SESSION_LOST_EVENT, { detail: r.error }));
          });
        }
        return out;
      };
    },
  });
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
 * unreachable the live site says so and offers a retry — it never shows browser sample data in
 * place of the marketplace. Only with presenter controls (local) does it fall back to browser data,
 * with a visible banner.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'live' | 'demo' | 'fallback' | 'down'>(WANT_HTTP ? 'live' : 'demo');
  const [http] = useState(() => (WANT_HTTP ? new HttpDataSource({ baseUrl: API_URL, session: sessionFromCookie }) : null));
  const [live] = useState(() => (http ? watchSessions(http) : null));
  // Browser data only exists where it can be used: demo mode, or the presenter fallback.
  const [demo] = useState(() => (!WANT_HTTP || DEMO_CONTROLS ? watchSessions(new DemoDataSource()) : null));

  useEffect(() => {
    if (!http) return;
    let cancelled = false;
    void http.health().then((up) => {
      if (!up && !cancelled) setMode(DEMO_CONTROLS ? 'fallback' : 'down');
    });
    return () => {
      cancelled = true;
    };
  }, [http]);

  const value = useMemo<DataCtx>(() => {
    const retryLive = http
      ? async () => {
          const up = await http.health();
          if (up) setMode('live');
          return up;
        }
      : null;
    if (live && (mode === 'live' || mode === 'down')) return { ds: live, fallbackReason: null, apiDown: mode === 'down', retryLive: mode === 'down' ? retryLive : null };
    /* v8 ignore next */
    if (!demo) throw new Error('No data source configured');
    if (mode === 'fallback')
      return {
        ds: demo,
        fallbackReason: 'The live backend isn’t reachable right now, so you’re seeing sample data stored in this browser. Changes here won’t reach the server.',
        apiDown: false,
        retryLive,
      };
    return { ds: demo, fallbackReason: null, apiDown: false, retryLive: null };
  }, [mode, live, demo, http]);
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
