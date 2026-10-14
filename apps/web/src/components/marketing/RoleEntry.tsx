'use client';

import { ArrowRight, ClipboardList, Gavel, ShieldCheck } from 'lucide-react';
import type { Role } from '@auctionit/domain';
import { Button } from '@/components/ui';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';

const ENTRIES: { role: Exclude<Role, 'guest'>; title: string; body: string; cta: string; Icon: typeof Gavel }[] = [
  {
    role: 'buyer',
    title: 'Explore as Buyer',
    body: 'Browse lots, review the evidence, pay a simulated EMD and place bids as Rahul from Vardhan Infra Projects.',
    cta: 'Explore as Buyer',
    Icon: Gavel,
  },
  {
    role: 'seller',
    title: 'Explore as Seller',
    body: 'List surplus with a structured declaration, set the reserve and auction dates, and track sales as Shree Balaji Steels.',
    cta: 'Explore as Seller',
    Icon: ClipboardList,
  },
  {
    role: 'ops',
    title: 'Explore as Operations',
    body: 'See marketplace activity, close demo auctions and decide disputed Lot Assurance claims.',
    cta: 'Explore as Operations',
    Icon: ShieldCheck,
  },
];

/** One click into a seeded demo account — no signup (SPEC §6). */
export function RoleEntry({ highlight }: { highlight?: Role | null }) {
  const { signInAs } = useSession();
  return (
    <ul className="grid gap-md md:grid-cols-3">
      {ENTRIES.map(({ role, title, body, cta, Icon }) => (
        <li
          key={role}
          className={
            'flex flex-col gap-sm rounded-lg border bg-surface p-lg ' + (highlight === role ? 'border-primary ring-2 ring-primary/20' : 'border-border')
          }
        >
          <span className="grid size-10 place-items-center rounded-md bg-primary-container text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <h3 className="text-h3 text-text-strong">{title}</h3>
          <p className="flex-1 text-body-md text-text-secondary">{body}</p>
          <Button onClick={() => signInAs(demoSessionFor(role))} icon={<ArrowRight aria-hidden />}>
            {cta}
          </Button>
        </li>
      ))}
    </ul>
  );
}
