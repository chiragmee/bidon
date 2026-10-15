import { expect, isHttp, signIn, test } from './fixtures';

const KEY = 'auctionit:demo:v2';

test('a lost session asks to sign in again — and keeps what was typed', async ({ page, context }) => {
  test.skip(isHttp, 'removes the account through browser demo storage');
  // A newly registered seller starts a listing…
  await page.goto('/onboarding/seller');
  await page.getByLabel(/Your name/).fill('Kavita Rao');
  await page.getByLabel(/Company name/).fill('Rao Metal Works');
  await page.getByLabel(/Business type/).selectOption('Fabricator');
  await page.getByLabel(/Yard or operating location/).fill('Plot 12, MIDC');
  await page.getByLabel(/^City/).fill('Nagpur');
  await page.getByLabel(/^State/).selectOption('Maharashtra');
  await page.getByRole('button', { name: 'Ferrous / HMS' }).click();
  await page.getByLabel(/Work email/).fill('kavita@raometal.example');
  await page.getByLabel(/Mobile number/).fill('98765 43210');
  await page.getByRole('button', { name: 'Create seller account' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Create auction' }).first().click();
  await page.getByLabel(/Lot title/).fill('Rolled steel offcuts, press shop');
  await page.getByLabel(/Material type or grade/).fill('MS offcuts');

  // …then someone resets the demo data in another tab, removing that account.
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate((k) => localStorage.removeItem(k), KEY);
  await other.close();

  // Typing triggers the autosave; whichever save runs first after the reset meets the lost session.
  await page.getByLabel(/Lot title/).fill('Rolled steel offcuts, press shop A');
  const dialog = page.getByRole('dialog', { name: 'Your session has ended' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue as seller' }).click();
  await expect(dialog).toBeHidden();

  // Same page, same entries; the save now succeeds.
  await expect(page.getByLabel(/Lot title/)).toHaveValue('Rolled steel offcuts, press shop A');
  await expect(page.getByLabel(/Material type or grade/)).toHaveValue('MS offcuts');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await expect(page).toHaveURL(/\/seller\/lots\/LOT-2000\/edit$/);
});

test('unreadable demo data is restored, and the page says so', async ({ page }) => {
  test.skip(isHttp, 'browser demo storage only');
  await page.addInitScript((k) => {
    if (!sessionStorage.getItem('corrupted-once')) {
      localStorage.setItem(k, '{not json');
      sessionStorage.setItem('corrupted-once', '1');
    }
  }, KEY);
  await page.goto('/auctions');
  await expect(page.getByText('Demo data was restored')).toBeVisible();
  await expect(page.getByText('Showing 5 of')).toBeVisible();
});

test.describe('page access by role', () => {
  const PAGES: [string, ('guest' | 'buyer' | 'seller' | 'ops')[]][] = [
    ['/buyer/dashboard', ['buyer']],
    ['/seller/dashboard', ['seller']],
    ['/seller/lots/new', ['seller']],
    ['/ops', ['ops']],
    ['/ops/claims/CLM-1042-01', ['ops']],
    ['/transactions/TX-1042', ['buyer', 'seller', 'ops']],
    ['/auctions/LOT-2025-0891', ['guest', 'buyer', 'seller', 'ops']],
  ];
  for (const role of ['guest', 'buyer', 'seller', 'ops'] as const) {
    test(`as ${role}`, async ({ page, context }) => {
      if (role !== 'guest') await signIn(context, role);
      for (const [path, allowed] of PAGES) {
        await page.goto(path);
        if (allowed.includes(role)) await expect(page, path).not.toHaveURL(/access-denied/);
        else await expect(page, path).toHaveURL(/access-denied/);
      }
    });
  }
});
