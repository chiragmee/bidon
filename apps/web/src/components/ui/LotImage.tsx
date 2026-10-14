'use client';

import Image from 'next/image';
import { Cable, Cog, Construction, Cpu, Layers } from 'lucide-react';
import { useState } from 'react';
import type { CategoryId } from '@auctionit/domain';
import { policyFor } from '@auctionit/domain';
import { cn } from '@/lib/cn';
import { DEMO_IMAGES } from '@/lib/demoImages';

/** Seed photos only load if the file exists in public/demo-images (D-028); others use the fallback. */
function available(src: string | null): src is string {
  return !!src && (!src.startsWith('/demo-images/') || DEMO_IMAGES.has(src));
}

const CATEGORY_ICON: Record<CategoryId, typeof Layers> = {
  ferrous_hms: Layers,
  mixed_steel: Construction,
  non_ferrous: Cable,
  e_waste: Cpu,
  machinery: Cog,
};

/**
 * Material photo with the designed fallback: a canvas-tinted tile with the category icon —
 * never a broken-image glyph (DESIGN.md Shapes). Real photos go in public/demo-images/.
 */
export function LotImage({
  src,
  alt,
  category,
  ratio = '16/10',
  sizes = '(max-width: 768px) 100vw, 400px',
  priority = false,
  className,
  children,
}: {
  src: string | null;
  alt: string;
  category: CategoryId;
  ratio?: '16/10' | '4/3' | '1/1';
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Overlays (status pill, assurance shield). */
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(!available(src));
  const Icon = CATEGORY_ICON[category];
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-surface-muted', className)} style={{ aspectRatio: ratio }}>
      {failed || !available(src) ? (
        <div className="absolute inset-0 grid place-items-center" role="img" aria-label={`${alt} — photo not available`}>
          <div className="flex flex-col items-center gap-xs text-text-secondary">
            <Icon className="size-10" strokeWidth={1.5} aria-hidden />
            <span className="text-caption">{policyFor(category).label}</span>
          </div>
        </div>
      ) : (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" onError={() => setFailed(true)} />
      )}
      {children}
    </div>
  );
}
