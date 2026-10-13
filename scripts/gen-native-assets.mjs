// Generates Android/iOS launcher icons and splash screens from public/icons/icon.svg.
// Run after `npx cap add android|ios` (re-run any time the artwork changes): npm run native:assets
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from './browser.mjs';

const BG = '#16241a';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
// The emblem without the rounded background square (for adaptive icons and splash screens).
const emblem = svg.replace(/<rect width="512" height="512" rx="96" fill="url\(#bg\)"\/>/, '');

function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const jobs = [];
// Android launcher icons.
for (const f of walk('android/app/src/main/res').filter((p) => p.endsWith('.png'))) {
  const { w, h } = pngSize(f);
  if (f.includes('ic_launcher_foreground')) jobs.push({ f, w, h, kind: 'foreground' });
  else if (f.includes('ic_launcher_round')) jobs.push({ f, w, h, kind: 'round' });
  else if (f.includes('ic_launcher')) jobs.push({ f, w, h, kind: 'icon' });
  else if (f.includes('splash')) jobs.push({ f, w, h, kind: 'splash' });
}
// iOS app icon and splash.
for (const f of walk('ios/App/App/Assets.xcassets').filter((p) => p.endsWith('.png'))) {
  const { w, h } = pngSize(f);
  jobs.push({ f, w, h, kind: f.includes('AppIcon') ? 'icon-opaque' : 'splash' });
}

function html(job) {
  const { w, h, kind } = job;
  const s = Math.min(w, h);
  const body = (inner, bg = 'transparent') =>
    `<html><body style="margin:0;width:${w}px;height:${h}px;background:${bg};display:grid;place-items:center;overflow:hidden">${inner}</body></html>`;
  const fit = (markup, size) =>
    `<div style="width:${size}px;height:${size}px">${markup.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;
  switch (kind) {
    case 'icon':
      return body(fit(svg, s));
    case 'icon-opaque':
      return body(fit(svg, s), BG);
    case 'round':
      return body(
        `<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden;background:${BG}">${fit(svg, s)}</div>`,
      );
    case 'foreground':
      // Adaptive icons: keep the art inside the central 66% safe zone.
      return body(fit(emblem, Math.round(s * 0.62)));
    case 'splash':
      return body(
        `<div style="display:grid;place-items:center;gap:${Math.round(s * 0.02)}px">${fit(emblem, Math.round(s * 0.3))}` +
          `<div style="font:700 ${Math.round(s * 0.07)}px Georgia,serif;letter-spacing:.12em;color:#f0cf72">GODFORGE</div></div>`,
        BG,
      );
  }
  return body('');
}

const browser = await launchBrowser();
const page = await browser.newPage();
for (const job of jobs) {
  await page.setViewportSize({ width: job.w, height: job.h });
  await page.setContent(html(job));
  const buf = await page.screenshot({
    omitBackground: job.kind === 'foreground' || job.kind === 'round' || job.kind === 'icon',
  });
  writeFileSync(job.f, buf);
  console.log(`${job.kind.padEnd(11)} ${job.w}x${job.h} ${job.f}`);
}
await browser.close();

// Adaptive icon background colour.
const bgXml = 'android/app/src/main/res/values/ic_launcher_background.xml';
if (existsSync(bgXml)) {
  writeFileSync(
    bgXml,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
  );
}
