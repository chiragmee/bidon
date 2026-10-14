import { expect, test } from './fixtures';

test('buyer onboarding: validation, duplicate email, kept values, success', async ({ page }) => {
  await page.goto('/onboarding/buyer');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Enter your full name.')).toBeVisible();

  await page.getByLabel(/Full name/).fill('Asha Menon');
  await page.getByLabel(/Work email/).fill('asha@newco..com');
  await page.getByLabel(/Password/).fill('short');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/two dots in a row/)).toBeVisible();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();

  await page.getByLabel(/Work email/).fill('rahul.sharma@vardhan.example');
  await page.getByLabel(/Password/).fill('steel2026');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();

  await page.getByLabel(/Work email/).fill('asha@newco.example');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible();

  await page.getByLabel(/Company name/).fill('NewCo Metals');
  await page.getByLabel(/Business type/).selectOption('Scrap trader / stockist');
  await page.getByLabel(/^City/).fill('Nagpur');
  await page.getByLabel(/^State/).selectOption('Maharashtra');
  await page.getByLabel(/Industry/).fill('Steel re-rolling');
  await page.getByRole('button', { name: 'Ferrous / HMS' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // Back keeps values.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel(/Company name/)).toHaveValue('NewCo Metals');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByText('Demo-approved (sample status)')).toBeVisible();
  await expect(page.getByText(/No real KYC/)).toBeVisible();
  await page.getByRole('button', { name: 'Create buyer account' }).click();

  await expect(page).toHaveURL(/\/buyer\/dashboard\?welcome=1/);
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible();
  await expect(page.getByText('Your buyer profile is ready (demo-approved)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No active bids' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No transactions in progress' })).toBeVisible();
});

test('entries survive a reload (password excluded)', async ({ page }) => {
  await page.goto('/onboarding/buyer');
  await page.getByLabel(/Full name/).fill('Asha Menon');
  await page.getByLabel(/Work email/).fill('asha@newco.example');
  await page.reload();
  await expect(page.getByText('We kept what you entered')).toBeVisible();
  await expect(page.getByLabel(/Full name/)).toHaveValue('Asha Menon');
  await expect(page.getByLabel(/Password/)).toHaveValue('');
});
