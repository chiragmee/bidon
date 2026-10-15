import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

/** Every test fails on console errors or uncaught page errors (CLAUDE.md Definition of done). */
/** Set when the suite runs against the real API (pnpm e2e:http): each test starts from a fresh seed. */
export const API_URL = process.env.E2E_API_URL;
export const isHttp = !!API_URL;

export const test = base.extend<{ consoleErrors: string[]; freshData: void }>({
  freshData: [
    async ({}, use) => {
      if (API_URL) {
        const res = await fetch(`${API_URL}/demo/reset`, { method: 'POST' });
        if (!res.ok) throw new Error(`Could not reset the API data (${res.status}).`);
      }
      await use();
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        // Chrome logs every 4xx fetch. A 422 is the API refusing a business rule on purpose (e.g. the
        // simulated failed EMD payment); the page shows it. Anything else still fails the test.
        if (/Failed to load resource: .* status of 422/.test(m.text())) return;
        // A test that deliberately opens a missing page expects the browser to log its 404.
        if (test.info().annotations.some((a) => a.type === 'expects-404') && /status of 404/.test(m.text())) return;
        // A test that signs in with a wrong password on purpose expects Supabase Auth's 400.
        if (test.info().annotations.some((a) => a.type === 'expects-auth-400') && /status of 400/.test(m.text())) return;
        errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      if (process.env.E2E_DEBUG_RESPONSES) page.on('response', (r) => r.status() >= 400 && console.log('RESP', r.status(), r.request().method(), r.url()));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
      // No horizontal page scroll at any width (DESIGN.md Layout). Under mobile emulation an
      // overflowing page widens the layout viewport, so compare with the configured width.
      if (!page.isClosed() && page.url().startsWith('http')) {
        const width = page.viewportSize()?.width ?? 0;
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scroll, 'page wider than the viewport').toBeLessThanOrEqual(width);
      }
    },
    { auto: true },
  ],
});
export { expect };

const DEMO = { buyer: 'U-RAHUL', seller: 'U-SURESH', ops: 'U-DEVENDRA' } as const;

/** Sign in by setting the demo session cookie directly (same as the role switcher does). */
export async function signIn(context: BrowserContext, role: keyof typeof DEMO) {
  await context.addCookies([{ name: 'auctionit_session', value: encodeURIComponent(`${role}:${DEMO[role]}`), url: 'http://localhost:3000' }]);
}

/** The visible primary action — the desktop panel or the mobile bottom bar. */
export function action(page: Page, name: string | RegExp) {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name })).filter({ visible: true }).first();
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

/** Switch role mid-test the way a presenter would, keeping the current page. */
export async function switchTo(page: Page, role: keyof typeof DEMO) {
  await signIn(page.context(), role);
  await page.reload();
}

/** A tiny valid PNG for evidence uploads. */
export const PNG = {
  name: 'lifting-photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
};

export async function upload(page: Page, group: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const g = page.getByRole('group', { name: group });
  await g.getByLabel('Choose files').setInputFiles(files);
  await expect(g.getByText(`${files.length} file${files.length === 1 ? '' : 's'} attached`)).toBeVisible();
}

// ── Offline payments (docs/PHASE1_MVP.md): the buyer reports, the seller confirms ──

/** As the buyer on a lot page: open the EMD dialog and report a payment made outside AuctionIT. */
export async function reportEmd(page: Page, reference = 'UTR000123456') {
  await action(page, 'Pay EMD to bid').click();
  const dialog = page.getByRole('dialog', { name: /Pay the EMD, then report it|Correct your EMD payment details/ });
  await dialog.getByLabel(/UTR number/).fill(reference);
  await dialog.getByLabel(/Paid from/).fill('Vardhan Infra Projects Pvt Ltd');
  await dialog.getByRole('button', { name: 'Report EMD payment' }).click();
  await expect(page.getByRole('dialog', { name: 'EMD payment reported' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
}

/** As the lot's seller: confirm the reported EMD from `buyer`, then come back as `back` to `returnTo`. */
export async function confirmEmd(page: Page, lotId: string, buyer = 'Vardhan Infra Projects Pvt Ltd', back: keyof typeof DEMO = 'buyer', returnTo = `/auctions/${lotId}`) {
  await signIn(page.context(), 'seller');
  await page.goto(`/seller/lots/${lotId}`);
  const row = page.getByRole('listitem', { name: `EMD from ${buyer}` });
  await row.getByRole('button', { name: 'Confirm receipt' }).click();
  await expect(row.getByText('Receipt confirmed by seller')).toBeVisible();
  await signIn(page.context(), back);
  await page.goto(returnTo);
}

/** Buyer reports the EMD, the seller (Shree Balaji Steels' lots) confirms it, back on the lot as the buyer. */
export async function emdConfirmed(page: Page, lotId: string) {
  await reportEmd(page);
  await confirmEmd(page, lotId);
  await expect(action(page, 'Place bid')).toBeVisible();
}

/** On a transaction page: the buyer reports the balance, the seller confirms it; ends as the buyer. */
export async function balanceConfirmed(page: Page, amount: string) {
  const form = page.getByRole('region', { name: 'Balance payment' });
  await form.getByLabel(/UTR number/).fill('UTR-BALANCE-0001');
  await form.getByLabel(/Paid from/).fill('Vardhan Infra Projects Pvt Ltd');
  await form.getByRole('button', { name: 'Report balance payment' }).click();
  await expect(form.getByText('Reported. Waiting for the seller to confirm receiving it')).toBeVisible();
  await switchTo(page, 'seller');
  await page.getByRole('region', { name: 'Balance payment' }).getByRole('button', { name: `Confirm receipt of ${amount}` }).click();
  await expect(page.getByRole('region', { name: 'Balance payment' }).getByText('Receipt confirmed by seller')).toBeVisible();
  await switchTo(page, 'buyer');
}
