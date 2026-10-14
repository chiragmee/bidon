import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

/** Every test fails on console errors or uncaught page errors (CLAUDE.md Definition of done). */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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
