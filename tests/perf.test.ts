import { describe, expect, it } from 'vitest';
import { spawnUnit } from '../src/sim/world';
import { newSim } from './helpers';

describe('performance', () => {
  it('simulates a 200-unit battle within budget', () => {
    const sim = newSim(61, 64);
    const w = sim.world;
    const cx = w.map.width / 2;
    const cy = w.map.height / 2;
    const defs0 = ['shieldbrother', 'ravenbow', 'wolfrider'];
    const defs1 = ['bronzeguard', 'slinger', 'lancer'];
    for (let i = 0; i < 100; i++) {
      spawnUnit(w, 0, defs0[i % 3]!, cx - 6 + (i % 10) * 0.6, cy - 3 + Math.floor(i / 10) * 0.6);
      spawnUnit(w, 1, defs1[i % 3]!, cx + 6 - (i % 10) * 0.6, cy - 3 + Math.floor(i / 10) * 0.6);
    }
    const ids0 = w.entities
      .filter((e) => e.owner === 0 && e.cls !== 'worker' && e.kind === 'unit')
      .map((e) => e.id);
    const ids1 = w.entities
      .filter((e) => e.owner === 1 && e.cls !== 'worker' && e.kind === 'unit')
      .map((e) => e.id);
    sim.enqueue({ type: 'attackMove', player: 0, ids: ids0, x: cx + 8, y: cy });
    sim.enqueue({ type: 'attackMove', player: 1, ids: ids1, x: cx - 8, y: cy });
    // Warm up the JIT, then measure.
    for (let i = 0; i < 40; i++) sim.step();
    const ticks = 400;
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) sim.step();
    const ms = (performance.now() - t0) / ticks;
    console.log(
      `sim: ${ms.toFixed(3)} ms/tick with ${w.entities.filter((e) => e.kind === 'unit').length} units alive`,
    );
    // 20 ticks/s: even 5 ms/tick is only 10% of a frame budget per second on a desktop CPU;
    // phones are ~3-5x slower, so keep a healthy margin.
    expect(ms).toBeLessThan(4);
  });
});
