'use client';

import { useState } from 'react';
import type { CategoryId, SellerRegistration } from '@auctionit/domain';
import { CATEGORIES, validateEmail } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, Field, Input, Select, StatusBadge } from '@/components/ui';
import { useData, type DsError } from '@/data';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { DEMO_CONTROLS } from '@/lib/flags';

const BUSINESS_TYPES = ['Steel processor', 'Fabricator', 'Manufacturer with surplus', 'Smelter', 'Demolition contractor', 'Scrap trader'];
const STATES = ['Chhattisgarh', 'Delhi NCR', 'Gujarat', 'Jharkhand', 'Karnataka', 'Maharashtra', 'Odisha', 'Punjab', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];
const EMPTY: SellerRegistration = { name: '', companyName: '', businessType: '', yard: '', city: '', state: '', categories: [], email: '', phone: '' };

/** SPEC §12.1 — short, no documents; the status says documents weren't checked, never a verification claim. */
export function SellerOnboarding() {
  const { ds } = useData();
  const { session, signInAs } = useSession();
  const [f, setF] = useState<SellerRegistration>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof SellerRegistration, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DsError | null>(null);

  const set = <K extends keyof SellerRegistration>(k: K, v: SellerRegistration[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit() {
    const e: typeof errors = {};
    if (!f.name.trim()) e.name = 'Enter your name.';
    if (!f.companyName.trim()) e.companyName = 'Enter your company name.';
    if (!f.businessType) e.businessType = 'Choose the type of business.';
    if (!f.yard.trim()) e.yard = 'Enter the yard or plant where material is stored.';
    if (!f.city.trim()) e.city = 'Enter the city.';
    if (!f.state) e.state = 'Choose the state.';
    if (f.categories.length === 0) e.categories = 'Choose at least one material you sell.';
    const em = validateEmail(f.email);
    if (em) e.email = em;
    if (!/^\+?[\d\s-]{10,15}$/.test(f.phone.trim())) e.phone = 'Enter a 10-digit mobile number, for example 98765 43210.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFailure(null);
    const r = await ds.registerSeller(f);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === 'duplicate_email') setErrors({ email: r.error.what });
      return setFailure(r.error);
    }
    signInAs({ role: 'seller', userId: r.data.user.id }, '/seller/dashboard?welcome=1');
  }

  return (
    <Container className="max-w-[640px]">
      <p className="text-overline uppercase text-text-secondary">Sell surplus</p>
      <h1 className="text-h1 text-text-strong">Create a seller account</h1>
      <p className="mt-1 text-body-lg text-text-secondary">A few details so buyers know who they’re dealing with.</p>

      <div className="mt-lg flex flex-col gap-md">
        {DEMO_CONTROLS && session.role === 'guest' && (
          <Banner tone="info" title="Just exploring?" action={<Button onClick={() => signInAs(demoSessionFor('seller'))}>Continue as demo seller</Button>}>
            Use the sample Shree Balaji Steels account instead.
          </Banner>
        )}
        {failure && (
          <Banner tone="danger" title={failure.what} action={failure.kind === 'network' ? <Button onClick={submit}>Try again</Button> : undefined}>
            {failure.next} {failure.kind === 'network' && 'Your entries are kept.'}
          </Banner>
        )}
      </div>

      <form
        noValidate
        className="mt-lg flex flex-col gap-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Your name" error={errors.name} required>
          <Input autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Company name" error={errors.companyName} required>
          <Input autoComplete="organization" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
        </Field>
        <Field label="Business type" error={errors.businessType} required>
          <Select value={f.businessType} onChange={(e) => set('businessType', e.target.value)}>
            <option value="">Choose…</option>
            {BUSINESS_TYPES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="Yard or operating location" helper="Where buyers will lift material. New lots start with this." error={errors.yard} required>
          <Input value={f.yard} onChange={(e) => set('yard', e.target.value)} placeholder="Plot 12, MIDC Hingna" />
        </Field>
        <div className="grid gap-lg sm:grid-cols-2">
          <Field label="City" error={errors.city} required>
            <Input value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State" error={errors.state} required>
            <Select value={f.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">Choose…</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="text-label-md text-text-strong">
            Materials you sell <span className="text-danger" aria-hidden>*</span>
          </legend>
          <div className="mt-xs flex flex-wrap gap-xs">
            {CATEGORIES.map((c) => {
              const on = f.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('categories', on ? f.categories.filter((x) => x !== c.id) : [...f.categories, c.id as CategoryId])}
                  className={'h-8 rounded-full border px-sm text-caption ' + (on ? 'border-primary bg-primary-container text-primary' : 'border-border-control bg-surface text-text')}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {errors.categories && <p className="mt-1 text-caption text-danger">{errors.categories}</p>}
        </fieldset>
        <div className="grid gap-lg sm:grid-cols-2">
          <Field label="Work email" error={errors.email} required>
            <Input type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Mobile number" error={errors.phone} required>
            <Input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" />
          </Field>
        </div>
        <Card className="flex flex-col gap-xs bg-surface-muted">
          <StatusBadge kind="neutral" className="self-start">
            Verification: documents not checked
          </StatusBadge>
          <p className="text-body-md text-text">Your business is active straight away. Business and GST documents aren’t checked yet — document verification isn’t available.</p>
        </Card>
        <div className="flex flex-wrap justify-between gap-sm">
          <ButtonLink href="/sign-in?as=seller" variant="ghost">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="primary" loading={busy}>
            Create seller account
          </Button>
        </div>
      </form>
    </Container>
  );
}
