// Renders the procedural art contact sheets to e2e-output/art-*.png (dev tool).
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { launchBrowser } from './browser.mjs';

mkdirSync('e2e-output', { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror', e));
for (const sheet of process.argv.slice(2).length ? process.argv.slice(2) : ['units', 'buildings']) {
  await page.goto(`http://localhost:5199/tools/art-preview.html?sheet=${sheet}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await page.screenshot({ path: `e2e-output/art-${sheet}.png`, fullPage: true });
  console.log('wrote', sheet);
}
await browser.close();
await server.close();
