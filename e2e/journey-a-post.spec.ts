import { action, expect, PNG, signIn, switchTo, test, upload } from './fixtures';
import type { Page } from '@playwright/test';

/** Journey A 1–8 compressed: buyer pays EMD and bids ₹35,000; Operations closes the demo auction. */
async function winLot0891(page: Page) {
  await signIn(page.context(), 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await action(page, 'Pay EMD to bid').click();
  await page.getByRole('button', { name: 'Pay ₹1,00,000 (simulated)' }).click();
  await page.getByRole('button', { name: 'Continue to bid' }).click();
  await page.getByRole('button', { name: 'Review bid' }).click();
  await page.getByRole('button', { name: 'Confirm bid' }).click();
  await expect(page.getByText('Bid placed: ₹35,000/MT')).toBeVisible();

  // 8. Operations closes the demo auction; the winner comes from the stored bids.
  await switchTo(page, 'ops');
  await page.getByRole('button', { name: /Close demo auction now/ }).filter({ visible: true }).click();
  await page.getByRole('dialog', { name: 'Close this demo auction now?' }).getByRole('button', { name: /Close auction/ }).click();
  await expect(page.getByText('Auction closed — reserve met')).toBeVisible();

  // 9. The winner enters the transaction.
  await switchTo(page, 'buyer');
  await action(page, 'Go to your transaction').click();
  await expect(page).toHaveURL(/\/transactions\/TX-2000$/);
}

/** Steps 10–12: pay, schedule (seller confirms), weighbridge + condition as separate records. */
async function payLiftAndCheck(page: Page, contamination: string) {
  await page.getByRole('button', { name: 'Pay ₹13,00,000 balance (simulated)' }).click();
  await page.getByRole('dialog', { name: 'Pay the balance?' }).getByRole('button', { name: 'Pay balance (simulated)' }).click();
  await expect(page.getByText(/Balance of ₹13,00,000 recorded \(simulated\)/).first()).toBeVisible();

  await page.getByLabel(/Vehicle number/).fill('MH 04 GP 8812');
  await page.getByRole('button', { name: 'Propose lifting date' }).click();
  await expect(page.getByText('Waiting for the seller to confirm.')).toBeVisible();

  await switchTo(page, 'seller');
  await page.getByRole('button', { name: 'Confirm lifting date' }).click();
  await page.getByRole('dialog', { name: 'Confirm the lifting date?' }).getByRole('button', { name: 'Confirm lifting date' }).click();
  await expect(page.getByText(/Lifting date confirmed/).first()).toBeVisible();

  await switchTo(page, 'buyer');
  const wb = page.getByRole('region', { name: 'Quantity — weighbridge measurement' });
  await wb.getByLabel(/Ticket reference/).fill('WB-2026-0001');
  await wb.getByLabel(/Gross weight/).fill('54.2');
  await wb.getByLabel(/Tare weight/).fill('15.6');
  await expect(wb.getByText('Gross − tare = 38.6 MT')).toBeVisible();
  await upload(page, 'Weighbridge ticket', [{ ...PNG, name: 'ticket.png' }]);
  await wb.getByRole('button', { name: 'Record measurement' }).click();
  await expect(wb.getByText('38.6 MT', { exact: true }).first()).toBeVisible();
  await expect(wb.getByText('Confirmed at lifting')).toBeVisible();

  const cond = page.getByRole('region', { name: 'Condition — visual check' });
  await cond.getByLabel(/Observed contamination/).fill(contamination);
  await upload(page, 'Timestamped lifting photos', [PNG]);
  await cond.getByRole('button', { name: 'Record condition check' }).click();
  await expect(cond.getByText(`${Number(contamination).toFixed(1)}% contamination`)).toBeVisible();
}

test('journey A 8–14, complete branch: same final state for buyer, seller and Operations', async ({ page }) => {
  await winLot0891(page);
  await payLiftAndCheck(page, '6');
  await expect(page.getByText('Within tolerance (≤ 8.0%)')).toBeVisible();
  await expect(page.getByText('Refund due to the buyer: ₹49,000 (simulated).')).toBeVisible();

  // 13. Complete.
  await page.getByRole('button', { name: 'Complete transaction' }).click();
  await page.getByRole('dialog', { name: 'Complete this transaction?' }).getByRole('button', { name: 'Complete transaction' }).click();

  // 14. Final state, identical in every role.
  for (const role of ['buyer', 'seller', 'ops'] as const) {
    if (role !== 'buyer') await switchTo(page, role);
    const outcome = page.getByRole('region', { name: 'Outcome' });
    await expect(outcome.getByText('Transaction completed')).toBeVisible();
    await expect(outcome.getByText('38.6 MT')).toBeVisible();
    await expect(outcome.getByText('₹13,51,000')).toBeVisible();
  }
});

test('journey A 13 claim branch → seller disputes → Operations decides (journey C on a live claim)', async ({ page }) => {
  await winLot0891(page);
  await payLiftAndCheck(page, '14');
  await expect(page.getByText('Outside tolerance — 6.0% over the 8.0% limit')).toBeVisible();

  await action(page, 'Raise assurance claim').click();
  await expect(page.getByRole('heading', { name: 'Raise an assurance claim' })).toBeVisible();
  await expect(page.getByLabel(/Observed contamination/)).toHaveValue('14');
  await page.getByLabel(/What you observed/).fill('14% slag below the top layer');
  await page.getByLabel(/Short explanation/).fill('Slag and mud found while loading the middle of the pile.');
  await page.getByText('Deduct ₹81,060', { exact: false }).click();
  await expect(page.getByText('All conditions met — you can submit.')).toBeVisible();
  await page.getByRole('button', { name: 'Review and submit claim' }).click();
  await page.getByRole('dialog', { name: 'Submit this claim?' }).getByRole('button', { name: 'Submit claim' }).click();
  await expect(page).toHaveURL(/\/transactions\/TX-2000$/);
  await expect(page.getByText('Waiting for Shree Balaji Steels to accept or dispute.')).toBeVisible();

  // Seller responds first: dispute with an explanation.
  await switchTo(page, 'seller');
  await page.getByText('Dispute the claim').click();
  await page.getByLabel(/Why you dispute it/).fill('The top layer is standard HMS 1; sweepings came from the next bay.');
  await page.getByRole('button', { name: 'Send response' }).click();
  await page.getByRole('dialog', { name: 'Dispute the claim?' }).getByRole('button', { name: 'Send dispute' }).click();
  await expect(page.getByText('Dispute sent to Operations.').first()).toBeVisible();

  // Operations reviews and records a reasoned decision.
  await switchTo(page, 'ops');
  await page.getByRole('link', { name: 'Review claim' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Claim CLM-2000/ })).toBeVisible();
  await page.getByText('Approve price adjustment').click();
  await page.getByLabel(/Reason for the decision/).fill('Lifting photos show slag through the middle layer; 14% exceeds the 8% limit.');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await page.getByRole('dialog', { name: 'Record this decision?' }).getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('Operations approved a price adjustment')).toBeVisible();

  // Buyer sees the outcome and final value (₹13,51,000 − ₹81,060).
  await switchTo(page, 'buyer');
  await page.goto('/transactions/TX-2000');
  const outcome = page.getByRole('region', { name: 'Outcome' });
  await expect(outcome.getByText('Completed with a Lot Assurance price adjustment')).toBeVisible();
  await expect(outcome.getByText('₹12,69,940')).toBeVisible();
});
