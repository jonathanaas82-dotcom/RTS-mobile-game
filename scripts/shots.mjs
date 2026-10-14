// Staged gameplay screenshots. Starts AI-vs-AI ("demo") matches, fast-forwards the deterministic
// simulation, then frames interesting moments in a phone-sized landscape viewport.
// Usage: npm run build && node scripts/shots.mjs [namePrefix]   -> e2e-output/shot-*.png
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { launchBrowser } from './browser.mjs';

mkdirSync('e2e-output', { recursive: true });
const server = await preview({ preview: { port: 4180, host: '127.0.0.1' }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];
const browser = await launchBrowser();
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror', String(e)));
const only = process.argv[2];

async function open(url) {
  await page.goto(base + url);
  await page.waitForFunction(() => window.__godforge?.ctx?.match != null, null, { timeout: 30000 });
}

async function shot(name, prep, wait = 1400, arg = null) {
  if (only && !name.startsWith(only)) return;
  const info = await page.evaluate(prep, arg);
  await page.waitForTimeout(wait);
  // Headless frames are slow, so a camera flash lingers far longer than on a device: clear it.
  await page.evaluate(() =>
    window.__godforge.game.scene.getScene('World').cameras.main.flashEffect.reset(),
  );
  await page.screenshot({ path: `e2e-output/shot-${name}.png` });
  console.log('shot', name, info ?? '');
}

const run = only ? (n) => only.startsWith(n) || n.startsWith(only) : () => true;

// ── Match 1: Hrimfolk (us, AI-driven) vs Aurelian League ──
if (run('1')) {
  await open('?play=1&demo=1&seed=valhollow&faction=hrimfolk&god=thunrak');
  // Early base.
  await shot('1-early-base', () => {
    const s = window.__godforge.game.scene.getScene('World');
    s.fastForward(20 * 150);
    const st = s.sim.world.map.starts[0];
    s.camModel.zoom = (50 * s.ctx.renderScale) / 64;
    s.centerOnTile(st.x + 1.5, st.y + 1.5);
    s.input2.selection.set(
      s.sim.world.entities
        .filter((e) => e.owner === 0 && e.cls === 'worker')
        .slice(0, 3)
        .map((e) => e.id),
    );
  });
  // Mid-game town.
  await shot('1-town', () => {
    const s = window.__godforge.game.scene.getScene('World');
    s.fastForward(20 * 330);
    s.input2.selection.clear();
    const st = s.sim.world.map.starts[0];
    s.camModel.zoom = (36 * s.ctx.renderScale) / 64;
    s.centerOnTile(st.x + 3, st.y + 3);
    return `tick ${s.sim.world.tick}`;
  });
  // Find a battle: step until many units of both sides are close together, then frame it.
  await shot(
    '1-battle',
    () => {
      const s = window.__godforge.game.scene.getScene('World');
      const w = s.sim.world;
      let best = null;
      for (let k = 0; k < 120 && !best; k++) {
        s.fastForward(20 * 5);
        const units = w.entities.filter(
          (e) => e.kind === 'unit' && e.cls !== 'worker' && e.inside < 0,
        );
        for (const u of units) {
          if (u.owner !== 0) continue;
          const near = units.filter((o) => (o.x - u.x) ** 2 + (o.y - u.y) ** 2 < 36);
          const foes = near.filter((o) => o.owner !== 0).length;
          if (foes >= 4 && near.length >= 12) {
            best = u;
            break;
          }
        }
      }
      if (!best) return 'no battle';
      // Reveal the fight for the shot and let it play out a little in real time.
      for (let i = 0; i < w.fog[0].length; i++) if (w.fog[0][i] === 0) w.fog[0][i] = 1;
      s.camModel.zoom = (44 * s.ctx.renderScale) / 64;
      s.centerOnTile(best.x, best.y - 0.5);
      s.input2.selection.set(
        w.entities
          .filter(
            (e) =>
              e.owner === 0 &&
              e.kind === 'unit' &&
              e.cls !== 'worker' &&
              (e.x - best.x) ** 2 + (e.y - best.y) ** 2 < 49,
          )
          .map((e) => e.id),
      );
      return `tick ${w.tick}`;
    },
    1800,
  );
  // God power at the battle.
  await shot(
    '1-power',
    () => {
      const s = window.__godforge.game.scene.getScene('World');
      const w = s.sim.world;
      const foe = w.entities.find(
        (e) =>
          e.owner === 1 &&
          e.kind === 'unit' &&
          e.cls !== 'worker' &&
          s.cameras.main.worldView.contains(e.x * 64, e.y * 64),
      );
      const p = w.players[0];
      p.res.favor = 200;
      const pw = p.powers[0];
      pw.readyAt = 0;
      if (foe) s.issue({ type: 'castPower', player: 0, power: pw.id, x: foe.x, y: foe.y });
      return pw.id;
    },
    320,
  );
  // Strategic overview.
  await shot('1-overview', () => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world;
    s.input2.selection.clear();
    s.camModel.zoom = (16 * s.ctx.renderScale) / 64;
    const st = w.map.starts[0];
    s.centerOnTile(st.x + 12, st.y + 8);
  });
}

