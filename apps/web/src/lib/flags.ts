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
