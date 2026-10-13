// Mobile smoke test: serves the production build, opens it in a phone-sized landscape viewport
// with touch emulation, performs real touch gestures (pan, pinch, tap) through the Chrome
// DevTools Protocol, checks the results, verifies offline (service worker) reload and writes
// screenshots to e2e-output/. Run `npm run build` first.
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { launchBrowser } from './browser.mjs';

const OUT = 'e2e-output';
mkdirSync(OUT, { recursive: true });

const server = await preview({
  preview: { port: 4173, host: '127.0.0.1', strictPort: false },
  logLevel: 'warn',
});
const base = server.resolvedUrls.local[0];
const browser = await launchBrowser();
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures.push(msg);
};

try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 }, // iPhone 12-14 class, landscape
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`${base}?seed=42`);
  await page.waitForFunction(() => window.__godforge?.ctx?.match != null, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-start.png` });

  const cam = () =>
    page.evaluate(() => {
      const c = window.__godforge.game.scene.getScene('World').cameras.main;
      return { x: c.midPoint.x, y: c.midPoint.y, zoom: c.zoom };
    });
  const tick = () =>
    page.evaluate(() => window.__godforge.game.scene.getScene('World').sim.world.tick);

  const t0 = await tick();
  await page.waitForTimeout(1000);
  const t1 = await tick();
  check(t1 - t0 >= 15 && t1 - t0 <= 25, `sim runs at ~20 ticks/s (got ${t1 - t0} in 1s)`);

  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 5, radiusY: 5, force: 1 })),
    });

  // --- One-finger pan: drag left by 300 px -> camera moves right.
  const before = await cam();
  await touch('touchStart', [[600, 200]]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [[600 - i * 30, 200]]);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150); // rest so there's no fling
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const afterPan = await cam();
  check(
    afterPan.x > before.x + 50,
    `pan moves camera (${before.x.toFixed(0)} -> ${afterPan.x.toFixed(0)})`,
  );

  // --- Pinch out: fingers move apart -> zoom in.
  await touch('touchStart', [
    [380, 200],
    [460, 200],
  ]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [
      [380 - i * 12, 200],
      [460 + i * 12, 200],
    ]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const afterPinch = await cam();
  check(
    afterPinch.zoom > afterPan.zoom * 1.5,
    `pinch zooms in (${afterPan.zoom.toFixed(2)} -> ${afterPinch.zoom.toFixed(2)})`,
  );
  await page.screenshot({ path: `${OUT}/02-zoomed.png` });

  // --- Pinch in to see the map overview.
  await touch('touchStart', [
    [200, 200],
    [640, 200],
  ]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [
      [200 + i * 17, 200],
      [640 - i * 17, 200],
    ]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/03-overview.png` });

  // Helpers that read sim state and convert tile coords to CSS px on screen.
  const scene = 'window.__godforge.game.scene.getScene("World")';
  const toScreen = (x, y) =>
    page.evaluate(
      ([x, y]) => {
        const s = window.__godforge.game.scene.getScene('World');
        const p = s.camModel.worldToScreen(x * 64, y * 64);
        return [p.x / s.ctx.renderScale, p.y / s.ctx.renderScale];
      },
      [x, y],
    );
  const tapAt = async (x, y) => {
    await touch('touchStart', [[x, y]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(250);
  };
  const selectionSize = () =>
    page.evaluate(() => window.__godforge.game.scene.getScene('World').input2.selection.ids.size);

  // Re-centre on our base at default zoom.
  await page.evaluate(() => {
    const s = window.__godforge.game.scene.getScene('World');
    const st = s.sim.world.map.starts[0];
    s.camModel.zoom = (46 * s.ctx.renderScale) / 64;
    s.centerOnTile(st.x + 0.5, st.y + 2.5);
  });
  await page.waitForTimeout(200);

  // --- Tap a worker to select it.
  const worker = await page.evaluate(() => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world.entities.find((e) => e.owner === 0 && e.cls === 'worker');
    return { id: w.id, x: w.x, y: w.y };
  });
  let [wx, wy] = await toScreen(worker.x, worker.y - 0.2);
  let selected = false;
  for (let attempt = 0; attempt < 3 && !selected; attempt++) {
    await tapAt(wx, wy);
    selected = (await selectionSize()) === 1;
  }
  check(
    selected && (await page.locator('.hud-selection').isVisible()),
    'tapping a worker selects it and shows the panel',
  );
  await page.screenshot({ path: `${OUT}/02b-selected.png` });

  // --- Tap the ground to move it.
  const [gx, gy] = await toScreen(worker.x + 4, worker.y - 1);
  const histLen = () =>
    page.evaluate(() => window.__godforge.game.scene.getScene('World').sim.history.length);
  const h0 = await histLen();
  for (let attempt = 0; attempt < 3 && (await histLen()) === h0; attempt++) await tapAt(gx, gy);
  await page.waitForTimeout(2500);
  const moved = await page.evaluate((id) => {
    const e = window.__godforge.game.scene.getScene('World').sim.world.byId.get(id);
    return { x: e.x, y: e.y };
  }, worker.id);
  check(
    Math.hypot(moved.x - worker.x, moved.y - worker.y) > 2,
    `tap on ground moves the selected worker (${moved.x.toFixed(1)},${moved.y.toFixed(1)})`,
  );

  // --- Idle workers button selects all idle workers.
  await page.locator('.hud-tools .hud-btn').nth(1).tap();
  await page.waitForTimeout(200);
  check(
    (await selectionSize()) >= 2,
    `idle-workers button selects workers (${await selectionSize()})`,
  );

  // --- Long-press + drag draws a selection box.
  await page.evaluate(() =>
    window.__godforge.game.scene.getScene('World').input2.selection.clear(),
  );
  const ws = await page.evaluate(() =>
    window.__godforge.game.scene
      .getScene('World')
      .sim.world.entities.filter((e) => e.owner === 0 && e.cls === 'worker')
      .map((e) => [e.x, e.y]),
  );
  const pts = await Promise.all(ws.map(([x, y]) => toScreen(x, y)));
  const minX = Math.min(...pts.map((p) => p[0])) - 30;
  const minY = Math.min(...pts.map((p) => p[1])) - 30;
  const maxX = Math.max(...pts.map((p) => p[0])) + 30;
  const maxY = Math.max(...pts.map((p) => p[1])) + 30;
  await touch('touchStart', [[minX, minY]]);
  await page.waitForTimeout(700);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [[minX + ((maxX - minX) * i) / 6, minY + ((maxY - minY) * i) / 6]]);
    await page.waitForTimeout(30);
  }
  await page.screenshot({ path: `${OUT}/02c-boxselect.png` });
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  check(
    (await selectionSize()) === 3,
    `long-press drag box-selects all 3 workers (${await selectionSize()})`,
  );
  void scene;

  // --- Menu button pauses with a modal.
  await page.locator('.hud-controls .hud-btn').first().tap();
  await page.waitForTimeout(150);
  const paused = await page.evaluate(() => window.__godforge.ctx.match.isPaused());
  check(
    paused && (await page.locator('.hud-modal').isVisible()),
    'menu button pauses and shows the menu',
  );
  const pt0 = await tick();
  await page.waitForTimeout(400);
  check((await tick()) === pt0, 'sim does not advance while paused');
  await page.locator('.modal-actions .btn-primary').tap();
  await page.locator('.hud-controls .hud-btn').nth(1).tap();
  check(
    (await page.evaluate(() => window.__godforge.ctx.match.getSpeed())) === 2,
    'speed button sets 2x',
  );
  await page.locator('.hud-controls .hud-btn').nth(1).tap();

  // --- Touch targets are at least 48 CSS px.
  const sizes = await page.$$eval('.hud-btn', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { width: r.width, height: r.height, cls: e.className };
    }),
  );
  check(
    sizes.every((r) => r.width >= 48 && r.height >= 48),
    `HUD buttons >= 48px (${sizes
      .filter((r) => r.width < 47.5 || r.height < 47.5)
      .map((r) => r.cls + ':' + r.width + 'x' + r.height)
      .join(',')})`,
  );

  // --- No page scroll / zoom happened.
  const scroll = await page.evaluate(() => [
    window.scrollX,
    window.scrollY,
    window.visualViewport?.scale ?? 1,
  ]);
  check(scroll[0] === 0 && scroll[1] === 0 && scroll[2] === 1, 'page did not scroll or zoom');

  // --- Frame rate sample (software GL in CI is much slower than a phone; informative only).
  const fps = await page.evaluate(() => window.__godforge.game.loop.actualFps);
  console.log(`  fps (headless swiftshader): ${fps.toFixed(1)}`);

  // --- Offline: service worker precache lets the game reload without network.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, {
    timeout: 10000,
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__godforge?.ctx?.match != null, null, { timeout: 20000 });
  check(true, 'game reloads offline via service worker');
  await context.setOffline(false);

  // --- Portrait shows the rotate prompt.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check(await page.locator('#rotate').isVisible(), 'portrait shows rotate prompt');
  await page.screenshot({ path: `${OUT}/04-portrait.png` });

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  failures.push(String(e));
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll mobile checks passed. Screenshots in e2e-output/');
