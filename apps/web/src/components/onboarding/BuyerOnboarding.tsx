'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { normalisePhone, validateEmail } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, Card, Field, Input, Select, StatusBadge, Stepper } from '@/components/ui';
import { useData, type DsError } from '@/data';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { AUTH_ENABLED, DEMO_CONTROLS } from '@/lib/flags';
import { useSignInGate } from './SignInGate';

const DRAFT_KEY = 'auctionit:onboarding:buyer';
const STEPS = ['Account', 'Business', 'Review'] as const;
const BUSINESS_TYPES = ['EPC contractor', 'Secondary steel mill / re-rolling', 'Scrap trader / stockist', 'Foundry and castings', 'Exporter / recycler', 'Other manufacturer'];
const STATES = ['Chhattisgarh', 'Delhi NCR', 'Gujarat', 'Jharkhand', 'Karnataka', 'Maharashtra', 'Odisha', 'Punjab', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];
const MATERIALS = ['Ferrous / HMS', 'Mixed steel', 'Copper and wire', 'Aluminium', 'E-waste', 'Used machinery'];

interface Draft {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  businessType: string;
  city: string;
  state: string;
  industry: string;
  materials: string[];
  step: 1 | 2 | 3;
  savedAt: number;
}

const EMPTY: Draft = { name: '', email: '', phone: '', companyName: '', businessType: '', city: '', state: '', industry: '', materials: [], step: 1, savedAt: 0 };
type Errors = Partial<Record<keyof Draft, string>>;

function loadDraft(): { draft: Draft; restored: boolean } {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
      return { draft: d, restored: d.name !== '' || d.email !== '' };
    }
  } catch {
    /* ignore */
  }
  return { draft: EMPTY, restored: false };
}

function validateStep(step: 1 | 2, d: Draft): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (!d.name.trim()) e.name = 'Enter your full name.';
    const em = AUTH_ENABLED ? null : validateEmail(d.email);
    if (em) e.email = em;
    if (!normalisePhone(d.phone)) e.phone = 'Enter a 10-digit mobile number, for example 98765 43210.';
  } else {
    if (!d.companyName.trim()) e.companyName = 'Enter your registered company name.';
    if (!d.businessType) e.businessType = 'Choose the type of business.';
    if (!d.city.trim()) e.city = 'Enter the city you operate from.';
    if (!d.state) e.state = 'Choose the state.';
    if (!d.industry.trim()) e.industry = 'Enter your industry or business category.';
    if (d.materials.length === 0) e.materials = 'Choose at least one material you buy.';
  }
  return e;
}

