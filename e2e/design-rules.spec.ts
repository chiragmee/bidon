import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

/** DESIGN.md rules checked on every route at both widths (PHASES 6.5). */
const ROUTES: [string, 'guest' | 'buyer' | 'seller' | 'ops'][] = [
  ['/', 'guest'],
  ['/auctions', 'guest'],
  ['/auctions/LOT-2025-0891', 'buyer'],
  ['/auctions/LOT-2025-0899', 'guest'],
  ['/auctions/LOT-2025-0866', 'buyer'],
  ['/lot-assurance', 'guest'],
  ['/how-it-works', 'guest'],
  ['/sign-in', 'guest'],
  ['/onboarding/buyer', 'guest'],
  ['/onboarding/seller', 'guest'],
  ['/buyer/dashboard', 'buyer'],
  ['/transactions/TX-1038', 'buyer'],
  ['/transactions/TX-1042', 'buyer'],
  ['/transactions/TX-1045', 'seller'],
  ['/transactions/TX-1035', 'ops'],
  ['/transactions/TX-1038/claim', 'buyer'],
  ['/seller/dashboard', 'seller'],
  ['/seller/lots', 'seller'],
  ['/seller/lots/new', 'seller'],
  ['/seller/lots/LOT-2025-0920/edit?step=4', 'seller'],
  ['/seller/lots/LOT-2025-0920/preview', 'seller'],
  ['/seller/lots/LOT-2025-0891', 'seller'],
  ['/ops', 'ops'],
  ['/ops/auctions', 'ops'],
  ['/ops/team', 'ops'],
  ['/ops/eligibility', 'ops'],
  ['/staff/sign-in', 'guest'],
  ['/ops/claims/CLM-1042-01', 'ops'],
  ['/notifications', 'buyer'],
];

/** Max number of filled orange (primary) buttons visible in any one viewport-height slice of the page. */
async function maxPrimariesPerViewport(page: Page): Promise<{ max: number; at: number; labels: string[] }> {
  return page.evaluate(async () => {
    const vh = window.innerHeight;
    const isPrimary = (el: Element) => {
      const bg = getComputedStyle(el).backgroundColor;
      return bg === 'rgb(189, 84, 24)' || bg === 'rgb(154, 68, 19)'; // action / action-hover
    };
    const candidates = [...document.querySelectorAll('a, button')].filter(isPrimary);
    let worst = { max: 0, at: 0, labels: [] as string[] };
    for (let top = 0; top < document.documentElement.scrollHeight; top += vh / 2) {
      const inView = candidates.filter((el) => {
        const r = el.getBoundingClientRect();
        const y = r.top + window.scrollY;
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        // Fixed bars (mobile bid bar) are on screen at every scroll position.
        const fixed = getComputedStyle(el.closest('[class*="fixed"]') ?? el).position === 'fixed';
        return visible && (fixed || (y + r.height > top && y < top + vh));
      });
      if (inView.length > worst.max) worst = { max: inView.length, at: top, labels: inView.map((e) => e.textContent?.trim() ?? '') };
    }
    return worst;
  });
}

for (const [path, role] of ROUTES) {
  test(`design rules: ${path} as ${role}`, async ({ page, context }) => {
    if (role !== 'guest') await signIn(context, role);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    const primaries = await maxPrimariesPerViewport(page);
    expect(primaries.max, `primary buttons together at y=${primaries.at}: ${primaries.labels.join(' | ')}`).toBeLessThanOrEqual(1);

    const text = await page.locator('body').innerText();
    // Never claim a step that didn't happen ("certified weighbridge" describes the agreed scale, per SPEC §7).
    expect(text.match(/\b(Verified|Guaranteed|Certified|guaranteed)\b/g), 'banned trust words').toBeNull();
    // ₹ always with Indian grouping: no 4+ digit run straight after ₹.
    expect(text.match(/₹\d{4,}/g), 'ungrouped rupee amounts').toBeNull();
    expect(text.match(/\bRs\.?\s?\d/g), 'use ₹, not Rs').toBeNull();
  });
}
