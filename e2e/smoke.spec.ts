import { expect, test } from '@playwright/test';

// Phase 1 smoke: the scaffold renders, tokens apply, and no page errors or horizontal scroll.
for (const path of ['/', '/dev/components']) {
  test(`${path} renders cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('dialog confirms and toast announces', async ({ page }) => {
  await page.goto('/dev/components');
  await page.getByRole('button', { name: 'Place bid' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Confirm your bid' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bid placed' })).toBeVisible();
  await expect(dialog).toBeHidden();
});
