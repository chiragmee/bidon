import { action, confirmEmd, expect, test } from './fixtures';

// SPEC §22 Journey A, steps 1–7 (steps 8–14 arrive with Phase 5).
test('journey A 1–7: browse, review assurance, pay EMD, bid, see status', async ({ page }) => {
  // 1. Open the marketplace.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Buy and sell industrial scrap/ })).toBeVisible();

  // 2. Browse live lots.
  await page.getByRole('link', { name: 'Browse auctions' }).first().click();
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

  // 5. EMD paid outside Bid ON: where to pay, then report it. A report alone doesn't allow bidding.
  await action(page, 'Pay EMD to bid').click();
  const emd = page.getByRole('dialog', { name: 'Pay the EMD, then report it' });
  await expect(emd.getByText('Shree Balaji Steels').first()).toBeVisible(); // payee from the seller's account
  await expect(emd.getByText(/Bid ON doesn’t collect or check payments/)).toBeVisible();
  await emd.getByRole('button', { name: 'Report EMD payment' }).click();
  await expect(emd.getByText(/Enter the UTR number/)).toBeVisible(); // nothing reported without a reference
  await emd.getByLabel(/UTR number/).fill('UTR000123456');
  await emd.getByLabel(/Paid from/).fill('Vardhan Infra Projects Pvt Ltd');
  await emd.getByRole('button', { name: 'Report EMD payment' }).click();
  await expect(page.getByRole('dialog', { name: 'EMD payment reported' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(action(page, 'EMD reported — awaiting seller')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place bid' })).toHaveCount(0);

  // The seller checks their account and confirms receipt; then the buyer can bid.
  await confirmEmd(page, 'LOT-2025-0891');
  await expect(page.getByText('₹1,00,000 · confirmed by seller').filter({ visible: true }).first()).toBeVisible();
  await action(page, 'Place bid').click();

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
