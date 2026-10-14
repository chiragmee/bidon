/**
 * Display formatting. One helper for every money figure (CLAUDE.md UI rules):
 * ₹ with Indian grouping, "/MT" on rates, "~" on estimates.
 */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const mt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export interface InrOptions {
  /** Append "/MT" — use for per-tonne rates. */
  perMt?: boolean;
  /** Prefix "~" — use for estimates. */
  estimate?: boolean;
  /** Show a leading sign for adjustments: +₹… / −₹… */
  signed?: boolean;
}

export function formatINR(amount: number, opts: InrOptions = {}): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '−' : opts.signed && rounded > 0 ? '+' : '';
  const body = `₹${inr.format(Math.abs(rounded))}`;
  return `${opts.estimate ? '~' : ''}${sign}${body}${opts.perMt ? '/MT' : ''}`;
}

/** Quantity in metric tonnes: "38.6 MT", or "~40 MT" for estimates. */
export function formatMt(qty: number, opts: { estimate?: boolean } = {}): string {
  return `${opts.estimate ? '~' : ''}${mt.format(qty)} MT`;
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/**
 * Countdown label per DESIGN.md: "Closes in 3h 42m"; under one hour "Closes in 42:18".
 * Returns `urgent` so the UI can switch to the dark-orange style.
 */
export function formatCountdown(msRemaining: number): { label: string; urgent: boolean } {
  if (msRemaining <= 0) return { label: 'Closed', urgent: false };
  const totalSec = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return { label: `${days}d ${hours}h`, urgent: false };
  if (hours > 0) return { label: `${hours}h ${mins}m`, urgent: false };
  return { label: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, urgent: true };
}

/** Human "time since" for queues: "2d 4h", "35m". */
export function formatAge(msElapsed: number): string {
  const mins = Math.max(0, Math.floor(msElapsed / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}
