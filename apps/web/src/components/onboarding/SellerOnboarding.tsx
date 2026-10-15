'use client';

import { useState } from 'react';
import type { CategoryId, SellerRegistration } from '@auctionit/domain';
import { CATEGORIES, normalisePhone, validateEmail } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, ButtonLink, Card, Field, Input, Select, StatusBadge } from '@/components/ui';
import { useData, type DsError } from '@/data';
import { demoSessionFor } from '@/lib/session';
import { useSession } from '@/lib/SessionProvider';
import { AUTH_ENABLED, DEMO_CONTROLS } from '@/lib/flags';
import { useSignInGate } from './SignInGate';

const BUSINESS_TYPES = ['Steel processor', 'Fabricator', 'Manufacturer with surplus', 'Smelter', 'Demolition contractor', 'Scrap trader'];
const STATES = ['Chhattisgarh', 'Delhi NCR', 'Gujarat', 'Jharkhand', 'Karnataka', 'Maharashtra', 'Odisha', 'Punjab', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];
const EMPTY: SellerRegistration = { name: '', companyName: '', businessType: '', yard: '', city: '', state: '', categories: [], email: '', phone: '' };

/** SPEC §12.1 — short; business documents are collected next, on the account page, for review (docs/PHASE1_MVP.md). */
export function SellerOnboarding() {
  const { ds } = useData();
  const { session, signInAs, auth, refreshAccount } = useSession();
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
    const em = AUTH_ENABLED ? null : validateEmail(f.email);
    if (em) e.email = em;
    if (!normalisePhone(f.phone)) e.phone = 'Enter a 10-digit mobile number, for example 98765 43210.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFailure(null);
    // Live site: the API takes the email from the verified sign-in, not from this form.
    const r = await ds.registerSeller({ ...f, email: auth?.email ?? f.email });
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === 'duplicate_account') setErrors({ email: r.error.what });
      return setFailure(r.error);
    }
    if (AUTH_ENABLED) await refreshAccount('/seller/dashboard?welcome=1');
    else signInAs({ role: 'seller', userId: r.data.user.id }, '/seller/dashboard?welcome=1');
  }

  const signUpFirst = useSignInGate('seller');
  if (signUpFirst) return signUpFirst;

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
            <Input type="email" autoComplete="email" value={AUTH_ENABLED ? (auth?.email ?? '') : f.email} readOnly={AUTH_ENABLED} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Mobile number" error={errors.phone} required>
            <Input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" />
          </Field>
        </div>
        <Card className="flex flex-col gap-xs bg-surface-muted">
          <StatusBadge kind="neutral" className="self-start">
            Business review needed
          </StatusBadge>
          <p className="text-body-md text-text">
            Next you’ll add your business details, bank account and documents (PAN, GST, premises proof). A Bid ON reviewer checks them; you can prepare lots
            meanwhile, and publish once approved.
          </p>
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
