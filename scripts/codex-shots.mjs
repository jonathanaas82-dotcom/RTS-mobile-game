// Screenshots of the Codex (Norse gods + units) in English and Norwegian. Run from the repo root
// after `npm run build`: node scripts/codex-shots.mjs
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';

import { launchBrowser } from './browser.mjs';
const OUT = 'e2e-output';
mkdirSync(OUT, { recursive: true });
const server = await preview({
  preview: { port: 4183, host: '127.0.0.1', strictPort: false },
  logLevel: 'warn',
});
const base = server.resolvedUrls.local[0];
const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(base);
  await page.waitForSelector('.menu-main', { timeout: 20000 });
  for (const lang of ['en', 'nb']) {
    if (lang === 'nb') {
      await page
        .locator('.menu-main .menu-btn')
        .filter({ hasText: /Settings/ })
        .tap();
      await page.waitForSelector('.menu-settings');
      await page.locator('.set-row').first().locator('.seg-btn').nth(1).tap();
      await page.waitForTimeout(200);
      await page.locator('.menu-back').tap();
      await page.waitForSelector('.menu-main');
    }
    await page
      .locator('.menu-main .menu-btn')
      .filter({ hasText: /Codex|Kodeks/ })
      .tap();
    await page.locator('.codex-tabs .seg-btn').nth(0).tap(); // the codex remembers its tab
    await page.waitForSelector('.codex-gods', { timeout: 5000 }).catch(async (e) => {
      await page.screenshot({ path: `${OUT}/codex-debug.png` });
      throw e;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/codex-${lang}-gods-thor.png` });
    // Select a minor god (Heimdall) in the right column.
    const minors = page.locator('.codex-ages .codex-god');
    await minors.nth(3).tap();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/codex-${lang}-gods-minor.png` });
    await page.locator('.codex-list .codex-god').nth(1).tap();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/codex-${lang}-gods-odin.png` });
    await page.locator('.codex-tabs .seg-btn').nth(1).tap();
    await page.waitForSelector('.codex-detail');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/codex-${lang}-units.png` });
    const units = page.locator('.codex-unit');
    const n = await units.count();
    await units.nth(n - 1).tap();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/codex-${lang}-units-mythic.png` });
    await page.evaluate(() => window.document.querySelector('.codex-unit-grid')?.scrollTo(0, 9999));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/codex-${lang}-units-scrolled.png` });
    await page.locator('.menu-back').tap();
    await page.waitForSelector('.menu-main');
  }
  console.log('codex screenshots written');
} finally {
  await browser.close();
  server.httpServer.close();
}
