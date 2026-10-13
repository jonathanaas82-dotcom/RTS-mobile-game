// Shared Playwright launcher: uses the system/pre-installed Chromium instead of downloading one.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

export async function launchBrowser() {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  return chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
}
