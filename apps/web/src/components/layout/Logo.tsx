import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Bid ON mark (D-105): a teal tile with a power-"on" symbol — bidding is switched on — and an orange live light.
 * Colours are DESIGN.md primary (#0F4C5C) and action (#BD5418); the same drawing is app/icon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" fill="#0F4C5C" />
      <path d="M11.2 10.4a8 8 0 1 0 9.6 0" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 7.5v8" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24.5" cy="7.5" r="3" fill="#BD5418" stroke="#0F4C5C" strokeWidth="1.2" />
    </svg>
  );
}

/** Mark + "Bid ON" wordmark. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-xs', className)}>
      <LogoMark className={size === 'lg' ? 'size-9' : 'size-8'} />
      <span className={cn('font-semibold tracking-tight text-text-strong', size === 'lg' ? 'text-h2' : 'text-h3')}>
        Bid <span className="font-bold text-primary">ON</span>
      </span>
    </span>
  );
}

/** The header's home link. */
export function LogoLink() {
  return (
    <Link href="/" aria-label="Bid ON home" className="rounded-md">
      <Logo />
    </Link>
  );
}
