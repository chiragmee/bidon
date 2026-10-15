'use client';

import { Flag } from 'lucide-react';
import { useState } from 'react';
import type { LotMedia, TxDetailView } from '@auctionit/domain';
import { classifyClaim, describeRemedy, formatINR } from '@auctionit/domain';
import { Banner, Button, ButtonLink, ConfirmDialog, EvidenceUploader, Field, LotImage, StatusBadge, Textarea } from '@/components/ui';
import { useData } from '@/data';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/SessionProvider';
import { Panel } from './TxPanels';

const STATUS: Record<string, { kind: 'warning' | 'success' | 'danger' | 'neutral'; label: string }> = {
  open: { kind: 'warning', label: 'Waiting for the seller' },
  seller_responded: { kind: 'warning', label: 'Seller responded' },
  under_review: { kind: 'warning', label: 'Under Operations review' },
  resolved: { kind: 'success', label: 'Resolved' },
  rejected: { kind: 'neutral', label: 'Rejected by Operations' },
};

function MediaStrip({ items, d }: { items: LotMedia[]; d: TxDetailView }) {
  if (items.length === 0) return <p className="text-caption text-text-secondary">No files.</p>;
  return (
    <ul className="grid grid-cols-3 gap-xs sm:grid-cols-4">
      {items.map((m) => (
        <li key={m.id}>
          <LotImage src={m.url || null} alt={m.caption} category={d.lot.category} ratio="1/1" sizes="100px" className="rounded-sm" />
          <span className="block truncate text-caption text-text-secondary">{m.caption}</span>
        </li>
      ))}
    </ul>
  );
}

