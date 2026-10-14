import { CircleAlert, CircleCheck, FlaskConical, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, { className: string; Icon: typeof Info }> = {
  info: { className: 'bg-primary-container text-on-primary-container border-primary/20', Icon: Info },
  success: { className: 'bg-success-container text-success border-success/20', Icon: CircleCheck },
  warning: { className: 'bg-warning-container text-warning border-warning/25', Icon: TriangleAlert },
  danger: { className: 'bg-danger-container text-danger border-danger/20', Icon: CircleAlert },
};

/** Full-width tinted strip: icon, one sentence, optional action. Danger announces as an alert. */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-sm rounded-md border px-md py-sm sm:flex-row sm:items-center', t.className, className)}
    >
      <div className="flex flex-1 gap-xs">
        <t.Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="text-body-md">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(!!title && 'mt-0.5', 'text-text')}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Icon, one-line headline, one sentence of guidance, one button back to something useful. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  headingLevel = 2,
}: {
  icon: typeof Info;
  title: string;
  /** 1 when the empty state is the whole page (not found, access denied), so the page has an h1. */
  headingLevel?: 1 | 2 | 3;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cn('flex flex-col items-center gap-sm rounded-lg border border-border bg-surface px-lg py-xl text-center', className)}>
      <span className="grid size-12 place-items-center rounded-full bg-surface-muted text-text-secondary">
        <Icon className="size-6" aria-hidden />
      </span>
      <Heading className="text-h3 text-text-strong">{title}</Heading>
      {children && <p className="max-w-[420px] text-body-md text-text-secondary">{children}</p>}
      {action && <div className="mt-xs">{action}</div>}
    </div>
  );
}

/**
 * Page/section-level failure. Answers: what happened, what it means, what to do next — with retry.
 * Interactive retry lives in the caller (pass a <Button onClick> as `action`).
 */
export function ErrorState({
  what,
  meaning,
  next,
  action,
  className,
}: {
  what: string;
  meaning?: string;
  next: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col gap-sm rounded-lg border border-danger/20 bg-surface p-lg', className)}>
      <p className="flex items-center gap-xs text-h3 text-danger">
        <CircleAlert className="size-5" aria-hidden />
        {what}
      </p>
      {meaning && <p className="text-body-md text-text">{meaning}</p>}
      <p className="text-body-md text-text-secondary">{next}</p>
      {action && <div className="mt-xs">{action}</div>}
    </div>
  );
}

export function RetryIcon() {
  return <RefreshCw aria-hidden />;
}

/** White pill, dashed slate border, flask icon. In every header. */
export function DemoModePill({ className }: { className?: string }) {
  return (
    <span
      title="Demo environment: all companies, prices and metrics are sample data, and payments are simulated."
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-on-trust-declared bg-surface px-2.5 text-caption text-on-trust-declared whitespace-nowrap',
        className,
      )}
    >
      <FlaskConical className="size-3.5" aria-hidden />
      {/* Short label on phones so the header fits; screen readers always hear "Demo Mode". */}
      <span className="sm:hidden" aria-hidden>
        Demo
      </span>
      <span className="sr-only sm:not-sr-only">Demo Mode</span>
    </span>
  );
}
