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
        errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
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
