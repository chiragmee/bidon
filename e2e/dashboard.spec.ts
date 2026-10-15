import { expect, signIn, test } from './fixtures';

test('buyer dashboard shows bids, won lots and one next action per transaction', async ({ page, context }) => {
  await signIn(context, 'buyer');
  await page.goto('/buyer/dashboard');
  await expect(page.getByText(/Next step on TX-1038/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open TX-1038' })).toBeVisible();
  const won = page.getByRole('article', { name: /HMS 2 steel scrap/ });
  await expect(won.getByText(/Next: Pay the balance of ₹8,45,000 and report it/)).toBeVisible();
  const waiting = page.getByRole('article', { name: /Mixed steel scrap/ });
  await expect(waiting.getByText(/Waiting for the seller/)).toBeVisible();
  const claim = page.getByRole('article', { name: /HMS 1 & 2 steel scrap/ });
  await expect(claim.getByText('Claim under review').first()).toBeVisible();
});
