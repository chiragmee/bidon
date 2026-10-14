import { expect, isMobile, test } from './fixtures';

test('filters are functional, synced to the URL, and clearable', async ({ page }) => {
  await page.goto('/auctions');
  if (isMobile(page)) {
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('dialog', { name: 'Filters' }).getByLabel('Lot Assurance only').check();
    await page.getByRole('button', { name: /^Show/ }).click();
  } else {
    await page.getByLabel('Lot Assurance only').check();
  }
  await expect(page).toHaveURL(/assured=1/);
  await expect(page.getByText('Showing 2 of')).toBeVisible();
  await expect(page.getByRole('link', { name: /LOT-2025-0899/ })).toHaveCount(0);

  await page.getByLabel('Search lots').fill('copper');
  await expect(page).toHaveURL(/q=copper/);
  await expect(page.getByRole('heading', { name: 'No lots match these filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).last().click();
  await expect(page.getByText('Showing 5 of')).toBeVisible();
  await expect(page.getByLabel('Search lots')).toHaveValue('');
});

test('a shared filtered URL opens filtered, including closed lots', async ({ page }) => {
  await page.goto('/auctions?status=closed&q=lathe');
  await expect(page.getByRole('link', { name: /LOT-2025-0866/ })).toBeVisible();
  await expect(page.getByText('Unsold').first()).toBeVisible();
});

test('a failed load shows what happened and recovers on retry', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('auctionit:fail-next', 'listLots'));
  await page.goto('/auctions');
  await expect(page.getByText('We couldn’t load auctions.')).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('auctionit:fail-next'));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Showing 5 of')).toBeVisible();
});

test('an unknown lot shows a designed not-found state', async ({ page }) => {
  await page.goto('/auctions/LOT-NOPE');
  await expect(page.getByRole('heading', { name: 'Lot not found' })).toBeVisible();
});