/** SPEC §9: account → business profile → review; eligibility documents follow on the account page (docs/PHASE1_MVP.md). */
export function BuyerOnboarding() {
  const { ds } = useData();
  const { session, signInAs, auth, refreshAccount } = useSession();
  const router = useRouter();
  // Rendered client-only (see app page), so the saved draft can initialise state directly.
  const [initial] = useState(loadDraft);
  const [d, setD] = useState<Draft>(initial.draft);
  const restored = initial.restored;
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DsError | null>(null);

  // Keep entries between steps, reloads and failed submissions.
  useEffect(() => {
    if (d === EMPTY) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const go = (step: 1 | 2 | 3) => {
    setFailure(null);
    setD((x) => ({ ...x, step }));
    window.scrollTo({ top: 0 });
  };

  async function next() {
    if (d.step === 3) return;
    const e = validateStep(d.step, d);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (d.step === 1 && !AUTH_ENABLED) {
      setBusy(true);
      const r = await ds.emailExists(d.email);
      setBusy(false);
      if (!r.ok) return setFailure(r.error);
      if (r.data) return setErrors({ email: 'An account with this email already exists. Sign in instead, or use a different email.' });
    }
    go((d.step + 1) as 2 | 3);
  }

  async function submit() {
    // Re-check everything: a restored draft may be incomplete.
    const e = { ...validateStep(1, d), ...validateStep(2, d) };
    if (Object.keys(e).length) {
      setErrors(e);
      setFailure({ kind: 'rule', code: 'incomplete_profile', what: 'Your profile is incomplete.', next: 'Fix the items marked below, then create your account.' });
      return;
    }
    setBusy(true);
    setFailure(null);
    // Live site: the API takes the email from the verified sign-in, not from this form.
    const r = await ds.registerBuyer({ ...d, email: auth?.email ?? d.email });
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === 'duplicate_account') setErrors({ email: r.error.what });
      return setFailure(r.error);
    }
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    if (AUTH_ENABLED) await refreshAccount('/buyer/dashboard?welcome=1');
    else signInAs({ role: 'buyer', userId: r.data.user.id }, '/buyer/dashboard?welcome=1');
  }

  const signUpFirst = useSignInGate('buyer');
  if (signUpFirst) return signUpFirst;

  const incomplete = { ...validateStep(1, d), ...validateStep(2, d) };

  return (
    <Container className="max-w-[640px]">
      <p className="text-overline uppercase text-text-secondary">Create a buyer account</p>
      <h1 className="text-h1 text-text-strong">{d.step === 1 ? 'Your account' : d.step === 2 ? 'Tell us about your business' : 'Review and create'}</h1>
      <p className="mt-1 text-body-lg text-text-secondary">Only what’s needed to bid. About two minutes.</p>

      <Card className="mt-lg p-md">
        <Stepper steps={STEPS} current={d.step} label="Onboarding progress" />
      </Card>

      <div className="mt-lg flex flex-col gap-md">
        {!AUTH_ENABLED && session.role !== 'guest' && (
          <Banner tone="info" title="You’re already signed in">
            You’re viewing as a {session.role}. Creating an account here signs you in as the new buyer.
          </Banner>
        )}
        {restored && d.step !== 3 && (
          <Banner tone="info" title="We kept what you entered">
            Your earlier entries were restored.
          </Banner>
        )}
        {DEMO_CONTROLS && d.step === 1 && session.role === 'guest' && (
          <Banner tone="info" title="Just exploring?" action={<Button onClick={() => signInAs(demoSessionFor('buyer'))}>Continue as demo buyer</Button>}>
            Skip signup and use the sample buyer account.
          </Banner>
        )}
        {failure && (
          <Banner
            tone="danger"
            title={failure.what}
            action={failure.kind === 'network' ? <Button onClick={d.step === 3 ? submit : next}>Try again</Button> : undefined}
          >
            {failure.next} {failure.kind === 'network' && 'Your entries are kept.'}
          </Banner>
        )}
      </div>

      <form
        className="mt-lg flex flex-col gap-lg"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (d.step === 3) void submit();
          else void next();
        }}
      >
        {d.step === 1 && (
          <>
            <Field label="Full name" error={errors.name} required>
              <Input autoComplete="name" value={d.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Work email" helper="Used for bid alerts, dispatch documents and invoices." error={errors.email} required>
              <Input
                type="email"
                autoComplete="email"
                value={AUTH_ENABLED ? (auth?.email ?? '') : d.email}
                readOnly={AUTH_ENABLED}
                onChange={(e) => set('email', e.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Mobile number" helper="One account per number. Used by sellers and Bid ON to reach you about lots and payments." error={errors.phone} required>
              <Input type="tel" autoComplete="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" />
            </Field>
            {errors.email?.includes('already exists') && (
              <p className="-mt-md text-caption">
                <Link href="/sign-in" className="font-medium text-primary underline">
                  Go to sign in
                </Link>
              </p>
            )}
          </>
        )}

        {d.step === 2 && (
          <>
            <Field label="Company name" error={errors.companyName} required>
              <Input autoComplete="organization" value={d.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </Field>
            <Field label="Business type" error={errors.businessType} required>
              <Select value={d.businessType} onChange={(e) => set('businessType', e.target.value)}>
                <option value="">Choose…</option>
                {BUSINESS_TYPES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-lg sm:grid-cols-2">
              <Field label="City" error={errors.city} required>
                <Input autoComplete="address-level2" value={d.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="State" error={errors.state} required>
                <Select value={d.state} onChange={(e) => set('state', e.target.value)}>
                  <option value="">Choose…</option>
                  {STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Industry or business category" helper="For example: steel re-rolling, infrastructure, castings." error={errors.industry} required>
              <Input value={d.industry} onChange={(e) => set('industry', e.target.value)} />
            </Field>
            <fieldset>
              <legend className="text-label-md text-text-strong">
                Materials of interest <span className="text-danger" aria-hidden>*</span>
              </legend>
              <p className="text-caption text-text-secondary">Used to suggest relevant lots.</p>
              <div className="mt-xs flex flex-wrap gap-xs">
                {MATERIALS.map((m) => {
                  const on = d.materials.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('materials', on ? d.materials.filter((x) => x !== m) : [...d.materials, m])}
                      className={
                        'h-8 rounded-full border px-sm text-caption ' + (on ? 'border-primary bg-primary-container text-primary' : 'border-border-control bg-surface text-text')
                      }
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              {errors.materials && <p className="mt-1 text-caption text-danger">{errors.materials}</p>}
            </fieldset>
          </>
        )}

        {d.step === 3 && (
          <>
            {(
              [
                ['Account', 1, [['Name', d.name], ['Email', AUTH_ENABLED ? (auth?.email ?? '') : d.email], ['Mobile', d.phone]]],
                ['Business', 2, [['Company', d.companyName], ['Business type', d.businessType], ['Location', [d.city, d.state].filter(Boolean).join(', ')], ['Industry', d.industry], ['Materials', d.materials.join(', ')]]],
              ] as const
            ).map(([title, step, rows]) => (
              <Card key={title} className="flex flex-col gap-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-h3 text-text-strong">{title}</h2>
                  <button type="button" onClick={() => go(step)} className="text-label-md text-primary underline">
                    Edit
                  </button>
                </div>
                <dl className="grid gap-xs text-body-md sm:grid-cols-[160px_1fr]">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-text-secondary">{k}</dt>
                      <dd className={v ? 'text-text-strong' : 'text-danger'}>{v || 'Missing'}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
            <Card className="flex flex-col gap-xs bg-surface-muted">
              <StatusBadge kind="neutral" className="self-start">
                Business review needed
              </StatusBadge>
              <p className="text-body-md text-text">
                Next you’ll add your business details and documents (PAN, GST if registered, address proof). A Bid ON reviewer checks them; you can browse
                auctions meanwhile, and pay EMDs and bid once approved.
              </p>
            </Card>
            {Object.keys(incomplete).length > 0 && (
              <Banner tone="warning" title="A few details are missing">
                {Object.values(incomplete).join(' ')}
              </Banner>
            )}
          </>
        )}

        <div
          className="sticky bottom-0 -mx-4 flex justify-between gap-sm border-t border-border bg-canvas px-4 py-sm md:-mx-lg md:px-lg"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          {d.step > 1 ? (
            <Button variant="ghost" onClick={() => go((d.step - 1) as 1 | 2)} disabled={busy}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => router.push('/sign-in')}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            {d.step === 3 ? 'Create buyer account' : 'Continue'}
          </Button>
        </div>
      </form>
    </Container>
  );
}
