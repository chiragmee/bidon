'use client';

import { useRouter } from 'next/navigation';
import { Check, CircleCheck, Circle, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoryId, ListingDraft, LotMedia, WizardStep } from '@auctionit/domain';
import { CATEGORIES, formatINR, formatMt, formatPct, policyFor, publishBlockers, suggestedEmd, validateListingStep } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, Card, Checkbox, DemoPolicyCaption, EvidenceUploader, Field, Input, MoneyInput, Select, Stepper, Textarea } from '@/components/ui';
import { useData } from '@/data';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/SessionProvider';

const STEPS = ['Basic details', 'Quantity and condition', 'Evidence', 'Auction and assurance'] as const;
const STATES = ['Chhattisgarh', 'Delhi NCR', 'Gujarat', 'Jharkhand', 'Karnataka', 'Maharashtra', 'Odisha', 'Punjab', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];

/** <input type="datetime-local"> works in local time; the lot stores ISO. */
const toLocal = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

function defaultSchedule(): Pick<ListingDraft, 'startAt' | 'endAt'> {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  end.setHours(17, 0, 0, 0);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'error'; message: string };

function PilotChecklist({ category, media }: { category: CategoryId | undefined; media: LotMedia[] }) {
  const p = category ? policyFor(category) : null;
  if (!p?.evidence) {
    return (
      <p className="rounded-md bg-surface-muted px-md py-sm text-body-md text-text-secondary">
        Evidence is optional for {p ? p.label.toLowerCase() : 'this category'} lots, but photos help buyers bid with confidence.
      </p>
    );
  }
  const photos = media.filter((m) => m.kind === 'photo').length;
  const videos = media.filter((m) => m.kind === 'video').length;
  const rows: [string, number, number][] = [
    ['Yard photos', photos, p.evidence.minPhotos],
    ['Walkthrough video', videos, p.evidence.minVideos],
  ];
  return (
    <Card className="flex flex-col gap-xs bg-primary-container">
      <p className="flex flex-wrap items-center gap-xs text-label-md text-on-primary-container">
        <ShieldCheck className="size-4" aria-hidden />
        Lot Assurance evidence — proposed pilot requirement
      </p>
      <ul className="flex flex-col gap-1 text-body-md">
        {rows.map(([label, have, need]) => (
          <li key={label} className="flex items-center gap-xs">
            {have >= need ? <CircleCheck className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-text-secondary" aria-hidden />}
            {label}: {Math.min(have, need)} of {need}
            <span className="sr-only">{have >= need ? ' (met)' : ' (not yet met)'}</span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-secondary">
        Needed only if you enable Lot Assurance. Geotagged, timestamped photos are best — but location data is attached as-is and isn’t checked by AuctionIT.
      </p>
    </Card>
  );
}

/**
 * /seller/lots/new and /seller/lots/[id]/edit — four steps, values kept across steps, autosaved as a
 * draft (SPEC §13). Inline validation uses the same domain rules that guard publishing.
 */
export function ListingWizard({ lotId: initialId, initial, initialStep = 1, defaults }: { lotId: string | null; initial: ListingDraft; initialStep?: WizardStep; defaults?: Partial<ListingDraft> }) {
  const { ds } = useData();
  const { viewer } = useSession();
  const router = useRouter();
  const [lotId, setLotId] = useState(initialId);
  // A draft without dates gets a suggested schedule (tomorrow 10:00 → two days later 17:00).
  const [draft, setDraft] = useState<ListingDraft>(() => {
    const d = { ...defaults, ...initial };
    return d.startAt || d.endAt ? d : { ...d, ...defaultSchedule() };
  });
  const [media, setMedia] = useState<LotMedia[]>(initial.media ?? []);
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const inflight = useRef<Promise<string | null> | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const full: ListingDraft = { ...draft, media };
  const p = draft.category ? policyFor(draft.category) : null;
  const now = new Date().toISOString();

  /** Save now; returns the lot id (creating the draft on first save). One save at a time. */
  const persist = useCallback(async (): Promise<string | null> => {
    if (inflight.current) await inflight.current;
    const run = (async () => {
      setSave({ kind: 'saving' });
      const r = await ds.saveDraft(lotId, { ...draft, media }, viewer);
      if (!r.ok) {
        setSave({ kind: 'error', message: `${r.error.what} ${r.error.next}` });
        return null;
      }
      setSave({ kind: 'saved', at: Date.now() });
      setDirty(false);
      if (!lotId) {
        setLotId(r.data.id);
        window.history.replaceState(null, '', `/seller/lots/${r.data.id}/edit`);
      }
      return r.data.id;
    })();
    inflight.current = run;
    const id = await run;
    inflight.current = null;
    return id;
  }, [ds, draft, media, lotId, viewer]);

  // Autosave a moment after the seller stops typing (only once there's something to save).
  useEffect(() => {
    if (!dirty || !(draft.title || draft.category)) return;
    const id = setTimeout(() => void persist(), 1200);
    return () => clearTimeout(id);
  }, [dirty, draft, media, persist]);

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const setAttr = (key: string, v: string) => {
    setDraft((d) => ({ ...d, attributes: { ...d.attributes, [key]: v } }));
    setDirty(true);
    setErrors((e) => ({ ...e, [`attributes.${key}`]: '' }));
  };
  const setFiles: typeof setMedia = (u) => {
    setMedia(u);
    setDirty(true);
  };

  const go = (s: WizardStep) => {
    setStep(s);
    setErrors({});
    top.current?.scrollIntoView({ block: 'start' });
  };

  async function next() {
    const e = validateListingStep(step, full, now) as Record<string, string>;
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    if (step < 4) {
      void persist();
      go((step + 1) as WizardStep);
      return;
    }
    // Last step: everything must be valid before the preview.
    const blockers = publishBlockers(full, now);
    if (blockers.length) {
      setErrors(Object.fromEntries(blockers.map((b) => [b.field, b.message])));
      go(blockers[0]!.step);
      return;
    }
    setBusy(true);
    const id = await persist();
    setBusy(false);
    if (id) router.push(`/seller/lots/${id}/preview`);
  }

  const err = (k: string) => errors[k] || null;
  const reserveTotal = draft.reservePerMt && draft.estimatedQtyMt ? draft.reservePerMt * draft.estimatedQtyMt : null;
  const emdSuggestion = draft.category && draft.reservePerMt && draft.estimatedQtyMt ? suggestedEmd(draft.category, draft.reservePerMt, draft.estimatedQtyMt) : null;

  return (
    <Container className="max-w-[760px]">
      <div ref={top} className="scroll-mt-24" />
      <div className="flex flex-wrap items-end justify-between gap-sm">
        <div>
          <p className="text-overline uppercase text-text-secondary">
            {lotId ? `Draft ${lotId}` : 'New lot'} · step {step} of 4
          </p>
          <h1 className="text-h1 text-text-strong">{STEPS[step - 1]}</h1>
        </div>
        <p aria-live="polite" className={cn('text-caption', save.kind === 'error' ? 'text-danger' : 'text-text-secondary')}>
          {save.kind === 'saving' && 'Saving draft…'}
          {save.kind === 'saved' && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-success" aria-hidden /> Draft saved {new Date(save.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {save.kind === 'idle' && dirty && 'Unsaved changes'}
        </p>
      </div>

      <Card className="mt-md p-md">
        <Stepper steps={STEPS} current={step} label="Listing progress" />
      </Card>

      {save.kind === 'error' && (
        <Banner tone="danger" title="Your draft wasn’t saved" className="mt-md" action={<Button onClick={() => void persist()}>Retry save</Button>}>
          {save.message} Your entries are still here.
        </Banner>
      )}

      <form
        noValidate
        className="mt-lg flex flex-col gap-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {step === 1 && (
          <>
            <Field label="Lot title" helper="What buyers will search for, e.g. “HMS 1 & 2 steel scrap”." error={err('title')} required>
              <Input value={draft.title ?? ''} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Category" helper="Lot Assurance is in pilot for ferrous and mixed-steel lots." error={err('category')} required>
              <Select value={draft.category ?? ''} onChange={(e) => set('category', (e.target.value || undefined) as CategoryId | undefined)}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.assuranceEligible ? ' — Lot Assurance pilot' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Material type or grade" error={err('grade')} required>
              <Input value={draft.grade ?? ''} onChange={(e) => set('grade', e.target.value)} placeholder="HMS 1 & 2 (80:20)" />
            </Field>
            <Field label="Description" helper="Form, source and how it’s stored — in plain words." error={err('description')} required>
              <Textarea value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Yard or plant" error={err('yard')} required>
              <Input value={draft.yard ?? ''} onChange={(e) => set('yard', e.target.value)} />
            </Field>
            <div className="grid gap-lg sm:grid-cols-2">
              <Field label="City" error={err('city')} required>
                <Input value={draft.city ?? ''} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="State" error={err('state')} required>
                <Select value={draft.state ?? ''} onChange={(e) => set('state', e.target.value)}>
                  <option value="">Choose…</option>
                  {STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 2 && p && (
          <>
            <Field label="Estimated quantity (MT)" helper="Buyers pay for the weighbridge quantity at lifting; this is your estimate." error={err('estimatedQtyMt')} required>
              <Input
                inputMode="decimal"
                value={draft.estimatedQtyMt ?? ''}
                onChange={(e) => set('estimatedQtyMt', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </Field>
            {p.hasContamination && (
              <Field label="Contamination estimate (%)" helper="Non-metallic content such as slag, mud or attachments. Buyers see it as “Seller declared”." error={err('contaminationPct')} required>
                <Input
                  inputMode="decimal"
                  value={draft.contaminationPct ?? ''}
                  onChange={(e) => set('contaminationPct', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
            )}
            {p.attributeFields.map((f) => (
              <Field key={f.key} label={f.label} error={err(`attributes.${f.key}`)} required={f.required}>
                <Input value={draft.attributes?.[f.key] ?? ''} onChange={(e) => setAttr(f.key, e.target.value)} />
              </Field>
            ))}
          </>
        )}
        {step === 2 && !p && <Banner tone="warning">Choose a category in step 1 first — the fields here depend on it.</Banner>}

        {step === 3 && (
          <>
            <PilotChecklist category={draft.category} media={media} />
            <EvidenceUploader
              label="Photos, video and documents"
              helper="Show the whole pile, close-ups of the material and anything unusual. Large files may take a moment."
              stage="listing"
              value={media}
              onChange={setFiles}
              category={draft.category ?? 'ferrous_hms'}
            />
          </>
        )}

        {step === 4 && p && (
          <>
            <div className="grid gap-lg sm:grid-cols-2">
              <Field label="Reserve price per MT" helper={reserveTotal ? `Total reserve ≈ ${formatINR(reserveTotal)} on ${formatMt(draft.estimatedQtyMt ?? 0, { estimate: true })}.` : 'The lowest price you’ll sell at.'} error={err('reservePerMt')} required>
                <MoneyInput value={draft.reservePerMt ?? null} onChange={(v) => set('reservePerMt', v ?? undefined)} perMt />
              </Field>
              <Field
                label="EMD per bidder"
                helper={emdSuggestion ? `Suggested ${formatINR(emdSuggestion)} — ${p.emd.pctOfReserveValue}% of reserve value (demo policy).` : 'Refundable deposit each bidder pays before bidding.'}
                error={err('emdAmount')}
                required
              >
                <MoneyInput value={draft.emdAmount ?? null} onChange={(v) => set('emdAmount', v ?? undefined)} />
              </Field>
            </div>
            {emdSuggestion && draft.emdAmount !== emdSuggestion && (
              <div className="-mt-md">
                <Button variant="ghost" onClick={() => set('emdAmount', emdSuggestion)}>
                  Use suggested EMD {formatINR(emdSuggestion)}
                </Button>
              </div>
            )}
            <Checkbox label="Show the reserve price to buyers" checked={draft.reserveVisible ?? true} onChange={(e) => set('reserveVisible', e.target.checked)} />
            <div className="grid gap-lg sm:grid-cols-2">
              <Field label="Bidding opens" error={err('startAt')} required>
                <Input type="datetime-local" value={toLocal(draft.startAt)} onChange={(e) => set('startAt', fromLocal(e.target.value))} />
              </Field>
              <Field label="Bidding closes" error={err('endAt')} required>
                <Input type="datetime-local" value={toLocal(draft.endAt)} onChange={(e) => set('endAt', fromLocal(e.target.value))} />
              </Field>
            </div>

            <section aria-labelledby="la-h" className="flex flex-col gap-md rounded-lg border border-border bg-surface p-lg">
              <h2 id="la-h" className="flex items-center gap-xs text-h3 text-text-strong">
                <ShieldCheck className="size-5 text-primary" aria-hidden />
                Lot Assurance
              </h2>
              {p.assuranceEligible && p.tolerance ? (
                <>
                  <Checkbox
                    label={<span className="text-label-md">Offer this lot with Lot Assurance</span>}
                    checked={!!draft.assuranceEnabled}
                    onChange={(e) => set('assuranceEnabled', e.target.checked)}
                  />
                  {err('assuranceEnabled') && <p className="text-caption text-danger">{err('assuranceEnabled')}</p>}
                  {draft.assuranceEnabled && (
                    <>
                      <dl className="grid gap-xs rounded-md bg-surface-muted p-md text-body-md sm:grid-cols-2">
                        <div>
                          <dt className="text-caption text-text-secondary">Contamination tolerance</dt>
                          <dd>
                            Up to {formatPct(p.tolerance.contaminationCeilingPct)}
                            {draft.contaminationPct != null && ` (you declared ${formatPct(draft.contaminationPct)})`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-caption text-text-secondary">Quantity</dt>
                          <dd>Within ±{p.tolerance.quantityVariancePct}% of your estimate</dd>
                        </div>
                        <div>
                          <dt className="text-caption text-text-secondary">If outside tolerance</dt>
                          <dd>Price adjustment for the excess, or buyer exit with EMD and balance refunded</dd>
                        </div>
                        <div>
                          <dt className="text-caption text-text-secondary">Claims</dt>
                          <dd>With evidence, before loading completes. You respond first; Operations decides disputes.</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <DemoPolicyCaption />
                        </div>
                      </dl>
                      <Checkbox
                        label={`I agree: the declared grade and contamination will be checked at lifting, the buyer pays for the weighbridge quantity, and if the lot is outside the ${formatPct(p.tolerance.contaminationCeilingPct)} tolerance the buyer may claim a price adjustment or exit, decided by AuctionIT Operations if I dispute it.`}
                        checked={!!draft.assuranceAgreed}
                        onChange={(e) => set('assuranceAgreed', e.target.checked)}
                      />
                      {err('assuranceAgreed') && <p className="text-caption text-danger">{err('assuranceAgreed')}</p>}
                    </>
                  )}
                </>
              ) : (
                <p className="text-body-md text-text-secondary">
                  Lot Assurance is in pilot for ferrous and mixed-steel lots only, so this will be a standard listing. Standard lots aren’t marked as risky — they
                  simply don’t carry the assurance terms.
                </p>
              )}
            </section>
          </>
        )}
        {step === 4 && !p && <Banner tone="warning">Choose a category in step 1 first.</Banner>}

        <div
          // Below lg the workspace has a fixed bottom tab bar (~56px + safe area); sit above it so the
          // actions stay tappable on phones.
          className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+3.5rem)] -mx-4 flex flex-wrap items-center justify-between gap-sm border-t border-border bg-canvas px-4 py-sm md:-mx-lg md:px-lg lg:bottom-0"
        >
          <Button variant="ghost" onClick={() => (step > 1 ? go((step - 1) as WizardStep) : router.push('/seller/dashboard'))}>
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          <div className="flex gap-xs">
            <Button onClick={() => void persist()} disabled={!(draft.title || draft.category)}>
              Save draft
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {step < 4 ? 'Continue' : 'Preview listing'}
            </Button>
          </div>
        </div>
      </form>
    </Container>
  );
}
