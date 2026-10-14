import { FileText, Paperclip, Quote, Scale, ShieldCheck } from 'lucide-react';
import type { DerivedStatus } from '@auctionit/domain';
import { cn } from '@/lib/cn';

export type StatusKind =
  | 'live'
  | 'upcoming'
  | 'reserve_met'
  | 'unsold'
  | 'draft'
  | 'closed'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

const STATUS_STYLE: Record<StatusKind, string> = {
  live: 'bg-action-container text-on-action-container',
  upcoming: 'bg-surface-muted text-on-trust-declared',
  reserve_met: 'bg-primary-container text-on-primary-container',
  unsold: 'bg-surface-muted text-on-trust-declared',
  draft: 'bg-surface text-on-trust-declared border border-dashed border-border-control',
  closed: 'bg-surface-muted text-on-trust-declared',
  success: 'bg-success-container text-success',
  warning: 'bg-warning-container text-warning',
  danger: 'bg-danger-container text-danger',
  neutral: 'bg-surface-muted text-on-trust-declared',
};

/** Auction status pill. Live carries the product's single continuous animation: the pulse dot. */
export function StatusBadge({ kind, children, className }: { kind: StatusKind; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption whitespace-nowrap', STATUS_STYLE[kind], className)}>
      {kind === 'live' && (
        <span aria-hidden className="size-2 rounded-full bg-action-accent motion-safe:animate-[live-pulse_1.6s_ease-in-out_infinite]" />
      )}
      {children}
    </span>
  );
}

const AUCTION_BADGE: Record<DerivedStatus, { kind: StatusKind; label: string }> = {
  draft: { kind: 'draft', label: 'Draft' },
  scheduled: { kind: 'upcoming', label: 'Upcoming' },
  live: { kind: 'live', label: 'Live' },
  ended: { kind: 'closed', label: 'Closing' },
  closed_reserve_met: { kind: 'reserve_met', label: 'Closed · Reserve met' },
  closed_unsold: { kind: 'unsold', label: 'Unsold' },
  awarded: { kind: 'success', label: 'Awarded' },
};

export function AuctionStatusBadge({ status, className }: { status: DerivedStatus; className?: string }) {
  const b = AUCTION_BADGE[status];
  return (
    <StatusBadge kind={b.kind} className={className}>
      {b.label}
    </StatusBadge>
  );
}

export type TrustTier = 'declared' | 'evidence' | 'confirmed';

const TRUST: Record<TrustTier, { label: string; className: string; Icon: typeof Quote }> = {
  declared: { label: 'Seller declared', className: 'bg-trust-declared text-on-trust-declared', Icon: Quote },
  evidence: { label: 'Evidence attached', className: 'bg-trust-evidence text-on-trust-evidence border border-primary-line', Icon: Paperclip },
  confirmed: { label: 'Confirmed at lifting', className: 'bg-trust-confirmed text-on-trust-confirmed', Icon: Scale },
};

/**
 * The trust tier of a fact on an assured lot — DESIGN.md's signature. Visual weight rises with
 * certainty. Never use "Verified".
 */
export function TrustBadge({ tier, className }: { tier: TrustTier; className?: string }) {
  const t = TRUST[tier];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-sm px-2 text-caption whitespace-nowrap', t.className, className)}>
      <t.Icon className="size-3.5" aria-hidden />
      {t.label}
    </span>
  );
}

/** Lot Assurance shield. `overlay` sits on photos (solid teal); `inline` sits in text (pale teal). */
export function LotAssuranceBadge({ variant = 'inline', className }: { variant?: 'inline' | 'overlay'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-sm px-2 text-caption whitespace-nowrap',
        variant === 'overlay' ? 'bg-primary text-on-primary' : 'bg-primary-container text-on-primary-container',
        className,
      )}
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      Lot Assurance
    </span>
  );
}

/** Caption for illustrative values (tolerances, remedies, EMD rules). */
export function DemoPolicyCaption({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption text-text-secondary', className)}>
      <FileText className="size-3" aria-hidden />
      Demo policy
    </span>
  );
}

export function SampleDataCaption({ label = 'Sample data', className }: { label?: string; className?: string }) {
  return <span className={cn('text-caption text-text-secondary', className)}>{label}</span>;
}
