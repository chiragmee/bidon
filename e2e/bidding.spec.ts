import { action, expect, signIn, test } from './fixtures';

const KEY = 'auctionit:demo:v1';

test.beforeEach(async ({ context }) => signIn(context, 'buyer'));

async function payEmd(page: import('@playwright/test').Page) {
  await action(page, 'Pay EMD to bid').click();
  await page.getByRole('button', { name: 'Pay ₹1,00,000 (simulated)' }).click();
  await page.getByRole('button', { name: 'Continue to bid' }).click();
}

test('stale bid: another bidder gets in first → outbid, new minimum offered, retry succeeds', async ({ page, context }) => {
  await page.goto('/auctions/LOT-2025-0891');
  await payEmd(page);
  const dialog = page.getByRole('dialog', { name: /bid/i });
  await dialog.getByRole('button', { name: 'Review bid' }).click();

  // Meanwhile, in another tab, a different buyer bids ₹35,000.
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    s.emds.push({ id: 'EMD-T', lotId: 'LOT-2025-0891', buyerId: 'U-MEERA', amount: 100000, status: 'succeeded', reference: 'T', mode: 'simulated', createdAt: new Date().toISOString() });
    s.bids.push({ id: 'BID-T', lotId: 'LOT-2025-0891', bidderId: 'U-MEERA', amountPerMt: 35000, placedAt: new Date().toISOString(), clientRequestId: 't' });
    localStorage.setItem(key, JSON.stringify(s));
  }, KEY);
  await other.close();

  await dialog.getByRole('button', { name: 'Confirm bid' }).click();
  await expect(dialog.getByText('Another bidder placed ₹35,000/MT while you were bidding.')).toBeVisible();
  await expect(dialog.getByText(/new minimum is ₹35,500\/MT/)).toBeVisible();
  await expect(dialog.getByLabel(/Your bid per MT/)).toHaveValue('35500');
  await dialog.getByRole('button', { name: 'Review bid' }).click();
  await dialog.getByRole('button', { name: 'Confirm bid' }).click();
  await expect(page.getByText('Bid placed: ₹35,500/MT')).toBeVisible();
});

test('below the minimum is caught before review', async ({ page }) => {
  await page.goto('/auctions/LOT-2025-0891');
  await payEmd(page);
  const dialog = page.getByRole('dialog', { name: 'Place your bid' });
  await dialog.getByLabel(/Your bid per MT/).fill('34000');
  await dialog.getByRole('button', { name: 'Review bid' }).click();
  await expect(dialog.getByText('Bid ₹35,000/MT or more.')).toBeVisible();
});

test('a network failure never shows success, and retry is safe', async ({ page }) => {
  await page.goto('/auctions/LOT-2025-0891');
  await payEmd(page);
  const dialog = page.getByRole('dialog', { name: /bid/i });
  await dialog.getByRole('button', { name: 'Review bid' }).click();
  await page.evaluate(() => sessionStorage.setItem('auctionit:fail-next', 'placeBid'));
  await dialog.getByRole('button', { name: 'Confirm bid' }).click();
  await expect(dialog.getByText('We couldn’t reach the server.')).toBeVisible();
  await expect(page.getByText(/Bid placed/)).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem('auctionit:fail-next'));
  await dialog.getByRole('button', { name: 'Confirm bid' }).click();
  await expect(page.getByText('Bid placed: ₹35,000/MT')).toBeVisible();
});

test('upcoming and closed lots have no working bid button', async ({ page }) => {
  await page.goto('/auctions/LOT-2025-0910');
  await expect(page.getByText('Bidding hasn’t opened yet.').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Place bid|Pay EMD/ })).toHaveCount(0);

  await page.goto('/auctions/LOT-2025-0866');
  await expect(page.getByText('This auction closed without a bid meeting the reserve.').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Place bid|Pay EMD/ })).toHaveCount(0);
});

test('a won lot links to its transaction', async ({ page }) => {
  await page.goto('/auctions/LOT-2025-0861');
  await action(page, 'Go to your transaction').click();
  await expect(page).toHaveURL(/\/transactions\/TX-1038$/);
  await expect(page.getByText(/Pay balance of/)).toBeVisible();
});
