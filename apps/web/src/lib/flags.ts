/**
 * Presenter-only controls: Demo Mode pill, one-click sample-account entry on the landing page,
 * "Reset data", closing an auction early, a simulated failed EMD, the browser-data fallback and
 * /dev/components. On for browser demo mode; off for the live API unless
 * NEXT_PUBLIC_DEMO_CONTROLS=true (local e2e:http). The API enforces its own DEMO_CONTROLS_ENABLED.
 */
export const DEMO_CONTROLS =
  process.env.NEXT_PUBLIC_DEMO_CONTROLS !== undefined
    ? process.env.NEXT_PUBLIC_DEMO_CONTROLS === 'true'
    : process.env.NEXT_PUBLIC_DATA_SOURCE !== 'http';

/**
 * Real sign-in (Supabase Auth) — the live site: the API over http and no presenter controls. Sample accounts and
 * the role switcher exist only with presenter controls (docs/PHASE1_MVP.md).
 */
export const AUTH_ENABLED = !DEMO_CONTROLS && process.env.NEXT_PUBLIC_DATA_SOURCE === 'http';
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/** Sign-in needs the project URL and public (anon) key; without them the live site can't sign anyone in. */
export const AUTH_CONFIGURED = AUTH_ENABLED && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
