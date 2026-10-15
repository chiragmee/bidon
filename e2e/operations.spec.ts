import { expect, signIn, switchTo, test } from './fixtures';

test('journey C: Operations reviews the seeded disputed claim and the state updates everywhere', async ({ page }) => {
  await signIn(page.context(), 'ops');
  await page.goto('/ops');
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  await expect(page.getByText('Computed from platform records, including sample data')).toBeVisible();
  await expect(page.getByText('~205 completed of 500 lots/month (case study, not platform data)')).toBeVisible();

  await page.getByRole('link', { name: 'Review CLM-1042-01' }).click();
  for (const col of ['Seller declaration', 'Lifting and buyer evidence', 'Seller’s position']) {
    await expect(page.getByRole('region', { name: col })).toBeVisible();
  }
  await expect(page.getByText(/net 38.6 MT/)).toBeVisible();
  await expect(page.getByText('Outside tolerance by 6 pts')).toBeVisible();

  // A decision needs an outcome and a reason.
  await page.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Choose an outcome.')).toBeVisible();
  await page.getByText('Approve price adjustment').click();
  await page.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Write at least a sentence explaining the decision.')).toBeVisible();
  await page.getByLabel(/Reason for the decision/).fill('Buyer photos at lifting show slag below the top layer; 14% exceeds the 8% limit.');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByRole('dialog', { name: 'Record this decision?' }).getByText(/Deduct ₹83,376/)).toBeVisible();
  await page.getByRole('dialog', { name: 'Record this decision?' }).getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision recorded', { exact: true })).toBeVisible();
  await expect(page.getByText(/Devendra Nath, Operations/).first()).toBeVisible();

  await page.goto('/ops');
  await expect(page.getByRole('heading', { name: 'No open claims' })).toBeVisible();
  await expect(page.getByText('Operations approved a price adjustment').first()).toBeVisible();

  for (const role of ['buyer', 'seller'] as const) {
    await switchTo(page, role);
    await page.goto('/transactions/TX-1042');
    await expect(page.getByRole('region', { name: 'Outcome' }).getByText('Completed with a Lot Assurance price adjustment')).toBeVisible();
    await expect(page.getByText('Price adjustment approved')).toBeVisible();
  }
});

test('Operations marks an overdue transaction defaulted, with a reason', async ({ page }) => {
  await signIn(page.context(), 'ops');
  await page.goto('/transactions/TX-1035');
  await expect(page.getByText('Payment deadline has passed')).toBeVisible();
  await page.getByRole('button', { name: /Mark as defaulted/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Mark this transaction as defaulted?' });
  await dialog.getByRole('button', { name: 'Mark defaulted' }).click();
  await expect(page.getByText('Give a reason for marking this transaction defaulted.')).toBeVisible();
  await dialog.getByLabel(/Reason/).fill('Balance not paid within 72 hours of winning.');
  await dialog.getByRole('button', { name: 'Mark defaulted' }).click();
  await expect(page.getByText('This transaction defaulted')).toBeVisible();
  await expect(page.getByText(/was forfeited under the provisional policy/)).toBeVisible();
});

test('a buyer cannot reach Operations or another party’s transaction', async ({ page }) => {
  await signIn(page.context(), 'buyer');
  await page.goto('/ops/claims/CLM-1042-01');
  await expect(page).toHaveURL(/access-denied/);
  await switchTo(page, 'seller');
  await page.goto('/transactions/TX-1031');
  await expect(page.getByRole('heading', { name: 'Transaction not available' })).toBeVisible();
});