// ── Match 4: workers at work (fishing, chopping, mining, farming) ──
if (run('4')) {
  await open('?play=1&demo=1&seed=valhollow&faction=hrimfolk&god=thunrak');
  const frame = (want) => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world;
    const busy = (e) => {
      if (e.owner !== 0 || e.cls !== 'worker' || e.x !== e.px || e.y !== e.py) return null;
      if (e.order.type === 'build') return 'build';
      if (e.order.type !== 'gather') return null;
      if (e.order.tile >= 0) return 'chop';
      return w.byId.get(e.order.target)?.def ?? null;
    };
    if (want === 'fish' && !w.entities.some((e) => busy(e) === 'fish')) {
      // Staging: send two of our workers to the nearest fishing spot.
      const hall = w.entities.find((e) => e.owner === 0 && e.def === 'town_hall');
      const d2 = (e) => (e.x - hall.x) ** 2 + (e.y - hall.y) ** 2;
      const spot = w.entities.filter((e) => e.def === 'fish').sort((a, b) => d2(a) - d2(b))[0];
      const ws = w.entities.filter((e) => e.owner === 0 && e.cls === 'worker').slice(0, 2);
      if (spot)
        s.issue({ type: 'gather', player: 0, ids: ws.map((e) => e.id), target: spot.id, tile: -1 });
    }
    for (let k = 0; k < 60; k++) {
      const hits = w.entities.filter((e) => busy(e) === want);
      if (hits.length) {
        const e = hits[0];
        s.input2.selection.clear();
        s.camModel.zoom = (78 * s.ctx.renderScale) / 64;
        s.centerOnTile(e.x + 1.5, e.y - 0.3);
        return `${want} x${hits.length} tick ${w.tick}`;
      }
      s.fastForward(20 * 10);
    }
    return `no ${want}`;
  };
  await page.evaluate(() => window.__godforge.game.scene.getScene('World').fastForward(20 * 60));
  await shot('4-fishing', frame, 1600, 'fish');
  await shot('4-chopping', frame, 1600, 'chop');
  await shot('4-mining', frame, 1600, 'gold');
  await shot('4-farming', frame, 1600, 'farm');
}

// ── Match 2: Aurelian League town ──
if (run('2')) {
  await open('?play=1&demo=1&seed=marblebay&faction=aurelian&god=aetheon');
  await shot('2-aurelian-town', () => {
    const s = window.__godforge.game.scene.getScene('World');
    s.fastForward(20 * 540);
    const st = s.sim.world.map.starts[0];
    s.camModel.zoom = (38 * s.ctx.renderScale) / 64;
    s.centerOnTile(st.x + 2, st.y + 3);
    return `tick ${s.sim.world.tick}`;
  });
}

// A soldier selected up close: detailed art and trait badges in the HUD.
if (run('2')) {
  await shot('2-unit-traits', () => {
    const s = window.__godforge.game.scene.getScene('World');
    const w = s.sim.world;
    const mine = (id) =>
      w.entities.find(
        (e) => e.owner === 0 && e.kind === 'unit' && !e.dead && e.inside < 0 && e.def === id,
      );
    let pick = null;
    for (let k = 0; k < 40 && !pick; k++) {
      pick = mine('marble_champion') ?? mine('bronzeguard') ?? mine('signbearer') ?? mine('lancer');
      if (!pick) s.fastForward(20 * 10);
    }
    if (!pick) return 'none';
    s.camModel.zoom = (80 * s.ctx.renderScale) / 64;
    s.centerOnTile(pick.x, pick.y);
    s.input2.selection.set([pick.id]);
    return pick.def;
  });
}

// ── Match 3: Sahrun Dominion town ──
if (run('3')) {
  await open('?play=1&demo=1&seed=sunreach&faction=sahrun&god=solenkh');
  await shot('3-sahrun-town', () => {
    const s = window.__godforge.game.scene.getScene('World');
    s.fastForward(20 * 540);
    const st = s.sim.world.map.starts[0];
    s.camModel.zoom = (38 * s.ctx.renderScale) / 64;
    s.centerOnTile(st.x + 2, st.y + 3);
    return `tick ${s.sim.world.tick}`;
  });
}

await browser.close();
await server.close();
