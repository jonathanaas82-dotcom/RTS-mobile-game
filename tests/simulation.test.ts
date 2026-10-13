import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { hashWorld } from '../src/sim/world';

describe('Simulation', () => {
  const cfg = { seed: 77, mapSize: 48, players: 2 };

  it('advances ticks and runs systems in order', () => {
    const order: string[] = [];
    const sim = new Simulation(cfg, [() => order.push('a'), () => order.push('b')]);
    sim.step();
    sim.step();
    expect(sim.world.tick).toBe(2);
    expect(order).toEqual(['a', 'b', 'a', 'b']);
  });

  it('applies commands at their scheduled tick and records history', () => {
    const sim = new Simulation(cfg);
    sim.enqueue({ type: 'noop', player: 0 }, 2);
    sim.step();
    expect(sim.history).toHaveLength(0);
    sim.step();
    sim.step();
    expect(sim.history).toEqual([{ tick: 2, command: { type: 'noop', player: 0 } }]);
  });

  it('two runs with the same seed hash identically', () => {
    const a = new Simulation(cfg);
    const b = new Simulation(cfg);
    for (let i = 0; i < 50; i++) {
      a.step();
      b.step();
    }
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    expect(hashWorld(new Simulation({ ...cfg, seed: 78 }).world)).not.toBe(hashWorld(a.world));
  });
});
