import { action, expect, test } from './fixtures';

// SPEC §22 Journey A, steps 1–7 (steps 8–14 arrive with Phase 5).
test('journey A 1–7: browse, review assurance, pay EMD, bid, see status', async ({ page }) => {
  // 1. Open the marketplace.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Industrial surplus/ })).toBeVisible();

  // 2. Browse live lots.
  await page.getByRole('link', { name: 'Explore auctions' }).first().click();
  await expect(page).toHaveURL(/\/auctions$/);
  await expect(page.getByRole('heading', { name: 'Live and upcoming auctions' })).toBeVisible();
  await expect(page.getByText('Showing 5 of')).toBeVisible();

  // 3. Open the assured HMS lot.
  await page.getByRole('link', { name: /LOT-2025-0891/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'HMS 1 & 2 steel scrap' })).toBeVisible();

  // 4. Declaration, evidence, measurement rule, tolerance and remedy, each with its trust tag.
  const la = page.getByRole('region', { name: 'Lot Assurance' });
  for (const row of ['What the seller declared', 'Evidence attached', 'Checked at lifting', 'Agreed tolerance', 'If the lot is outside tolerance', 'How to claim']) {
    await expect(la.getByText(row, { exact: true }).first()).toBeVisible();
  }
  await expect(la.getByText('Seller declared').first()).toBeVisible();
  await expect(la.getByText('Confirmed at lifting').first()).toBeVisible();
  await expect(la.getByText('Provisional policy').first()).toBeVisible();
  await expect(page.getByText(/net weight at the mutually agreed certified weighbridge/i).first()).toBeVisible();
  await expect(page.getByText(/Verified/)).toHaveCount(0);

  // Guest → sign in as the demo buyer and come back to the lot.
  await action(page, 'Sign in to bid').click();
  await page.getByRole('button', { name: 'Continue as buyer' }).click();
  await expect(page).toHaveURL(/\/auctions\/LOT-2025-0891$/);

  // 5. Simulated EMD — failure first, then success.
  await action(page, 'Pay EMD to bid').click();
  const emd = page.getByRole('dialog', { name: 'Pay EMD to start bidding' });
  await expect(emd.getByText('No payment provider is connected yet — the EMD is recorded and no money is charged.')).toBeVisible();
  await emd.getByRole('button', { name: /Simulate a failed payment/ }).click();
  await expect(page.getByRole('dialog', { name: 'Payment failed' }).getByText(/Nothing was charged/)).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Pay ₹1,00,000 (simulated)' }).click();
  await expect(page.getByRole('dialog', { name: 'EMD recorded' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to bid' }).click();

  // 6. Place a valid bid (minimum prefilled), with a confirm step.
  const bid = page.getByRole('dialog', { name: 'Place your bid' });
  await expect(bid.getByLabel(/Your bid per MT/)).toHaveValue('35000');
  await bid.getByRole('button', { name: 'Review bid' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm your bid' });
  await expect(confirm.getByText(/can’t be withdrawn/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Confirm bid' }).click();

  // 7. Updated bid status, on the page and on the dashboard.
  await expect(page.getByText('Bid placed: ₹35,000/MT')).toBeVisible();
  await expect(page.getByText('You’re the highest bidder').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'You Highest' })).toBeVisible();
  await expect(action(page, 'Place bid')).toBeVisible();

  await page.goto('/buyer/dashboard');
  const row = page.getByRole('row', { name: /LOT-2025-0891/ }).or(page.getByRole('link', { name: /HMS 1 & 2 steel scrap.*Leading/ }));
  await expect(row.first()).toContainText('Leading');
});
