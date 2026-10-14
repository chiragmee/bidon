import { CircleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** White surface, 1px hairline, 12px radius. Depth from borders, not shadows (DESIGN.md Level 0). */
export function Card({ className, padded = true, ...rest }: ComponentProps<'div'> & { padded?: boolean }) {
  return <div className={cn('rounded-lg border border-border bg-surface', padded && 'p-md', className)} {...rest} />;
}

export function Overline({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('text-overline uppercase text-text-secondary', className)} {...rest} />;
}

/** Overline label, H2 figure, one caption line. The card needing attention goes pale amber. */
export function StatCard({
  label,
  value,
  caption,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  attention?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border p-md', attention ? 'border-warning/30 bg-warning-container' : 'border-border bg-surface')}>
      <p className={cn('flex items-center gap-1 text-overline uppercase', attention ? 'text-warning' : 'text-text-secondary')}>
        {attention && <CircleAlert className="size-3.5" aria-hidden />}
        {label}
      </p>
      <p className="text-h2 text-text-strong">{value}</p>
      {caption && <p className="text-caption text-text-secondary">{caption}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />;
}

/** Screen-reader announcement for a loading region, paired with visual skeletons. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
