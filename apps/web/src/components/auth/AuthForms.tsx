'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { validateEmail } from '@auctionit/domain';
import { Container } from '@/components/layout/Shells';
import { Banner, Button, Card, EmptyState, Field, Input } from '@/components/ui';
import { AUTH_CONFIGURED } from '@/lib/flags';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSession } from '@/lib/SessionProvider';

/** Passwords: at least 8 characters with a letter and a number (Supabase enforces its own minimum too). */
export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use at least one letter and one number.';
  return null;
}

const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);
const origin = () => window.location.origin;

function AuthCard({ overline, title, children, footer }: { overline?: string; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="flex max-w-[480px] flex-col gap-md">
      <div>
        {overline && <p className="text-overline uppercase text-text-secondary">{overline}</p>}
        <h1 className="text-h1 text-text-strong">{title}</h1>
      </div>
      <Card className="flex flex-col gap-md">{children}</Card>
      {footer && <div className="text-body-md text-text-secondary">{footer}</div>}
    </Container>
  );
}

/** Sign-in isn't possible without the Supabase project's URL and public key — say so instead of failing silently. */
function NotConfigured() {
  return (
    <Container>
      <EmptyState icon={MailCheck} headingLevel={1} title="Sign-in isn’t available right now">
        AuctionIT’s sign-in service isn’t configured on this site yet. Please try again later or contact AuctionIT support.
      </EmptyState>
    </Container>
  );
}

const friendly = (message: string) =>
  /invalid login credentials/i.test(message)
    ? 'The email or password is wrong.'
    : /email not confirmed/i.test(message)
      ? 'Your email isn’t verified yet. Open the link we emailed you, then sign in.'
      : /rate limit|too many/i.test(message)
        ? 'Too many attempts. Wait a few minutes and try again.'
        : message;

export function SignInForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshAccount } = useSession();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!AUTH_CONFIGURED) return <NotConfigured />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) return setError(friendly(err.message));
    await refreshAccount(next ?? undefined);
    router.refresh();
  }

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to AuctionIT?{' '}
          <Link href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-primary underline">
            Create an account
          </Link>
        </>
      }
    >
      {params.get('reset') === '1' && <Banner tone="success" title="Password changed">Sign in with your new password.</Banner>}
      {params.get('link') === 'expired' && (
        <Banner tone="warning" title="That link has expired or was already used">
          Sign in if your email is already verified, or request a new password-reset link.
        </Banner>
      )}
      <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
        <Field label="Email" required>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Banner tone="danger" title={error} />}
        <Button variant="primary" type="submit" loading={busy}>
          Sign in
        </Button>
        <Link href="/forgot-password" className="text-label-md text-primary underline">
          Forgot your password?
        </Link>
      </form>
    </AuthCard>
  );
}

