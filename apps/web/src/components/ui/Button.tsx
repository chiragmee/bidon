import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'demo';
export type ButtonSize = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-standard ' +
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

const variants: Record<ButtonVariant, string> = {
  // DESIGN.md: the only orange fill in the product. One per viewport.
  primary: 'bg-action text-on-action hover:bg-action-hover disabled:hover:bg-action',
  secondary: 'bg-surface text-primary border border-primary hover:bg-primary-container hover:text-primary-hover',
  ghost: 'bg-transparent text-text hover:bg-surface-muted',
  danger: 'bg-danger text-on-primary hover:brightness-90',
  // Demo-only actions: dashed border + "Demo" tag (DESIGN.md Demo Mode pill).
  demo: 'bg-surface text-on-trust-declared border border-dashed border-on-trust-declared hover:bg-surface-muted',
};

const sizes: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-label-md [&_svg]:size-5',
  lg: 'h-12 px-5 text-body-lg [&_svg]:size-5',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

function DemoTag() {
  return <span className="rounded-full bg-surface-muted px-1.5 text-caption">Demo</span>;
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  /** Why the button is disabled — shown under it so a disabled control always explains itself. */
  disabledReason?: ReactNode;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabledReason,
  icon,
  fullWidth,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const isDisabled = disabled || loading;
  const button = (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={disabled && disabledReason ? reasonId : undefined}
      className={buttonClasses(variant, size, cn(fullWidth && 'w-full', className))}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
      {variant === 'demo' && <DemoTag />}
    </button>
  );
  if (!(disabled && disabledReason)) return button;
  return (
    <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
      {button}
      <p id={reasonId} className="text-caption text-text-secondary">
        {disabledReason}
      </p>
    </div>
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, fullWidth, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, cn(fullWidth && 'w-full', className))} {...rest}>
      {icon}
      {children}
      {variant === 'demo' && <DemoTag />}
    </Link>
  );
}
