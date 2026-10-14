import Link from 'next/link';

// Placeholder until Phase 3 builds the landing page.
export default function Home() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 py-xxl">
      <p className="text-overline uppercase text-text-secondary">Demo environment</p>
      <h1 className="mt-xs text-display text-text-strong">AuctionIT</h1>
      <p className="mt-sm max-w-[560px] text-body-lg text-text-secondary">
        Scaffold is running. The landing page arrives in Phase 3.
      </p>
      <Link className="mt-lg inline-block font-medium text-primary underline" href="/dev/components">
        View UI components
      </Link>
    </main>
  );
}