export function SignUpForm() {
  const params = useSearchParams();
  const [role, setRole] = useState<'buyer' | 'seller'>(params.get('as') === 'seller' ? 'seller' : 'buyer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!AUTH_CONFIGURED) return <NotConfigured />;

  if (sent) {
    return (
      <Container>
        <EmptyState icon={MailCheck} headingLevel={1} title="Check your email">
          If {sent} isn’t already registered, we’ve sent a link to verify it. Open it on this device to continue — then add your business details.
        </EmptyState>
      </Container>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const em = validateEmail(email);
    if (em) errs.email = em;
    const pw = validatePassword(password);
    if (pw) errs.password = pw;
    if (!pw && confirm !== password) errs.confirm = 'The passwords don’t match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const next = `/onboarding/${role}`;
    const { error: err } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      // The role here only picks the onboarding form; the account's role is fixed when the API creates the profile.
      options: { emailRedirectTo: `${origin()}/auth/confirm?next=${encodeURIComponent(next)}`, data: { intended_role: role } },
    });
    setBusy(false);
    // Supabase doesn't reveal whether the email already exists (no account enumeration); neither do we.
    if (err) return setError(friendly(err.message));
    setSent(email.trim());
  }

  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-primary underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
        <fieldset className="flex flex-col gap-xs">
          <legend className="mb-xs text-label-md text-text-strong">I want to</legend>
          {(
            [
              ['buyer', 'Buy material', 'Bid on industrial scrap and surplus lots.'],
              ['seller', 'Sell material', 'List lots from your yard or plant.'],
            ] as const
          ).map(([value, label, help]) => (
            <label key={value} className="flex cursor-pointer items-start gap-sm rounded-md border border-border-control p-sm has-[:checked]:border-primary has-[:checked]:bg-primary-container">
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-1" />
              <span>
                <span className="block text-label-md text-text-strong">{label}</span>
                <span className="block text-caption text-text-secondary">{help}</span>
              </span>
            </label>
          ))}
          <p className="text-caption text-text-secondary">One account per person and business, as a buyer or a seller. It can’t be switched later.</p>
        </fieldset>
        <Field label="Work email" error={errors.email} required>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" helper="At least 8 characters, with a letter and a number." error={errors.password} required>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" error={errors.confirm} required>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <Banner tone="danger" title={error} />}
        <Button variant="primary" type="submit" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!AUTH_CONFIGURED) return <NotConfigured />;
  if (sent) {
    return (
      <Container>
        <EmptyState icon={MailCheck} headingLevel={1} title="Check your email">
          If an account uses {email.trim()}, we’ve sent a link to choose a new password. It works once and expires within an hour.
        </EmptyState>
      </Container>
    );
  }
  return (
    <AuthCard title="Reset your password">
      <form
        className="flex flex-col gap-md"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const em = validateEmail(email);
          if (em) return setError(em);
          const sb = supabaseBrowser();
          if (!sb) return;
          setBusy(true);
          setError(null);
          const { error: err } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${origin()}/auth/confirm?next=/reset-password` });
          setBusy(false);
          if (err) return setError(friendly(err.message));
          setSent(true);
        }}
      >
        <Field label="Email" required>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && <Banner tone="danger" title={error} />}
        <Button variant="primary" type="submit" loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}

/** Reached from the reset email (the link signs the user in for this purpose only). */
export function ResetPasswordForm() {
  const { auth, signOut } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!AUTH_CONFIGURED) return <NotConfigured />;
  if (!auth?.signedIn) {
    return (
      <Container>
        <EmptyState icon={MailCheck} headingLevel={1} title="This reset link has expired or was already used">
          <Link href="/forgot-password" className="font-medium text-primary underline">
            Request a new link
          </Link>
          .
        </EmptyState>
      </Container>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form
        className="flex flex-col gap-md"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const pw = validatePassword(password);
          if (pw) return setError(pw);
          if (confirm !== password) return setError('The passwords don’t match.');
          const sb = supabaseBrowser();
          if (!sb) return;
          setBusy(true);
          setError(null);
          const { error: err } = await sb.auth.updateUser({ password });
          setBusy(false);
          if (err) return setError(friendly(err.message));
          // Every device signs in again with the new password.
          await signOut('/sign-in?reset=1');
        }}
      >
        <Field label="New password" helper="At least 8 characters, with a letter and a number." required>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" required>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <Banner tone="danger" title={error} />}
        <Button variant="primary" type="submit" loading={busy}>
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}

/**
 * Where an invitation email lands (reviewers are invited by an administrator — D-087). Supabase returns the session
 * in the URL fragment; we start it here, remove the tokens from the address bar, and ask for a password.
 */
export function AcceptInviteForm() {
  const { refreshAccount } = useSession();
  const [state, setState] = useState<'starting' | 'ready' | 'invalid'>('starting');
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    // Never leave tokens in the address bar or history.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      if (hash.get('error_description')) {
        setProblem(hash.get('error_description'));
        return setState('invalid');
      }
      if (access_token && refresh_token) {
        const { error: err } = await sb.auth.setSession({ access_token, refresh_token });
        if (err) {
          setProblem(err.message);
          return setState('invalid');
        }
        return setState('ready');
      }
      // Reloaded after the session started: carry on if signed in.
      const { data } = await sb.auth.getSession();
      setState(data.session ? 'ready' : 'invalid');
    })();
  }, []);

  if (!AUTH_CONFIGURED) return <NotConfigured />;
  if (state === 'starting') {
    return (
      <Container>
        <p role="status" className="text-body-md text-text-secondary">
          Opening your invitation…
        </p>
      </Container>
    );
  }
  if (state === 'invalid') {
    return (
      <Container>
        <EmptyState icon={MailCheck} headingLevel={1} title="This invitation link has expired or was already used">
          {problem ? `${problem}. ` : ''}Ask the AuctionIT administrator to send a new invitation, or{' '}
          <Link href="/sign-in" className="font-medium text-primary underline">
            sign in
          </Link>{' '}
          if you’ve already set your password.
        </EmptyState>
      </Container>
    );
  }
  return (
    <AuthCard overline="Reviewer invitation" title="Choose your password">
      <p className="text-body-md text-text-secondary">You’ve been invited to review accounts on AuctionIT. Set a password to finish — you’ll use it with your email to sign in.</p>
      <form
        className="flex flex-col gap-md"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const pw = validatePassword(password);
          if (pw) return setError(pw);
          if (confirm !== password) return setError('The passwords don’t match.');
          const sb = supabaseBrowser();
          if (!sb) return;
          setBusy(true);
          setError(null);
          const { error: err } = await sb.auth.updateUser({ password });
          if (err) {
            setBusy(false);
            return setError(friendly(err.message));
          }
          await refreshAccount('/ops/eligibility');
        }}
      >
        <Field label="Password" helper="At least 8 characters, with a letter and a number." required>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" required>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <Banner tone="danger" title={error} />}
        <Button variant="primary" type="submit" loading={busy}>
          Set password and continue
        </Button>
      </form>
    </AuthCard>
  );
}
