import { test as base } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

/**
 * The live deployment's configuration: NEXT_PUBLIC_DATA_SOURCE=http with presenter controls off
 * (NEXT_PUBLIC_DEMO_CONTROLS unset) against an API with DEMO_CONTROLS_ENABLED off. Runs only with
 * E2E_LIVE_CONFIG=1 and a web server started that way — see docs/PRODUCTION_GAPS.md "Checks".
 */
const LIVE = process.env.E2E_LIVE_CONFIG === '1';
const API = process.env.E2E_LIVE_API_URL ?? 'http://localhost:4100';

test.describe('live configuration: no presenter controls or demo presentation', () => {
  test.skip(!LIVE, 'Needs E2E_LIVE_CONFIG=1 and the web app in http mode without presenter controls.');

  test('guest pages carry no demo pill, demo entry section or placeholder', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Featured lots/ })).toBeVisible();
    await expect(page.getByText(/Demo Mode|Demo access|Demo environment|placeholder/)).toHaveCount(0);
    await expect(page).not.toHaveTitle(/demo/i);
    await expect(page.getByText(/no payment provider is connected yet/)).toBeVisible();
    await page.goto('/sign-in');
    await expect(page.getByText('Password sign-in isn’t available yet.', { exact: false })).toBeVisible();
    await expect(page.getByText(/demo/i)).toHaveCount(0);
  });

  test('buyer: no data reset and no simulated payment failure', async ({ page, context }) => {
    await signIn(context, 'buyer');
    await page.goto('/auctions/LOT-2025-0891');
    await page.getByRole('button', { name: /Viewing as/ }).click();
    const menu = page.getByRole('menu', { name: 'Switch account' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText(/Reset/)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Pay EMD to bid/ }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('No payment provider is connected yet', { exact: false })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Simulate a failed payment/ })).toHaveCount(0);
  });

  test('Operations: auctions can’t be closed early', async ({ page, context }) => {
    await signIn(context, 'ops');
    await page.goto('/ops/auctions');
    await expect(page.getByRole('heading', { name: 'Auctions and results' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Close now/ })).toHaveCount(0);
    await page.goto('/auctions/LOT-2025-0891');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Close demo auction/ })).toHaveCount(0);
  });

  test('the component gallery is not published', async ({ page }) => {
    test.info().annotations.push({ type: 'expects-404' });
    const res = await page.goto('/dev/components');
    expect(res?.status()).toBe(404);
  });

  test('the API refuses presenter controls', async () => {
    expect((await fetch(`${API}/demo/reset`, { method: 'POST' })).status).toBe(403);
    const close = await fetch(`${API}/lots/LOT-2025-0891/close`, { method: 'POST', headers: { 'x-demo-session': 'ops:U-DEVENDRA' } });
    expect(close.status).toBe(403);
  });
});

// Not the shared fixture: aborted requests are logged as console errors on purpose here.
base('live configuration: an unreachable API shows an error, never sample data', async ({ page }) => {
  base.skip(!LIVE, 'Needs E2E_LIVE_CONFIG=1.');
  await page.route(`${API}/**`, (route) => route.abort());
  await page.goto('/auctions');
  await base.expect(page.getByText('Can’t reach AuctionIT right now')).toBeVisible({ timeout: 15_000 });
  await base.expect(page.getByText(/Showing sample data/)).toHaveCount(0);
});
