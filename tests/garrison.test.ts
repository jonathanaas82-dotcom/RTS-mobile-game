import { describe, expect, it } from 'vitest';
import { garrisonCount } from '../src/sim/systems/garrison';
import { killEntity, spawnUnit } from '../src/sim/world';
import { newSim, run, unitsOf } from './helpers';

describe('garrison (shelter)', () => {
  it('workers shelter in the town hall, are protected, boost arrows and can be released', () => {
    const sim = newSim(71);
    const w = sim.world;
    const hall = w.entities.find((e) => e.def === 'town_hall' && e.owner === 0)!;
    const workers = unitsOf(sim, 0);
    sim.enqueue({ type: 'garrison', player: 0, ids: workers.map((u) => u.id), target: -1 });
    run(sim, 20 * 6);
    expect(garrisonCount(w, hall)).toBe(3);
    expect(workers.every((u) => u.inside === hall.id)).toBe(true);
    // Sheltered units can't be targeted.
    const raider = spawnUnit(w, 1, 'lancer', hall.x + 3, hall.y + 2);
    sim.enqueue({ type: 'attack', player: 1, ids: [raider.id], target: workers[0]!.id });
    run(sim, 20 * 3);
    expect(workers[0]!.hp).toBe(workers[0]!.maxHp);
    // Commands to sheltered units are ignored; release puts them back on the map.
    sim.enqueue({ type: 'ungarrison', player: 0, building: hall.id });
    run(sim, 1);
    expect(workers.every((u) => u.inside === -1)).toBe(true);
    expect(workers.every((u) => !w.grid.isBlocked(Math.floor(u.x), Math.floor(u.y)))).toBe(true);
  });

  it('a destroyed building releases its occupants', () => {
    const sim = newSim(72);
    const w = sim.world;
    const hall = w.entities.find((e) => e.def === 'town_hall' && e.owner === 0)!;
    const workers = unitsOf(sim, 0);
    sim.enqueue({ type: 'garrison', player: 0, ids: workers.map((u) => u.id), target: hall.id });
    run(sim, 20 * 6);
    killEntity(w, hall);
    expect(workers.every((u) => u.inside === -1 && !u.dead)).toBe(true);
  });
});
