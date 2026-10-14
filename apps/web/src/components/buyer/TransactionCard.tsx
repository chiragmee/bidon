import Link from 'next/link';
import type { TransactionCardView } from '@auctionit/domain';
import { formatINR, formatMt, TX_STEPS } from '@auctionit/domain';
import { ButtonLink, StatusBadge, Stepper } from '@/components/ui';

/** Won lot → transaction, with its stepper and exactly one next action (SPEC §11). */
export function TransactionCard({ t, primary = false }: { t: TransactionCardView; primary?: boolean }) {
  const waitingOn = t.next && !t.yourTurn ? (t.next.role === 'ops' ? 'Operations' : `the ${t.next.role}`) : null;
  return (
    <article className="flex flex-col gap-md rounded-lg border border-border bg-surface p-md" aria-labelledby={`${t.id}-h`}>
      <div className="flex flex-wrap items-start justify-between gap-xs">
        <div className="min-w-0">
          <p className="text-caption text-text-secondary">
            {t.id} · {t.lotId}
          </p>
          <h3 id={`${t.id}-h`} className="text-h3 text-text-strong">
            <Link href={`/transactions/${t.id}`} className="hover:text-primary hover:underline">
              {t.lotTitle}
            </Link>
          </h3>
          <p className="text-body-md text-text-secondary">
            {formatINR(t.pricePerMt, { perMt: true })} · {formatMt(t.estimatedQtyMt, { estimate: true })} · {t.counterparty}
          </p>
        </div>
        <StatusBadge kind={t.stepper.claim ? 'warning' : t.yourTurn ? 'warning' : t.stepper.done ? 'success' : 'neutral'}>{t.statusLabel}</StatusBadge>
      </div>
      <Stepper steps={TX_STEPS} current={t.stepper.done ? 6 : t.stepper.current} claim={t.stepper.claim} claimLabel="Claim under review" label={`${t.id} progress`} />
      <div className="flex flex-col gap-sm border-t border-border pt-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-md text-text">
          {t.next ? (
            t.yourTurn ? (
              <>
                Next: <strong>{t.next.label}</strong>
              </>
            ) : (
              <>
                Waiting for {waitingOn}: {t.next.label.toLowerCase()}
              </>
            )
          ) : (
            'No action needed.'
          )}
        </p>
        <ButtonLink href={`/transactions/${t.id}`} variant={primary && t.yourTurn ? 'primary' : 'secondary'}>
          {t.yourTurn ? 'Open transaction' : 'View transaction'}
        </ButtonLink>
      </div>
    </article>
  );
}
