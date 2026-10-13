import { describe, expect, it } from 'vitest';
import { createMatch } from '../src/game/match';
import type { Difficulty } from '../src/sim/world';

function match(seed: number, a: Difficulty, b: Difficulty) {
  return createMatch({
    seed,
    mapSize: 64,
    players: [
      { faction: 'hrimfolk', majorGod: 'thunrak', ai: a },
      { faction: 'aurelian', majorGod: 'aetheon', ai: b },
    ],
  });
}

function runMinutes(sim: ReturnType<typeof match>['sim'], min: number): void {
  for (let i = 0; i < min * 60 * 20 && sim.world.winner < 0; i++) sim.step();
}

describe('AI', () => {
  it('builds an economy: workers, houses, barracks', () => {
    const { sim } = match(3, 'normal', 'passive');
    runMinutes(sim, 6);
    const w = sim.world;
    const mine = w.entities.filter((e) => e.owner === 0);
    expect(mine.filter((e) => e.cls === 'worker').length).toBeGreaterThanOrEqual(14);
    expect(mine.some((e) => e.def === 'house')).toBe(true);
    expect(mine.some((e) => e.def === 'barracks')).toBe(true);
    expect(w.players[0]!.popCap).toBeGreaterThan(10);
  });

  it('advances ages and fields an army', () => {
    const { sim, ais } = match(4, 'normal', 'passive');
    runMinutes(sim, 12);
    const p = sim.world.players[0]!;
    expect(p.age).toBeGreaterThanOrEqual(1);
    expect(
      sim.world.entities.filter((e) => e.owner === 0 && e.kind === 'unit' && e.cls !== 'worker')
        .length,
    ).toBeGreaterThan(5);
    expect(ais[0]!.debugText()).toContain('AI normal');
  });

  it('only Hard gets an (explicit) gather bonus', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const { sim } = match(5, d, 'passive');
      expect(sim.world.players[0]!.handicapGather).toBe(d === 'hard' ? 1.15 : 1);
    }
  });

  it('a passive AI never attacks', () => {
    const { sim } = match(6, 'passive', 'passive');
    runMinutes(sim, 8);
    expect(sim.world.entities.some((e) => e.kind === 'unit' && e.cls !== 'worker')).toBe(false);
  });

  it('Normal destroys a passive opponent', () => {
    const { sim } = match(7, 'normal', 'passive');
    runMinutes(sim, 30);
    expect(sim.world.winner).toBe(0);
  }, 120_000);

  it('Hard beats Easy', () => {
    const { sim } = match(5, 'hard', 'easy');
    runMinutes(sim, 45);
    expect(sim.world.winner).toBe(0);
  }, 120_000);

  it('AI matches are deterministic', () => {
    const a = match(8, 'normal', 'normal');
    const b = match(8, 'normal', 'normal');
    runMinutes(a.sim, 3);
    runMinutes(b.sim, 3);
    const sig = (s: typeof a.sim) =>
      s.world.entities.map((e) => `${e.id}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|');
    expect(sig(a.sim)).toBe(sig(b.sim));
  });
});
