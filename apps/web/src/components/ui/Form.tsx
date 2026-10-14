'use client';

import { CircleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, useContext, useId } from 'react';
import { formatINR } from '@auctionit/domain';
import { cn } from '@/lib/cn';

interface FieldCtx {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}
const FieldContext = createContext<FieldCtx | null>(null);

/** Label above control, helper text, and an error that says what happened and how to fix it. */
export function Field({
  label,
  helper,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  helper?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-label-md text-text-strong">
          {label}
          {required && <span className="text-danger" aria-hidden> *</span>}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {children}
        {error && (
          <p id={errorId} className="flex items-start gap-1 text-caption text-danger">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        {helper && (
          <p id={helperId} className="text-caption text-text-secondary">
            {helper}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

function useField() {
  return useContext(FieldContext);
}

const control =
  'h-10 w-full rounded-md border bg-surface px-3 text-body-md text-text placeholder:text-text-secondary ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-secondary';

function controlState(invalid: boolean) {
  return invalid ? 'border-danger bg-danger-container' : 'border-border-control';
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  const f = useField();
  return (
    <input
      id={f?.id}
      aria-describedby={f?.describedBy}
      aria-invalid={f?.invalid || undefined}
      className={cn(control, controlState(!!f?.invalid), className)}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  const f = useField();
  return (
    <textarea
      id={f?.id}
      aria-describedby={f?.describedBy}
      aria-invalid={f?.invalid || undefined}
      className={cn(control, 'h-auto min-h-24 py-2', controlState(!!f?.invalid), className)}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  const f = useField();
  return (
    <select
      id={f?.id}
      aria-describedby={f?.describedBy}
      aria-invalid={f?.invalid || undefined}
      className={cn(control, 'pr-8', controlState(!!f?.invalid), className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-xs', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 rounded-sm border-border-control accent-primary" {...rest} />
      <label htmlFor={id} className="text-body-md text-text">
        {label}
      </label>
    </div>
  );
}

/**
 * Rupee amount input: ₹ prefix, optional /MT suffix, digits only. Shows the formatted figure
 * (Indian grouping) beneath so large numbers are easy to read back.
 */
export function MoneyInput({
  value,
  onChange,
  perMt = false,
  showFormatted = true,
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (value: number | null) => void;
  perMt?: boolean;
  showFormatted?: boolean;
}) {
  const f = useField();
  return (
    <div className={className}>
      <div
        className={cn(
          'flex h-10 items-center rounded-md border bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          controlState(!!f?.invalid),
        )}
      >
        <span aria-hidden className="pl-3 text-body-md text-text-secondary">
          ₹
        </span>
        <input
          id={f?.id}
          aria-describedby={f?.describedBy}
          aria-invalid={f?.invalid || undefined}
          inputMode="numeric"
          autoComplete="off"
          className="h-full w-full min-w-0 bg-transparent px-2 text-body-md text-text outline-none"
          value={value === null ? '' : String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '');
            onChange(digits === '' ? null : Number(digits));
          }}
          {...rest}
        />
        {perMt && (
          <span aria-hidden className="pr-3 text-body-md text-text-secondary">
            /MT
          </span>
        )}
      </div>
      {showFormatted && value !== null && value > 0 && (
        <p className="mt-1 text-caption text-text-secondary" aria-hidden>
          {formatINR(value, { perMt })}
        </p>
      )}
    </div>
  );
}
