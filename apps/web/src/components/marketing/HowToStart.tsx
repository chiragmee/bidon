'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface Step {
  title: string;
  body: string;
}

const TRACKS = {
  buyer: {
    label: 'For buyers',
    image: '/images/home/step-inspection.jpg',
    alt: 'Caliper and thickness gauge measuring a steel plate during inspection',
    steps: [
      { title: 'Create your account', body: 'Sign up with your work email and password, then confirm your email.' },
      { title: 'Get your business approved', body: 'Add your business details and documents (PAN, address proof, GST if registered). A reviewer approves them.' },
      { title: 'Pay the EMD and bid', body: 'Pay the lot’s deposit to the seller and report it here. You can bid once the seller confirms it.' },
      { title: 'Win, pay and lift', body: 'Pay the balance to the seller, agree a lifting date, and pay for the weight measured at the weighbridge.' },
    ],
  },
  seller: {
    label: 'For sellers',
    image: '/images/home/cat-ferrous-hms.jpg',
    alt: 'Sorted heavy melting steel scrap in a seller’s yard, ready for listing',
    steps: [
      { title: 'Create your account', body: 'Sign up with your work email and password, then confirm your email.' },
      { title: 'Get your business approved', body: 'Add business details, GST, proof of your yard and the bank account buyers will pay into.' },
      { title: 'List your lot', body: 'Describe the material, add photos, set the quantity, reserve price and auction dates, then publish.' },
      { title: 'Confirm payments and hand over', body: 'Confirm deposits and the balance as they reach your account, then confirm the lifting date.' },
    ],
  },
} as const;

type Track = keyof typeof TRACKS;

/** Buyers / Sellers tabs with four steps each (WAI-ARIA tabs: arrow keys move between tabs). */
export function HowToStart({ cta }: { cta: Record<Track, { href: string; label: string }> }) {
  const [track, setTrack] = useState<Track>('buyer');
  const id = useId();
  const refs = useRef<Record<Track, HTMLButtonElement | null>>({ buyer: null, seller: null });
  const order: Track[] = ['buyer', 'seller'];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = order[(order.indexOf(track) + 1) % 2]!;
    setTrack(next);
    refs.current[next]?.focus();
  };
  const t = TRACKS[track];

  return (
    <div className="flex flex-col gap-lg">
      <div role="tablist" aria-label="How to start" className="inline-flex self-start rounded-lg border border-border bg-surface p-1">
        {order.map((k) => (
          <button
            key={k}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${k}-tab`}
            aria-selected={track === k}
            aria-controls={`${id}-${k}-panel`}
            tabIndex={track === k ? 0 : -1}
            onKeyDown={onKey}
            onClick={() => setTrack(k)}
            className={cn('rounded-md px-md py-xs text-label-md', track === k ? 'bg-primary text-on-primary' : 'text-text hover:bg-surface-muted')}
          >
            {TRACKS[k].label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-${track}-panel`} aria-labelledby={`${id}-${track}-tab`} className="grid gap-lg lg:grid-cols-[1fr_0.9fr] lg:items-stretch">
        <ol className="grid gap-sm sm:grid-cols-2">
          {t.steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-xs rounded-lg border border-border bg-surface p-lg">
              <span className="grid size-8 place-items-center rounded-full bg-primary-container text-label-md text-primary">{i + 1}</span>
              <h3 className="text-h3 text-text-strong">{s.title}</h3>
              <p className="text-body-md text-text-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="relative min-h-[240px] overflow-hidden rounded-lg">
          <Image src={t.image} alt={t.alt} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-sm bg-gradient-to-t from-text-strong/85 to-transparent p-lg pt-xxl">
            <Link href={cta[track].href} className="inline-flex items-center gap-xs rounded-md bg-surface px-md py-xs text-label-md text-primary hover:bg-primary-container">
              {cta[track].label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href={`/how-it-works#${track === 'buyer' ? 'buyers' : 'sellers'}`} className="text-label-md text-on-primary underline">
              Full guide
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
