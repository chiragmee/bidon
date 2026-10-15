import type { Page } from '@playwright/test';
import { action, expect, PNG, test } from './fixtures';

/** Follows docs/DEMO_SCRIPT.md click for click, so the script can't drift from the app. */
test.describe.configure({ mode: 'serial' });

async function switchRole(page: Page, role: 'Buyer' | 'Seller' | 'Operations') {
  await page.getByRole('button', { name: /Viewing as/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${role}`) }).click();
}

test('demo script, acts 1–7', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, 'the script is presented at laptop width');
  test.setTimeout(90_000);

  // Step 0: reset demo data.
  await page.goto('/');
  await page.getByRole('button', { name: /Viewing as/ }).click();
  await page.getByRole('menuitem', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog', { name: 'Reset demo data?' }).getByRole('button', { name: 'Reset demo data' }).click();

  // 1. Landing.
  await expect(page.getByRole('heading', { name: /Lot Assurance: the auction stays the same/ })).toBeVisible();

  // 2. Buyer looks at an assured lot.
  await page.getByRole('button', { name: 'Explore as Buyer' }).click();
  await page.getByRole('link', { name: 'Auctions', exact: true }).first().click();
  await page.getByLabel('Lot Assurance only').check();
  await page.getByRole('link', { name: /HMS 1 & 2 steel scrap/ }).click();
  const la = page.getByRole('region', { name: 'Lot Assurance' });
  for (const t of ['Seller declared', 'Evidence attached', 'Confirmed at lifting', 'Agreed tolerance', 'If the lot is outside tolerance', 'How to claim']) {
    await expect(la.getByText(t).first()).toBeVisible();
  }

  // 3. EMD paid offline: the buyer reports it, the seller confirms receipt, then bidding.
  await action(page, 'Pay EMD to bid').click();
  const emd = page.getByRole('dialog', { name: 'Pay the EMD, then report it' });
  await emd.getByLabel(/UTR number/).fill('UTR000123456');
  await emd.getByLabel(/Paid from/).fill('Vardhan Infra Projects Pvt Ltd');
  await emd.getByRole('button', { name: 'Report EMD payment' }).click();
  await page.getByRole('dialog', { name: 'EMD payment reported' }).getByRole('button', { name: 'Done' }).click();
  await switchRole(page, 'Seller');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).filter({ visible: true }).first().click();
  const row = page.getByRole('listitem', { name: 'EMD from Vardhan Infra Projects Pvt Ltd' });
  await row.getByRole('button', { name: 'Confirm receipt' }).click();
  await expect(page.getByText('EMD from Vardhan Infra Projects Pvt Ltd confirmed.')).toBeVisible();
  await expect(row).toHaveCount(0); // checked off the dashboard list
  await switchRole(page, 'Buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await action(page, 'Place bid').click();
  await page.getByRole('button', { name: 'Review bid' }).click();
  await page.getByRole('button', { name: 'Confirm bid' }).click();
  await expect(page.getByText('Bid placed: ₹35,000/MT')).toBeVisible();
  await expect(page.getByText('You’re the highest bidder').first()).toBeVisible();

  // 4. Win, pay, lift, measure.
  await switchRole(page, 'Operations');
  await page.getByRole('button', { name: /Close demo auction now/ }).filter({ visible: true }).click();
  await page.getByRole('button', { name: /Close auction/ }).click();
  await switchRole(page, 'Buyer');
  await action(page, 'Go to your transaction').click();
  const balance = page.getByRole('region', { name: 'Balance payment' });
  await balance.getByLabel(/UTR number/).fill('UTR-BALANCE-0001');
  await balance.getByLabel(/Paid from/).fill('Vardhan Infra Projects Pvt Ltd');
  await balance.getByRole('button', { name: 'Report balance payment' }).click();
  await expect(balance.getByText('Reported. Waiting for the seller to confirm receiving it')).toBeVisible();
  await switchRole(page, 'Seller');
  await page.getByRole('button', { name: 'Confirm receipt of ₹13,00,000' }).click();
  await expect(page.getByRole('region', { name: 'Balance payment' }).getByText('Receipt confirmed by seller')).toBeVisible();
  await switchRole(page, 'Buyer');
  await page.getByLabel(/Vehicle number/).fill('MH 04 GP 8812');
  await page.getByRole('button', { name: 'Propose lifting date' }).click();
  await expect(page.getByText('Waiting for the seller to confirm.')).toBeVisible();
  await switchRole(page, 'Seller');
  await page.getByRole('button', { name: 'Confirm lifting date' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm lifting date' }).click();
  await expect(page.getByText(/Lifting date confirmed/).first()).toBeVisible();
  await switchRole(page, 'Buyer');
  const wb = page.getByRole('region', { name: 'Quantity — weighbridge measurement' });
  await wb.getByLabel(/Ticket reference/).fill('WB-2026-0001');
  await wb.getByLabel(/Gross weight/).fill('54.2');
  await wb.getByLabel(/Tare weight/).fill('15.6');
  await page.getByRole('group', { name: 'Weighbridge ticket' }).getByLabel('Choose files').setInputFiles({ ...PNG, name: 'ticket.png' });
  await expect(page.getByText('1 file attached')).toBeVisible();
  await wb.getByRole('button', { name: 'Record measurement' }).click();
  await expect(page.getByText('Refund due to the buyer: ₹49,000.')).toBeVisible();

  // 5. Material is off → claim.
  const cond = page.getByRole('region', { name: 'Condition — visual check' });
  await cond.getByLabel(/Observed contamination/).fill('14');
  await expect(cond.getByText('Outside tolerance — 6.0% over the 8.0% limit')).toBeVisible();
  const photos = page.getByRole('group', { name: 'Timestamped lifting photos' });
  await photos.getByLabel('Choose files').setInputFiles(PNG);
  await expect(photos.getByText('1 file attached')).toBeVisible();
  await cond.getByRole('button', { name: 'Record condition check' }).click();
  await action(page, 'Raise assurance claim').click();
  await expect(page.getByText('All conditions met — you can submit.')).toBeVisible();
  await page.getByLabel(/What you observed/).fill('14% slag below the top layer');
  await page.getByLabel(/Short explanation/).fill('Found while loading the middle of the pile.');
  await page.getByText(/Deduct ₹81,060/).click();
  await page.getByRole('button', { name: 'Review and submit claim' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit claim' }).click();
  await expect(page).toHaveURL(/\/transactions\/TX-2000$/);

  // 6. Operations handles the exception.
  await switchRole(page, 'Operations');
  await page.getByRole('link', { name: 'Operations', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('link', { name: 'Review CLM-1042-01' }).click();
  for (const col of ['Seller declaration', 'Lifting and buyer evidence', 'Seller’s position']) await expect(page.getByRole('region', { name: col })).toBeVisible();
  await page.getByText('Approve price adjustment').click();
  await expect(page.getByText('Deduct ₹83,376 from the price')).toBeVisible();
  await page.getByLabel(/Reason for the decision/).fill('Lifting photos show slag below the top layer; 14% exceeds the 8% limit.');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision recorded', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audit trail' })).toBeVisible();

  // 7. Seller side and the metric.
  await switchRole(page, 'Seller');
  await expect(page).toHaveURL(/\/seller\/dashboard$/); // the claim page isn't open to sellers, so the switch goes home
  // The Ops decision in act 6 resolved TX-1042, so the track record has already moved on.
  await expect(page.getByText('7 completed sales · 2 resolved claims').first()).toBeVisible();
  await page.getByRole('link', { name: 'Create a new lot' }).first().click();
  await expect(page.getByRole('heading', { name: 'Basic details' })).toBeVisible();
  await switchRole(page, 'Operations');
  await page.getByRole('link', { name: 'Operations', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Outcome metrics' })).toBeVisible();
  await expect(page.getByText('Case-study baseline')).toBeVisible();
});
