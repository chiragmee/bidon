import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { action, confirmEmd, expect, reportEmd, signIn, test } from './fixtures';

/** Zero serious or critical WCAG 2.1 A/AA violations (PHASES 6.4). */
async function axe(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    label,
  ).toEqual([]);
}

const SCREENS: [string, 'guest' | 'buyer' | 'seller' | 'ops', string][] = [
  ['landing', 'guest', '/'],
  ['catalogue', 'guest', '/auctions'],
  ['lot detail', 'buyer', '/auctions/LOT-2025-0891'],
  ['standard lot', 'guest', '/auctions/LOT-2025-0899'],
  ['how Lot Assurance works', 'guest', '/lot-assurance'],
  ['sign in', 'guest', '/sign-in'],
  ['buyer onboarding', 'guest', '/onboarding/buyer'],
  ['seller onboarding', 'guest', '/onboarding/seller'],
  ['buyer dashboard', 'buyer', '/buyer/dashboard'],
  ['transaction with claim', 'buyer', '/transactions/TX-1042'],
  ['transaction to pay', 'buyer', '/transactions/TX-1038'],
  ['claim form (ineligible)', 'buyer', '/transactions/TX-1038/claim'],
  ['seller dashboard', 'seller', '/seller/dashboard'],
  ['my lots', 'seller', '/seller/lots'],
  ['wizard step 1', 'seller', '/seller/lots/new'],
  ['wizard step 3', 'seller', '/seller/lots/LOT-2025-0920/edit?step=3'],
  ['wizard step 4', 'seller', '/seller/lots/LOT-2025-0920/edit?step=4'],
  ['preview', 'seller', '/seller/lots/LOT-2025-0920/preview'],
  ['seller lot (live)', 'seller', '/seller/lots/LOT-2025-0891'],
  ['ops overview', 'ops', '/ops'],
  ['ops auctions', 'ops', '/ops/auctions'],
  ['claim review', 'ops', '/ops/claims/CLM-1042-01'],
  ['notifications', 'buyer', '/notifications'],
  ['account and verification (buyer)', 'buyer', '/account'],
  ['account and verification (seller)', 'seller', '/account'],
  ['eligibility queue', 'ops', '/ops/eligibility'],
  ['access denied', 'guest', '/access-denied?need=ops&from=/ops'],
  ['not found', 'guest', '/nowhere'],
];

for (const [label, role, path] of SCREENS) {
  test(`axe: ${label}`, async ({ page, context }) => {
    if (path === '/nowhere') test.info().annotations.push({ type: 'expects-404' });
    if (role !== 'guest') await signIn(context, role);
    await page.goto(path);
    await axe(page, label);
  });
}

