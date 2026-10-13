// Renders public/icons/icon.svg to the PNG sizes the PWA manifest and iOS need.
import { readFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
  // Maskable icons need the artwork inside the central 80% "safe zone".
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12 },
];

const browser = await launchBrowser();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setContent(
    `<html><body style="margin:0;background:#16241a;display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
     <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: `public/icons/${t.file}`, omitBackground: false });
  console.log('wrote', t.file);
}
await browser.close();
