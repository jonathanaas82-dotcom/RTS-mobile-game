import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { hashWorld } from '../src/sim/world';
import { newSim, run, testConfig, unitsOf } from './helpers';

describe('Simulation', () => {
  it('advances ticks and runs systems in order', () => {
    const order: string[] = [];
    const sim = new Simulation(testConfig(), [() => order.push('a'), () => order.push('b')]);
    sim.step();
    sim.step();
    expect(sim.world.tick).toBe(2);
    expect(order).toEqual(['a', 'b', 'a', 'b']);
  });

  it('creates starting town halls and workers for both players', () => {
    const sim = newSim();
    for (const p of [0, 1]) {
      expect(sim.world.entities.some((e) => e.owner === p && e.def === 'town_hall')).toBe(true);
      expect(unitsOf(sim, p)).toHaveLength(3);
      expect(sim.world.players[p]!.popCap).toBe(10);
      expect(sim.world.players[p]!.pop).toBe(3);
    }
  });

  it('applies commands at their scheduled tick and records history', () => {
    const sim = newSim();
    const ids = unitsOf(sim, 0).map((u) => u.id);
    sim.enqueue({ type: 'stop', player: 0, ids }, 2);
    sim.step();
    expect(sim.history).toHaveLength(0);
    sim.step();
    sim.step();
    expect(sim.history).toEqual([{ tick: 2, command: { type: 'stop', player: 0, ids } }]);
  });

  it('is deterministic: same seed and commands give the same hash', () => {
    const play = () => {
      const sim = newSim();
      const ids = unitsOf(sim, 0).map((u) => u.id);
      const s1 = sim.world.map.starts[1]!;
      sim.enqueue({ type: 'move', player: 0, ids, x: s1.x - 6, y: s1.y - 6 });
      run(sim, 200);
      return hashWorld(sim.world);
    };
    expect(play()).toBe(play());
    expect(hashWorld(newSim(78).world)).not.toBe(hashWorld(newSim(77).world));
  });

  it('ignores commands for units the player does not own', () => {
    const sim = newSim();
    const enemy = unitsOf(sim, 1)[0]!;
    const before = { x: enemy.x, y: enemy.y };
    sim.enqueue({ type: 'move', player: 0, ids: [enemy.id], x: 5, y: 5 });
    run(sim, 40);
    expect({ x: enemy.x, y: enemy.y }).toEqual(before);
  });
});
