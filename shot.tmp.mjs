import { chromium } from '@playwright/test';
const S = process.env.S, [path, name, w] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: 844 } });
await page.goto('http://localhost:3000' + path); await page.waitForLoadState('networkidle');
for (let y = 0; y < 12000; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
await page.waitForLoadState('networkidle'); await page.evaluate(() => window.scrollTo(0, 0));
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.alt));
await page.screenshot({ path: `${S}/${name}.png`, fullPage: true });
console.log(name, 'broken images', JSON.stringify(broken));
await browser.close();
