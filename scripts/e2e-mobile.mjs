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
  // Headless Chromium renders on an emulated GPU that is fill-rate bound: at 2x render scale it
  // manages only a few frames per second, too slow for timing-based gesture checks. Test on Low
  // (1x render scale); real phone GPUs run High comfortably. E2E_GRAPHICS=high overrides.
  await page.addInitScript((q) => {
    if (!localStorage.getItem('godforge.settings.v1'))
      localStorage.setItem('godforge.settings.v1', JSON.stringify({ graphics: q }));
  }, process.env.E2E_GRAPHICS ?? 'low');
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

  // Warm-up: the first seconds after load paint ground chunks and compile shaders, which stalls
  // frames on software-rendered headless browsers. Wait until the sim ticks steadily.
  for (let i = 0, last = await tick(); i < 30; i++) {
    await page.waitForTimeout(500);
    const now = await tick();
    if (now - last >= 7) break;
    last = now;
  }
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

  // --- M3: build a house with the selected workers via the build menu + placement mode.
  await page.locator('.cmd-btn[data-key="buildmenu"]').tap();
  await page.waitForTimeout(250);
  await page.locator('.cmd-btn[data-key="build:house"]').tap();
  await page.waitForTimeout(250);
  check(await page.locator('.hud-banner').isVisible(), 'placement banner shown');
  const spot = await page.evaluate(() => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world;
    const hall = w.entities.find((e) => e.owner === 0 && e.def === 'town_hall');
    for (let r = 3; r < 10; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = 0; dx <= r; dx++)
          if (w.grid.canPlace(hall.tileX + dx, hall.tileY + dy, 2))
            return [hall.tileX + dx + 1, hall.tileY + dy + 1];
    return null;
  });
  const [hx, hy] = await toScreen(spot[0], spot[1]);
  await tapAt(hx, hy);
  await page.screenshot({ path: `${OUT}/03b-placement.png` });
  await page.locator('.banner-btn.ok').tap();
  await page.waitForTimeout(300);
  const house = () =>
    page.evaluate(() => {
      const h = window.__godforge.game.scene
        .getScene('World')
        .sim.world.entities.find((e) => e.def === 'house' && e.owner === 0);
      return h ? { built: h.built, progress: h.progress } : null;
    });
  check((await house()) !== null, 'confirming placement creates a house foundation');
  await page.evaluate(() => window.__godforge.ctx.match.setSpeed(2));
  await page.waitForTimeout(9000);
  const h = await house();
  check(h && (h.built || h.progress > 0.4), `workers construct the house (${JSON.stringify(h)})`);
  await page.screenshot({ path: `${OUT}/03c-house.png` });

  // --- Train a worker at the Town Hall.
  const hallPos = await page.evaluate(() => {
    const hall = window.__godforge.game.scene
      .getScene('World')
      .sim.world.entities.find((e) => e.owner === 0 && e.def === 'town_hall');
    return [hall.x, hall.y];
  });
  const [tx2, ty2] = await toScreen(hallPos[0], hallPos[1]);
  const hallSelected = () =>
    page.evaluate(() => {
      const s = window.__godforge.game.scene.getScene('World');
      return s.input2.selection.entities(s.sim.world).some((e) => e.def === 'town_hall');
    });
  for (let attempt = 0; attempt < 4 && !(await hallSelected()); attempt++) await tapAt(tx2, ty2);
  const trainBtn = page.locator('.cmd-btn[data-key^="train:"]').first();
  check(await trainBtn.isVisible(), 'town hall shows a train button');
  await trainBtn.tap();
  await page.waitForTimeout(300);
  const queued = await page.evaluate(() => {
    const hall = window.__godforge.game.scene
      .getScene('World')
      .sim.world.entities.find((e) => e.owner === 0 && e.def === 'town_hall');
    return hall.queue.length;
  });
  check(queued === 1, `train button queues a worker (${queued})`);
  await page.evaluate(() => window.__godforge.ctx.match.setSpeed(1));
  await page.screenshot({ path: `${OUT}/03d-townhall.png` });

  // --- M5: advance to the Classical Age through the god-choice modal.
  await page.evaluate(() => {
    const p = window.__godforge.game.scene.getScene('World').sim.world.players[0];
    p.res.food = 2000;
    p.res.gold = 2000;
    p.res.wood = 2000;
  });
  await page.waitForTimeout(300);
  await page.locator('.cmd-btn[data-key="age"]').tap();
  await page.waitForTimeout(250);
  const choices = await page.locator('.modal-choice').count();
  check(choices === 2, `age button offers two minor gods (${choices})`);
  await page.screenshot({ path: `${OUT}/03e-godchoice.png` });
  await page.locator('.modal-choice').first().tap();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window.__godforge.game.scene.getScene('World').sim.world;
    const hall = w.entities.find((e) => e.owner === 0 && e.def === 'town_hall');
    for (const q of hall.queue) q.progress = q.total - 2;
  });
  await page.waitForTimeout(1200);
  const age = await page.evaluate(
    () => window.__godforge.game.scene.getScene('World').sim.world.players[0].age,
  );
  check(age === 1, `age advanced to Classical (${age})`);
  check(await page.locator('.hud-announce').isVisible(), 'age-up announcement shown');
  await page.screenshot({ path: `${OUT}/03f-ageup.png` });

  // --- M4: a staged skirmish near our base shows combat, projectiles and damage numbers.
  check(await page.locator('.hud-minimap canvas').isVisible(), 'minimap is shown');
  await page.evaluate(() => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world;
    const st = w.map.starts[0];
    const ti = w.grid.nearestWalkable(st.x + 6, st.y + 5);
    const x = (ti % w.map.width) + 0.5;
    const y = Math.floor(ti / w.map.width) + 0.5;
    const mk = (owner, def, dx, dy) => window.__godforge.spawn(owner, def, x + dx, y + dy);
    for (let i = 0; i < 4; i++) mk(0, 'shieldbrother', -1.5, i * 0.6 - 1);
    for (let i = 0; i < 3; i++) mk(0, 'ravenbow', -2.5, i * 0.6 - 0.6);
    for (let i = 0; i < 4; i++) mk(1, 'lancer', 2, i * 0.7 - 1);
    s.centerOnTile(x, y);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/04-battle.png` });
  const fought = await page.evaluate(() => {
    const w = window.__godforge.game.scene.getScene('World').sim.world;
    return (
      w.entities.some((e) => e.kind === 'unit' && e.hp < e.maxHp) ||
      w.entities.filter((e) => e.def === 'lancer').length < 4
    );
  });
  check(fought, 'units fight when enemies meet');

  // --- M6: cast the major god's power through the power bar + map tap.
  await page.evaluate(
    () => (window.__godforge.game.scene.getScene('World').sim.world.players[0].res.favor = 100),
  );
  await page.waitForTimeout(300);
  await page.locator('.power-btn').first().tap();
  await page.waitForTimeout(200);
  check(await page.locator('.hud-banner').isVisible(), 'power targeting banner shown');
  const target = await page.evaluate(() => {
    const w = window.__godforge.game.scene.getScene('World').sim.world;
    const foe = w.entities.find((e) => e.owner === 1 && e.kind === 'unit' && !e.dead);
    if (foe) window.__godforge.game.scene.getScene('World').centerOnTile(foe.x, foe.y);
    return foe ? [foe.x, foe.y] : null;
  });
  await page.waitForTimeout(100);
  const [px, py] = target ? await toScreen(target[0], target[1]) : [422, 200];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await page.locator('.hud-banner').isVisible())) break;
    await tapAt(px, py);
  }
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/04b-power.png` });
  const favorLeft = await page.evaluate(
    () => window.__godforge.game.scene.getScene('World').sim.world.players[0].res.favor,
  );
  check(favorLeft < 100, `casting spends favor (${favorLeft.toFixed(0)} left)`);

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

  // --- Performance: 160+ units on screen; measure our per-frame JS cost (scene update).
  const perf = await page.evaluate(async () => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world;
    const cx = w.map.width / 2;
    const cy = w.map.height / 2;
    for (let i = 0; i < 90; i++) {
      window.__godforge.spawn(
        0,
        'shieldbrother',
        cx - 5 + (i % 10) * 0.55,
        cy - 3 + Math.floor(i / 10) * 0.55,
      );
      window.__godforge.spawn(
        1,
        'lancer',
        cx + 5 - (i % 10) * 0.55,
        cy - 3 + Math.floor(i / 10) * 0.55,
      );
    }
    for (let i = 0; i < w.fog[0].length; i++) w.fog[0][i] = 2;
    s.camModel.zoom = (16 * s.ctx.renderScale) / 64;
    s.centerOnTile(cx, cy);
    // Time between the scene's pre-update and post-update events = our update() cost.
    let total = 0;
    let frames = 0;
    let t0 = 0;
    const pre = () => (t0 = performance.now());
    const post = () => {
      total += performance.now() - t0;
      frames++;
    };
    s.profText();
    s.sim.profile = true;
    const tick0 = w.tick;
    s.events.on('preupdate', pre);
    s.events.on('postupdate', post);
    await new Promise((r) => setTimeout(r, 3000));
    s.events.off('preupdate', pre);
    s.events.off('postupdate', post);
    const ticks = w.tick - tick0;
    s.sim.profile = false;
    const sys = Object.entries(s.sim.timings)
      .map(([k, v]) => `${k} ${(v / ticks).toFixed(2)}`)
      .join(' ');
    const prof = s.profText() + `\n  per tick (${ticks} ticks): ${sys}`;
    return {
      msPerFrame: total / frames,
      frames,
      prof,
      units: w.entities.filter((e) => e.kind === 'unit').length,
    };
  });
  console.log(`  ${perf.prof}`);
  console.log(
    `  render+sim JS per frame with ${perf.units} units: ${perf.msPerFrame.toFixed(2)} ms over ${perf.frames} frames (headless, software GL)`,
  );
  check(
    perf.msPerFrame < 12,
    `per-frame game logic stays within budget (${perf.msPerFrame.toFixed(2)} ms)`,
  );
  await page.screenshot({ path: `${OUT}/04c-crowd.png` });

  // --- Victory: wipe the enemy and expect the end-of-match screen, then restart.
  await page.evaluate(() => {
    const w = window.__godforge.game.scene.getScene('World').sim.world;
    for (const e of w.entities)
      if (e.owner === 1) {
        e.hp = 0;
        e.dead = true;
        if (e.kind !== 'unit') w.grid.unstamp(e);
      }
  });
  await page.waitForTimeout(2500);
  const endText = await page
    .locator('.modal-title')
    .textContent()
    .catch(() => '');
  check(/Victory/.test(endText ?? ''), `victory screen shown ("${endText}")`);
  await page.screenshot({ path: `${OUT}/05-victory.png` });
  await page.locator('.modal-actions .btn-primary').tap();
  await page.waitForTimeout(2500);
  const fresh = await page.evaluate(
    () => window.__godforge.game.scene.getScene('World').sim.world.tick,
  );
  check(fresh < 200, `play again starts a new match (tick ${fresh})`);

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

  // --- Every faction loads and renders.
  for (const f of ['aurelian', 'sahrun']) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`${base}?seed=7&faction=${f}`);
    await page.waitForFunction(() => window.__godforge?.ctx?.match != null, null, {
      timeout: 20000,
    });
    await page.waitForTimeout(800);
    const ok = await page.evaluate(
      (fac) => window.__godforge.game.scene.getScene('World').sim.world.players[0].faction === fac,
      f,
    );
    check(ok, `${f} faction starts`);
    await page.waitForTimeout(2500);
    const aiBusy = await page.evaluate(() =>
      window.__godforge.game.scene
        .getScene('World')
        .sim.world.entities.some(
          (e) => e.owner === 1 && e.cls === 'worker' && e.order.type !== 'idle',
        ),
    );
    check(aiBusy, `AI opponent puts its workers to work (${f} game)`);
    await page.screenshot({ path: `${OUT}/06-${f}.png` });
  }

  // --- M8: main menu -> pre-match -> battle -> quit; settings language; tutorial.
  await page.goto(base);
  await page.waitForSelector('.menu-main', { timeout: 20000 });
  check(await page.locator('.menu-title').isVisible(), 'main menu shown on launch');
  await page.screenshot({ path: `${OUT}/07-menu.png` });
  await page.locator('.menu-main .menu-btn.primary').tap();
  await page.waitForSelector('.menu-pre');
  await page.locator('.pre-cards').first().locator('.pre-card').nth(2).tap(); // Sahrun
  await page.waitForTimeout(150);
  await page.locator('.segmented').first().locator('.seg-btn').nth(2).tap(); // Hard
  await page.waitForTimeout(150);
  check(
    (await page.locator('.pre-note').textContent()).includes('15'),
    'hard difficulty shows its explicit bonus',
  );
  await page.screenshot({ path: `${OUT}/08-prematch.png`, fullPage: true });
  await page.locator('.menu-btn.start').tap();
  await page.waitForFunction(() => window.__godforge?.ctx?.match != null, null, { timeout: 20000 });
  const setup = await page.evaluate(() => {
    const w = window.__godforge.game.scene.getScene('World').sim.world;
    return { f: w.players[0].faction, ai: w.config.players[1].ai };
  });
  check(
    setup.f === 'sahrun' && setup.ai === 'hard',
    `pre-match choices apply (${JSON.stringify(setup)})`,
  );
  await page.locator('.hud-controls .hud-btn').first().tap();
  await page.waitForTimeout(200);
  await page.locator('.modal-actions button').last().tap(); // Quit to menu
  await page.waitForSelector('.menu-main', { timeout: 5000 });
  check(true, 'quit returns to the main menu');
  // Settings: switch to Norwegian.
  await page.locator('.menu-main .menu-btn', { hasText: 'Settings' }).tap();
  await page.waitForSelector('.menu-settings');
  await page.locator('.set-row').first().locator('.seg-btn').nth(1).tap();
  await page.waitForTimeout(200);
  const title = await page.locator('.menu-header h2').textContent();
  check(title === 'Innstillinger', `language switches to Norwegian ("${title}")`);
  await page.screenshot({ path: `${OUT}/09-settings-nb.png` });
  await page.locator('.set-row').first().locator('.seg-btn').nth(0).tap();
  await page.waitForTimeout(150);
  await page.locator('.menu-back').tap();
  await page.waitForSelector('.menu-main');
  // Codex: gods and unit sheets render.
  await page.locator('.menu-main .menu-btn', { hasText: 'Codex' }).tap();
  await page.waitForSelector('.codex-gods');
  const godTiles = await page.locator('.codex-god').count();
  await page.locator('.codex-tabs .seg-btn').nth(1).tap();
  await page.waitForSelector('.codex-detail');
  const unitCards = await page.locator('.codex-unit').count();
  check(
    godTiles >= 12 && unitCards >= 10,
    `codex shows gods (${godTiles}) and units (${unitCards})`,
  );
  await page.screenshot({ path: `${OUT}/11-codex.png` });
  await page.locator('.menu-back').tap();
  await page.waitForSelector('.menu-main');
  // Tutorial.
  await page
    .locator('.menu-main .menu-btn', { hasText: /Tutorial|Opplæring|Veiledning/ })
    .first()
    .tap();
  await page.waitForSelector('.coach', { timeout: 20000 });
  check(await page.locator('.coach').isVisible(), 'tutorial coach shown');
  await page.locator('.coach .btn-primary').tap();
  await page.waitForTimeout(300);
  const step = await page.locator('.coach-step').textContent();
  check(/2\//.test(step ?? ''), `tutorial advances (${step})`);
  await page.screenshot({ path: `${OUT}/10-tutorial.png` });

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
