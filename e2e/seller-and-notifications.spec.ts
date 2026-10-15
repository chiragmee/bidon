import { expect, PNG, signIn, switchTo, test, isHttp } from './fixtures';

test('journey B 10: the seller views a transaction and confirms lifting; the buyer is notified', async ({ page }) => {
  await signIn(page.context(), 'seller');
  await page.goto('/transactions/TX-1045');
  await expect(page.getByText('Buyer: Vardhan Infra Projects Pvt Ltd')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm lifting date' }).click();
  await page.getByRole('dialog', { name: 'Confirm the lifting date?' }).getByRole('button', { name: 'Confirm lifting date' }).click();
  await expect(page.getByText('Lifting date confirmed. The buyer has been notified.').first()).toBeVisible();
  await expect(page.getByText('Lifting scheduled', { exact: true }).first()).toBeVisible();

  await switchTo(page, 'buyer');
  await page.goto('/buyer/dashboard');
  await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
  await page.getByRole('link', { name: /Lifting confirmed for TX-1045/ }).click();
  await expect(page).toHaveURL(/\/transactions\/TX-1045$/);
  await expect(page.getByRole('region', { name: 'Quantity — weighbridge measurement' })).toBeVisible();
});

test('claims explain exactly why they are not available', async ({ page }) => {
  await signIn(page.context(), 'buyer');
  await page.goto('/transactions/TX-1038/claim');
  await expect(page.getByText('A claim isn’t available for this transaction')).toBeVisible();
  await expect(page.getByText(/Lifting has not started yet/).first()).toBeVisible();
});

test('evidence upload rejects unsupported files with a fix, and accepts photos', async ({ page }) => {
  test.skip(isHttp, 'uses browser demo-mode failure injection / localStorage; covered by the API contract tests');
  await signIn(page.context(), 'seller');
  await page.goto('/transactions/TX-1045');
  await page.getByRole('button', { name: 'Confirm lifting date' }).click();
  await page.getByRole('dialog', { name: 'Confirm the lifting date?' }).getByRole('button', { name: 'Confirm lifting date' }).click();
  await expect(page.getByText('Lifting date confirmed. The buyer has been notified.').first()).toBeVisible();
  await switchTo(page, 'buyer');
  const g = page.getByRole('group', { name: 'Weighbridge ticket' });
  await g.getByLabel('Choose files').setInputFiles({ name: 'ticket.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(g.getByText('ticket.gif isn\'t a supported file type. Use JPG, PNG or WebP, PDF.')).toBeVisible();

  await page.evaluate(() => sessionStorage.setItem('auctionit:fail-next', 'uploadMedia'));
  await g.getByLabel('Choose files').setInputFiles(PNG);
  await expect(g.getByText(/upload of lifting-photo.png was interrupted/)).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('auctionit:fail-next'));
  await g.getByRole('button', { name: 'Retry' }).click();
  await expect(g.getByText('1 file attached')).toBeVisible();
});