/** Claim status for everyone; the seller's accept/dispute response; Ops' route into review. */
export function ClaimPanel({ d, onDone, primary }: { d: TxDetailView; onDone: (msg: string, ok: boolean) => void; primary: boolean }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const [decision, setDecision] = useState<'accept' | 'dispute' | null>(null);
  const [explanation, setExplanation] = useState('');
  const [files, setFiles] = useState<LotMedia[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = d.claim;
  if (!c) return null;

  const remedyAmount = c.requestedRemedy === 'price_adjustment' ? d.remedies.priceAdjustment : d.remedies.exitRefund;
  const remedyText = describeRemedy(c.requestedRemedy, remedyAmount);
  const s = STATUS[c.status] ?? STATUS.open!;

  return (
    <Panel title={`Lot Assurance claim ${c.id}`} icon={<Flag className="size-5 text-warning" aria-hidden />} aside={<StatusBadge kind={s.kind}>{s.label}</StatusBadge>}>
      <div className="grid gap-md md:grid-cols-2">
        <div className="flex flex-col gap-xs text-body-md">
          <p className="text-overline uppercase text-text-secondary">Buyer’s claim</p>
          <p>
            <strong className="capitalize">{c.type}</strong>: expected {c.expected}; observed <strong>{c.observed}</strong>.
          </p>
          <p className="text-text">“{c.explanation}”</p>
          <p>
            Requested: <strong>{c.requestedRemedy === 'price_adjustment' ? 'price adjustment' : 'exit with refund'}</strong> — {remedyText}.
          </p>
          <MediaStrip items={d.claimMedia.buyer} d={d} />
        </div>
        <div className="flex flex-col gap-xs text-body-md">
          <p className="text-overline uppercase text-text-secondary">Seller’s response</p>
          {c.sellerResponse ? (
            <>
              <p>
                <strong>{c.sellerResponse.decision === 'accept' ? 'Accepted' : 'Disputed'}</strong> · {new Date(c.sellerResponse.respondedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
              {c.sellerResponse.explanation && <p>“{c.sellerResponse.explanation}”</p>}
              <MediaStrip items={d.claimMedia.seller} d={d} />
            </>
          ) : (
            <p className="text-text-secondary">Not yet. The seller responds first; Operations steps in only if the seller disputes.</p>
          )}
          {c.opsDecision && (
            <div className="mt-xs rounded-md bg-surface-muted p-sm">
              <p className="text-overline uppercase text-text-secondary">Operations decision</p>
              <p>
                <strong>{c.opsDecision.outcome === 'approve_adjustment' ? 'Price adjustment approved' : c.opsDecision.outcome === 'approve_exit' ? 'Exit and refund approved' : 'Claim rejected'}</strong>
                {c.opsDecision.amount > 0 && <> · {formatINR(c.opsDecision.amount)}</>}
              </p>
              <p>“{c.opsDecision.reason}”</p>
            </div>
          )}
        </div>
      </div>

      {c.status === 'open' && d.as === 'seller' && (
        <div className="flex flex-col gap-md border-t border-border pt-md">
          <fieldset className="flex flex-col gap-xs">
            <legend className="text-label-md text-text-strong">Your response</legend>
            {(
              [
                ['accept', 'Accept the requested remedy', `${remedyText}. The claim closes without Operations.`],
                ['dispute', 'Dispute the claim', 'Explain why and attach evidence. Operations will review both sides and decide.'],
              ] as const
            ).map(([value, label, help]) => (
              <label key={value} className={cn('flex items-start gap-xs rounded-md border p-sm', decision === value ? 'border-primary bg-primary-container' : 'border-border')}>
                <input type="radio" name="response" className="mt-1 accent-primary" checked={decision === value} onChange={() => setDecision(value)} />
                <span>
                  <span className="block text-label-md text-text-strong">{label}</span>
                  <span className="block text-caption text-text-secondary">{help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {decision === 'dispute' && (
            <>
              <Field label="Why you dispute it" required error={error}>
                <Textarea value={explanation} onChange={(e) => (setExplanation(e.target.value), setError(null))} placeholder="What you saw, and why the buyer’s finding is wrong." />
              </Field>
              <EvidenceUploader label="Your evidence" stage="claim_response" value={files} onChange={setFiles} category={d.lot.category} />
            </>
          )}
          <div>
            <Button
              variant={primary ? 'primary' : 'secondary'}
              disabled={!decision}
              disabledReason="Choose accept or dispute first."
              onClick={() => {
                if (decision === 'dispute' && !explanation.trim()) return setError('Explain why you dispute the claim.');
                setConfirm(true);
              }}
            >
              Send response
            </Button>
          </div>
        </div>
      )}
      {c.status === 'open' && d.as !== 'seller' && <p className="text-body-md text-text-secondary">Waiting for {d.seller} to accept or dispute.</p>}
      {c.status === 'under_review' && d.as === 'ops' && (
        <div>
          <ButtonLink href={`/ops/claims/${c.id}`} variant="primary">
            Review claim
          </ButtonLink>
        </div>
      )}
      {c.status === 'under_review' && d.as !== 'ops' && <p className="text-body-md text-text-secondary">Operations is reviewing the evidence from both sides and will record a reasoned decision.</p>}
      {classifyClaim(c) === 'clear_exception' && c.status === 'resolved' && <Banner tone="success">The seller accepted, so the remedy was applied without an Operations review.</Banner>}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title={decision === 'accept' ? 'Accept the claim?' : 'Dispute the claim?'}
        consequence={decision === 'accept' ? `${remedyText}. This resolves the claim and the transaction.` : 'The claim goes to Bid ON Operations, who decide on the evidence from both sides.'}
        confirmLabel={decision === 'accept' ? 'Accept claim' : 'Send dispute'}
        onConfirm={async () => {
          setBusy(true);
          const r = await ds.respondClaim(c.id, { decision: decision ?? 'dispute', explanation }, viewer, files);
          setBusy(false);
          setConfirm(false);
          onDone(r.ok ? (decision === 'accept' ? 'Claim accepted — remedy applied.' : 'Dispute sent to Operations.') : `${r.error.what} ${r.error.next}`, r.ok);
        }}
      />
    </Panel>
  );
}
