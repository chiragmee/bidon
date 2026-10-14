import { Check, Flag } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface StepperProps {
  steps: readonly string[];
  /** 1-based index of the current step; steps before it are done. Use steps.length + 1 when all done. */
  current: number;
  /** A claim replaces the current step in amber with a flag icon. */
  claim?: boolean;
  claimLabel?: string;
  /** Optional caption under each step (dates, "In progress"). */
  captions?: readonly (string | undefined)[];
  label?: string;
  className?: string;
}

/** Horizontal on desktop, vertical on mobile (DESIGN.md Transaction stepper). */
export function Stepper({ steps, current, claim = false, claimLabel = 'Assurance claim', captions, label = 'Progress', className }: StepperProps) {
  return (
    <ol aria-label={label} className={cn('flex flex-col gap-sm md:flex-row md:gap-0', className)}>
      {steps.map((name, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? (claim ? 'claim' : 'current') : 'future';
        return (
          <li
            key={name}
            aria-current={state === 'current' || state === 'claim' ? 'step' : undefined}
            className="flex flex-1 items-start gap-xs md:flex-col md:items-start md:gap-xs md:pr-sm"
          >
            <div className="flex items-center md:w-full">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border-2 text-caption',
                  state === 'done' && 'border-primary bg-primary text-on-primary',
                  state === 'current' && 'border-action bg-surface',
                  state === 'claim' && 'border-warning bg-warning-container text-warning',
                  state === 'future' && 'border-border-strong bg-surface text-text-secondary',
                )}
              >
                {state === 'done' && <Check className="size-4" aria-hidden />}
                {state === 'current' && <span aria-hidden className="size-2.5 rounded-full bg-action-accent" />}
                {state === 'claim' && <Flag className="size-3.5" aria-hidden />}
                {state === 'future' && <span aria-hidden>{n}</span>}
              </span>
              {n < steps.length && (
                <span aria-hidden className={cn('mx-xs hidden h-0.5 flex-1 md:block', n < current ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-label-md',
                  state === 'done' && 'text-text-strong',
                  state === 'current' && 'font-semibold text-text-strong',
                  state === 'claim' && 'font-semibold text-warning',
                  state === 'future' && 'text-text-secondary',
                )}
              >
                {state === 'claim' ? claimLabel : name}
                <span className="sr-only">{state === 'done' ? ' (done)' : state === 'future' ? ' (upcoming)' : ' (current)'}</span>
              </p>
              {captions?.[i] && <p className="text-caption text-text-secondary">{captions[i]}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
