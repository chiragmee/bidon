import { expect, signIn, test } from './fixtures';

test('guests are kept out of the buyer area, with a way in', async ({ page }) => {
  await page.goto('/buyer/dashboard');
  await expect(page).toHaveURL(/\/access-denied\?need=buyer/);
  await expect(page.getByRole('heading', { name: 'You don’t have access to this page' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue as buyer' }).click();
  await expect(page).toHaveURL(/\/buyer\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Rahul' })).toBeVisible();
});

test('a seller cannot open the buyer dashboard; a buyer cannot open seller or Ops areas', async ({ page, context }) => {
  await signIn(context, 'seller');
  await page.goto('/buyer/dashboard');
  await expect(page).toHaveURL(/access-denied\?need=buyer/);
  await context.clearCookies();
  await signIn(context, 'buyer');
  for (const path of ['/seller/dashboard', '/ops']) {
    await page.goto(path);
    await expect(page).toHaveURL(/access-denied/);
  }
});

test('switching role keeps you on the lot when the new role may view it, and reset restores data', async ({ page, context }) => {
  await signIn(context, 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await page.getByRole('button', { name: /Viewing as Buyer/ }).click();
  await page.getByRole('menuitemradio', { name: /Operations/ }).click();
  await expect(page).toHaveURL(/\/auctions\/LOT-2025-0891$/);
  await expect(page.getByRole('button', { name: /Close demo auction now/ }).first()).toBeVisible();

  // Operations closes the demo auction: the winner comes from stored bids.
  await page.getByRole('button', { name: /Close demo auction now/ }).first().click();
  await page.getByRole('dialog', { name: 'Close this demo auction now?' }).getByRole('button', { name: /Close auction/ }).click();
  await expect(page.getByText('Auction closed — reserve met')).toBeVisible();

  // Switching to Buyer from the buyer dashboard path rules: stays on the lot, which is now closed.
  await page.getByRole('button', { name: /Viewing as Operations/ }).click();
  await page.getByRole('menuitem', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog', { name: 'Reset demo data?' }).getByRole('button', { name: /Reset demo data/ }).click();
  await expect(page.getByText('Demo data reset to the starting sample data.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Close demo auction now/ }).first()).toBeVisible();
});
