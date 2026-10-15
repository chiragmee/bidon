import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Real sign-in against local Supabase Auth (docs/PHASE1_MVP.md). Needs E2E_AUTH=1 and:
 *   supabase start (email confirmations on — supabase/config.toml), migrations applied
 *   API on :4100 — DATA_MODE=supabase, local DATABASE_URL, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, SAMPLE_DATA_VISIBLE=false
 *   web on :3000 — NEXT_PUBLIC_DATA_SOURCE=http, NEXT_PUBLIC_API_URL=http://localhost:4100,
 *                  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
 * Emails are read from the local mail catcher (Mailpit).
 */
const ON = process.env.E2E_AUTH === '1';
const MAIL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const stamp = String(Date.now());
const run = Date.now().toString(36);
/** Unique per run: a mobile number and a PAN built from the clock. */
const PHONE = `9${stamp.slice(-9)}`;
const PAN = `AAAPN${stamp.slice(-4)}K`;
const PASSWORD = 'Steel2026!';

/** The newest link in the newest email to `to` whose subject matches. */
async function linkFromEmail(to: string, subject: RegExp): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages: { ID: string; Subject: string }[] };
    const msg = list.messages.find((m) => subject.test(m.Subject));
    if (msg) {
      const full = (await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json()) as { Text: string; HTML: string };
      const url = /https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/.exec(full.HTML.replace(/&amp;/g, '&')) ?? /https?:\/\/[^\s"<>]+verify[^\s"<>]+/.exec(full.Text);
      if (url) return url[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No "${subject}" email for ${to}`);
}

async function signUp(page: Page, email: string, as: 'buyer' | 'seller') {
  await page.goto(`/sign-up?as=${as}`);
  await page.getByLabel(/Work email/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel(/Confirm password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto(await linkFromEmail(email, /confirm/i));
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('real sign-in (Supabase Auth)', () => {
  test.skip(!ON, 'Needs E2E_AUTH=1 with local Supabase Auth, the API on :4100 and the web app in auth mode.');
  test.describe.configure({ mode: 'serial' });
  const buyer = `buyer-${run}@example.com`;
  const reviewer = `reviewer-${run}@example.com`;

  test('no sample accounts or role switching are offered; protected pages need a sign-in', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: /Explore as|Continue as/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Viewing as/ })).toHaveCount(0);
    await page.goto('/buyer/dashboard');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fbuyer%2Fdashboard/);
    await page.goto('/sign-up');
    await expect(page.getByRole('radio')).toHaveCount(2); // buyer or seller — never Operations
  });

  test('sign up as a buyer, verify the email, create the account, and stay signed in', async ({ page }) => {
    await signUp(page, buyer, 'buyer');
    // The verification link signs in and lands on the buyer form; the email comes from the sign-in.
    await expect(page).toHaveURL(/\/onboarding\/buyer$/);
    await expect(page.getByLabel(/Work email/)).toHaveValue(buyer);
    await expect(page.getByLabel(/Password/)).toHaveCount(0);
    await page.getByLabel(/Full name/).fill('Asha Menon');
    await page.getByLabel(/Mobile number/).fill(PHONE);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel(/Company name/).fill(`NewCo ${run}`);
    await page.getByLabel(/Business type/).selectOption('Scrap trader / stockist');
    await page.getByLabel(/^City/).fill('Nagpur');
    await page.getByLabel(/^State/).selectOption('Maharashtra');
    await page.getByLabel(/Industry/).fill('Steel');
    await page.getByRole('button', { name: 'Ferrous / HMS' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Create buyer account' }).click();
    await expect(page).toHaveURL(/\/buyer\/dashboard/);
    await expect(page.getByText('Verify your business to bid')).toBeVisible();
    // Sample data is hidden on the live configuration.
    await page.goto('/auctions');
    await expect(page.getByText('LOT-2025-0891')).toHaveCount(0);
    // The session survives a reload, and role guards hold.
    await page.reload();
    await page.goto('/seller/dashboard');
    await expect(page).toHaveURL(/\/access-denied/);
    await page.goto('/ops/eligibility');
    await expect(page).toHaveURL(/\/access-denied/);
  });

  test('the application uploads documents to private storage; only the owner can open them', async ({ page, request }) => {
    await signIn(page, buyer);
    await expect(page).toHaveURL(/\/buyer\/dashboard/);
    await page.goto('/account');
    await page.getByLabel(/Type of business/).selectOption('proprietorship');
    await page.getByLabel(/Legal name/).fill(`NewCo ${run}`);
    await page.getByLabel(/Proprietor’s PAN/).fill(PAN);
    await page.getByRole('textbox', { name: /^Registered address/ }).fill('Plot 4, MIDC Hingna, Nagpur 440016');
    await page.getByRole('textbox', { name: /^Authorised representative/ }).fill('Asha Menon');
    await page.getByLabel(/Their designation/).fill('Proprietor');
    for (const doc of ['PAN card', 'Constitution document', 'Registered address proof', 'Authorised representative’s photo ID']) {
      await page.getByLabel(`Upload ${doc}`).setInputFiles({ name: `${doc}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test\n') });
      await expect(page.getByText(`Uploaded: ${doc}.pdf`)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Under review').first()).toBeVisible();
    // Bucket objects aren't public: the storage URL without a signature is refused.
    const res = await request.get('http://127.0.0.1:54321/storage/v1/object/public/account-documents/anything.pdf');
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('a reviewer is granted by the admin script (never at sign-up) and approves the application', async ({ page }) => {
    await signUp(page, reviewer, 'buyer');
    execFileSync('pnpm', ['--filter', '@auctionit/api', 'grant:reviewer', reviewer, 'Riya Reviewer'], { env: { ...process.env, DATABASE_URL: DB }, stdio: 'pipe' });
    await page.context().clearCookies();
    await signIn(page, reviewer);
    await expect(page).toHaveURL(/\/ops$/);
    // Operations has no early close on the live site.
    await page.goto('/ops/auctions');
    await expect(page.getByRole('heading', { name: 'Auctions and results' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Close now/ })).toHaveCount(0);
    await page.goto('/ops/eligibility');
    await page.getByRole('link', { name: new RegExp(`NewCo ${run}`) }).click();
    // Documents open through a short-lived signed link: capture it and fetch the private file with it.
    await page.evaluate(() => {
      const w = window as unknown as { __opened: string[] };
      w.__opened = [];
      window.open = (u?: string | URL) => (w.__opened.push(String(u)), null);
    });
    await page.getByRole('button', { name: /Open PAN card\.pdf/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(1);
    const signed = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened[0]!);
    expect(signed).toMatch(/\/storage\/v1\/object\/sign\/account-documents\/.+token=/);
    const file = await page.request.get(signed);
    expect(file.status()).toBe(200);
    expect((await file.body()).toString().startsWith('%PDF')).toBe(true);
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/approved by Riya Reviewer/)).toBeVisible();
  });

  test('sign out, forgotten password, reset, sign in with the new password', async ({ page }) => {
    test.info().annotations.push({ type: 'expects-auth-400' });
    await signIn(page, buyer);
    await expect(page).toHaveURL(/\/buyer\/dashboard/);
    await expect(page.getByText('Verify your business to bid')).toHaveCount(0); // approved by the reviewer
    await page.getByRole('button', { name: /Account menu|Buyer/ }).first().click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('button', { name: /Account menu|Buyer/ })).toHaveCount(0);
    await page.goto('/buyer/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);

    await signIn(page, buyer, 'wrong-password-1');
    await expect(page.getByText('The email or password is wrong.')).toBeVisible();

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(buyer);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.goto(await linkFromEmail(buyer, /reset/i));
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await page.getByLabel(/^New password/).fill('Copper2027!x');
    await page.getByLabel(/Confirm new password/).fill('Copper2027!x');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page).toHaveURL(/\/sign-in\?reset=1/);
    await signIn(page, buyer, 'Copper2027!x');
    await expect(page).toHaveURL(/\/buyer\/dashboard/);
  });
});
