import { test as base } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

/**
 * The live deployment's configuration: web in http mode with real sign-in (presenter controls off, Supabase URL and
 * anon key set) against an API whose database isn't sample-friendly (controls off, sample data hidden). Runs only with
 * E2E_LIVE_CONFIG=1 and that stack (same one as e2e/auth.spec.ts) — see docs/PHASE1_MVP.md "Checks".
 */
const LIVE = process.env.E2E_LIVE_CONFIG === '1';
const API = process.env.E2E_LIVE_API_URL ?? 'http://localhost:4100';

test.describe('live configuration: no presenter controls or demo presentation', () => {
  test.skip(!LIVE, 'Needs E2E_LIVE_CONFIG=1 and the web app in http mode without presenter controls.');

  test('guest pages carry no demo pill, demo entry section or placeholder', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Live and upcoming auctions' })).toBeVisible();
    await expect(page.getByText(/Demo Mode|Demo access|Demo environment|placeholder/)).toHaveCount(0);
    await expect(page).not.toHaveTitle(/demo/i);
    await expect(page.getByText(/Bid ON doesn’t collect or move money/)).toBeVisible();
    // Real sign-in: email and password, no sample accounts.
    await page.goto('/sign-in');
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByText(/demo|sample account/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Explore as|Continue as/ })).toHaveCount(0);
  });

  test('the sample-account cookie is ignored: protected pages need a real sign-in', async ({ page, context }) => {
    await signIn(context, 'ops');
    await page.goto('/ops/auctions');
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test('the component gallery is not published', async ({ page }) => {
    test.info().annotations.push({ type: 'expects-404' });
    const res = await page.goto('/dev/components');
    expect(res?.status()).toBe(404);
  });

  test('the API refuses presenter controls and ignores the sample-account header', async () => {
    expect((await fetch(`${API}/demo/reset`, { method: 'POST' })).status).toBe(403);
    const close = await fetch(`${API}/lots/LOT-2025-0891/close`, { method: 'POST', headers: { 'x-demo-session': 'ops:U-DEVENDRA' } });
    expect(close.status).toBe(401);
    expect((await fetch(`${API}/users/exists?email=rahul.sharma%40vardhan.example`)).status).toBe(403);
  });
});

// Not the shared fixture: aborted requests are logged as console errors on purpose here.
base('live configuration: an unreachable API shows an error, never sample data', async ({ page }) => {
  base.skip(!LIVE, 'Needs E2E_LIVE_CONFIG=1.');
  await page.route(`${API}/**`, (route) => route.abort());
  await page.goto('/auctions');
  await base.expect(page.getByText('Can’t reach Bid ON right now')).toBeVisible({ timeout: 15_000 });
  await base.expect(page.getByText(/Showing sample data/)).toHaveCount(0);
});
