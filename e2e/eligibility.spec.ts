import type { Page } from '@playwright/test';
import { action, expect, signIn, test } from './fixtures';

const PDF = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test document\n') });

/** A new buyer registers (browser demo mode: no password sign-in; the live site uses Supabase Auth). */
async function registerBuyer(page: Page) {
  await page.goto('/onboarding/buyer');
  await page.getByLabel(/Full name/).fill('Asha Menon');
  await page.getByLabel(/Work email/).fill('asha@newco.example');
  await page.getByLabel(/Mobile number/).fill('98765 43210');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(/Company name/).fill('NewCo Metals');
  await page.getByLabel(/Business type/).selectOption('Scrap trader / stockist');
  await page.getByLabel(/^City/).fill('Nagpur');
  await page.getByLabel(/^State/).selectOption('Maharashtra');
  await page.getByLabel(/Industry/).fill('Steel re-rolling');
  await page.getByRole('button', { name: 'Ferrous / HMS' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Create buyer account' }).click();
  await expect(page).toHaveURL(/\/buyer\/dashboard/);
}

test('eligibility: a new buyer applies with documents, a reviewer approves, then the buyer can pay an EMD', async ({ page, context }) => {
  await registerBuyer(page);
  const cookies = await context.cookies();
  const session = decodeURIComponent(cookies.find((c) => c.name === 'auctionit_session')!.value);

  // Pending buyers browse but can't pay an EMD or bid.
  await page.goto('/auctions/LOT-2025-0891');
  await expect(page.getByText('Verify your business to pay the EMD and bid.').filter({ visible: true }).first()).toBeVisible();
  await action(page, 'Verify your business').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('Application not submitted').first()).toBeVisible();

  // Submitting too early lists what's missing.
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText(/The application is missing/)).toBeVisible();

  await page.getByLabel(/Type of business/).selectOption('private_limited');
  await page.getByLabel(/Legal name/).fill('NewCo Metals Private Limited');
  await page.getByLabel(/Business PAN/).fill('AABCN1234F');
  await page.getByLabel(/GSTIN/).fill('27AABCN1234F1Z5');
  await page.getByLabel(/^CIN/).fill('U27100MH2010PTC123456');
  await page.getByRole('textbox', { name: /^Registered address/ }).fill('Plot 4, MIDC Hingna, Nagpur 440016');
  await page.getByRole('textbox', { name: /^Authorised representative/ }).fill('Asha Menon');
  await page.getByLabel(/Their designation/).fill('Director');
  for (const doc of ['PAN card', 'Constitution document', 'Registered address proof', 'Authorised representative’s photo ID', 'Authorisation letter or board resolution']) {
    await page.getByLabel(`Upload ${doc}`).setInputFiles(PDF(`${doc}.pdf`));
    await expect(page.getByText(`Uploaded: ${doc}.pdf`)).toBeVisible();
  }
  // Typed details survive the uploads.
  await expect(page.getByLabel(/Business PAN/)).toHaveValue('AABCN1234F');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Under review').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);

  // An internal reviewer asks for more information, then approves the corrected application.
  await signIn(context, 'ops');
  await page.goto('/ops/eligibility');
  await page.getByRole('link', { name: /NewCo Metals Private Limited/ }).click();
  await expect(page.getByText('AABCN1234F', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ask for more information' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText(/Explain what is missing/)).toBeVisible(); // a reason is required
  await page.getByLabel(/Reason \(shown to the applicant\)/).fill('The address proof is older than three months.');
  await page.getByRole('button', { name: 'Ask for more information' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('More information needed').first()).toBeVisible();

  await context.addCookies([{ name: 'auctionit_session', value: encodeURIComponent(session), url: 'http://localhost:3000' }]);
  await page.goto('/account');
  await expect(page.getByText('“The address proof is older than three months.”', { exact: false })).toBeVisible();
  await page.getByLabel('Upload Registered address proof').setInputFiles(PDF('new-address-proof.pdf'));
  await expect(page.getByText('Uploaded: new-address-proof.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Under review').first()).toBeVisible();

  await signIn(context, 'ops');
  await page.goto('/ops/eligibility');
  await page.getByRole('link', { name: /NewCo Metals Private Limited/ }).first().click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/approved by Devendra Nath/)).toBeVisible();

  await context.addCookies([{ name: 'auctionit_session', value: encodeURIComponent(session), url: 'http://localhost:3000' }]);
  await page.goto('/auctions/LOT-2025-0891');
  await expect(action(page, 'Pay EMD to bid')).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText('Your account is approved')).toBeVisible();
});
