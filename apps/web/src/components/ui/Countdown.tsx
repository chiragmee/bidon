'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCountdown } from '@auctionit/domain';
import { cn } from '@/lib/cn';

/**
 * "Closes in 3h 42m"; under an hour "Closes in 42:18" in dark orange (DESIGN.md Typography).
 * Ticks every second only when under an hour, otherwise every 30s.
 */
export function Countdown({
  to,
  prefix = 'Closes in',
  endedLabel = 'Closed',
  className,
}: {
  to: string;
  prefix?: string;
  endedLabel?: string;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  const target = Date.parse(to);

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = target - t;
      if (left <= 0) return;
      // Per-second under an hour; otherwise per 30s, but wake up in time to cross the hour mark.
      id = setTimeout(tick, left < 3_600_000 ? 1000 : Math.min(30_000, left - 3_600_000 + 50));
    };
    tick();
    return () => clearTimeout(id);
  }, [target]);

  // Before hydration the clock is unknown; render a stable placeholder to avoid a mismatch.
  if (now === null) return <span className={cn('inline-block h-4 w-24 rounded bg-surface-muted', className)} aria-hidden />;

  const { label, urgent } = formatCountdown(target - now);
  const ended = target - now <= 0;
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption', urgent ? 'font-semibold text-on-action-container' : 'text-text-secondary', className)}>
      <Clock className="size-3.5" aria-hidden />
      <time dateTime={to}>{ended ? endedLabel : `${prefix} ${label}`}</time>
    </span>
  );
}