test('axe: dialogs and menus', async ({ page, context }) => {
  await signIn(context, 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await action(page, 'Pay EMD to bid').click();
  await axe(page, 'EMD dialog');
  await page.keyboard.press('Escape');
  await reportEmd(page);
  await confirmEmd(page, 'LOT-2025-0891');
  await action(page, 'Place bid').click();
  await axe(page, 'bid dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Viewing as Buyer/ }).click();
  await axe(page, 'role menu');
});

test('keyboard: skip link, visible focus, dialog focus trap and Escape', async ({ page, context }) => {
  await signIn(context, 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);

  // Every control type shows a visible focus ring.
  for (const el of [
    page.getByRole('link', { name: 'Auctions', exact: true }).filter({ visible: true }).first(),
    action(page, 'Pay EMD to bid'),
    page.getByRole('button', { name: /Show photo 2/ }),
  ]) {
    await el.focus();
    const ring = await el.evaluate((n) => {
      const s = getComputedStyle(n);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  }

  // Dialog: opened from the keyboard, focus stays inside while tabbing, Escape closes it.
  await action(page, 'Pay EMD to bid').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Pay the EMD, then report it' });
  await expect(dialog).toBeVisible();
  // A native modal makes the page behind it inert: Tab cycles through the dialog and may step out to
  // the browser's own toolbar (activeElement = body), but never onto page content behind it.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      return !el || el === document.body ? 'browser' : el.closest('dialog') ? 'dialog' : `page: ${el.tagName} ${el.textContent?.slice(0, 30)}`;
    });
    expect(['dialog', 'browser']).toContain(where);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

/** Activate with the keyboard only: move focus, then Enter (buttons, links) or Space (checkboxes, radios). */
async function press(locator: ReturnType<Page['locator']>, key: 'Enter' | 'Space' = 'Enter') {
  await locator.focus();
  await locator.page().keyboard.press(key);
}

/** Focus a field and type into it with the keyboard. */
async function type(locator: ReturnType<Page['locator']>, text: string) {
  await locator.focus();
  await locator.page().keyboard.type(text);
}

test('keyboard only: journey A — report the EMD, seller confirms, bid', async ({ page, context }) => {
  await signIn(context, 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await press(action(page, 'Pay EMD to bid'));
  const emd = page.getByRole('dialog', { name: 'Pay the EMD, then report it' });
  await type(emd.getByLabel(/UTR number/), 'UTR000123456');
  await type(emd.getByLabel(/Paid from/), 'Vardhan Infra Projects Pvt Ltd');
  await press(emd.getByRole('button', { name: 'Report EMD payment' }));
  await press(page.getByRole('dialog', { name: 'EMD payment reported' }).getByRole('button', { name: 'Done' }));

  // The seller confirms receipt, by keyboard.
  await signIn(context, 'seller');
  await page.goto('/seller/lots/LOT-2025-0891');
  const row = page.getByRole('listitem', { name: 'EMD from Vardhan Infra Projects Pvt Ltd' });
  await press(row.getByRole('button', { name: 'Confirm receipt' }));
  await expect(row.getByText('Receipt confirmed by seller')).toBeVisible();

  await signIn(context, 'buyer');
  await page.goto('/auctions/LOT-2025-0891');
  await press(action(page, 'Place bid'));
  const input = page.getByLabel(/Your bid per MT/);
  await input.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('35500');
  await press(page.getByRole('button', { name: 'Review bid' }));
  await press(page.getByRole('button', { name: 'Confirm bid' }));
  // The result is announced (aria-live) and focus moves to it.
  const live = page.locator('[aria-live="polite"]').filter({ hasText: 'Bid placed: ₹35,500/MT' });
  await expect(live).toBeVisible();
  await expect(live).toBeFocused();
});

test('keyboard only: journey B — wizard step 1 by keyboard', async ({ page, context }) => {
  await signIn(context, 'seller');
  await page.goto('/seller/lots/new');
  await page.getByLabel(/Lot title/).focus();
  await page.keyboard.type('HMS heavy melting scrap, bay 2');
  await page.getByLabel(/^Category/).focus();
  await page.keyboard.type('Ferrous'); // type-to-select on a focused <select>
  await page.getByLabel(/Material type or grade/).focus();
  await page.keyboard.type('HMS 1');
  await page.getByLabel(/Description/).focus();
  await page.keyboard.type('Sheared heavy melting scrap.');
  await page.getByLabel(/^State/).focus();
  await page.keyboard.type('Chhattisgarh');
  await page.getByLabel(/Material type or grade/).focus();
  await page.keyboard.press('Enter'); // submits the step form
  await expect(page.getByRole('heading', { name: 'Quantity and condition' })).toBeVisible();
});

test('keyboard only: journey C — Operations decides a claim', async ({ page, context }) => {
  await signIn(context, 'ops');
  await page.goto('/ops/claims/CLM-1042-01');
  await press(page.getByRole('radio', { name: /Approve exit and refund/ }), 'Space');
  await page.getByLabel(/Reason for the decision/).focus();
  await page.keyboard.type('Evidence from both sides supports an exit for the buyer.');
  await press(page.getByRole('button', { name: 'Record decision' }));
  await press(page.getByRole('dialog', { name: 'Record this decision?' }).getByRole('button', { name: 'Record decision' }));
  await expect(page.getByText('Decision recorded', { exact: true })).toBeVisible();
});
