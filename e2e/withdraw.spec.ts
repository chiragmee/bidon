import { expect, PNG, signIn, switchTo, test } from './fixtures';

/** D-104: a seller adds photos to a live auction, then takes it down with a reason; buyers see why. */
test('a seller adds photos to a live auction, then takes it down; bidders are told and can’t bid', async ({ page }) => {
  await signIn(page.context(), 'seller');
  await page.goto('/seller/lots/LOT-2025-0891');
  const manage = page.getByRole('heading', { name: 'Manage this auction' }).locator('..');
  await expect(manage).toBeVisible();

  const g = page.getByRole('group', { name: 'Add photos or videos' });
  await g.getByLabel('Choose files').setInputFiles(PNG);
  await page.getByRole('button', { name: 'Add 1 file to the lot' }).click();
  await expect(page.getByText('1 file added to the lot.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Take down auction' }).click();
  const dialog = page.getByRole('dialog', { name: 'Take this auction down?' });
  await dialog.getByLabel(/Reason/).fill('short');
  await dialog.getByRole('button', { name: 'Take down auction' }).click();
  await expect(dialog.getByText(/at least 10 characters/)).toBeVisible();
  await dialog.getByLabel(/Reason/).fill('The material is needed back at our own plant.');
  await dialog.getByRole('button', { name: 'Take down auction' }).click();
  await expect(page.getByText('Auction taken down. Bidders have been told.').first()).toBeVisible();
  await expect(page.getByText('Withdrawn by seller').first()).toBeVisible();
  await expect(page.getByText(/You took this auction down/)).toBeVisible();

  // A buyer with an EMD on the lot (Meera) sees the reason and no bid button.
  await switchTo(page, 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await expect(page.getByText(/The seller took this auction down: “The material is needed back at our own plant.”/).locator("visible=true").first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Place bid/ })).toHaveCount(0);
});
