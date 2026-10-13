import { describe, expect, it } from 'vitest';
import { canResearch, canTrain, heroLimit, trainOptions } from '../src/sim/rules';
import { placeBuilding } from '../src/sim/world';
import { newSim, run } from './helpers';

function rich(sim: ReturnType<typeof newSim>, owner = 0) {
  const p = sim.world.players[owner]!;
  p.res.food = p.res.wood = p.res.gold = 9000;
  p.res.favor = 200;
  return p;
}

function temple(sim: ReturnType<typeof newSim>, owner = 0) {
  const w = sim.world;
  const s = w.map.starts[owner]!;
  for (let r = 3; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (w.grid.canPlace(s.x + dx, s.y + dy, 3))
          return placeBuilding(w, owner, 'temple', s.x + dx, s.y + dy, true);
  throw new Error('no spot');
}

describe('ages and gods', () => {
  it('cannot train heroes in the Archaic age; limit grows with ages', () => {
    const sim = newSim(41);
    const p = rich(sim);
    const t = temple(sim);
    expect(canTrain(sim.world, p, t, 'stormsworn').ok).toBe(false);
    p.age = 1;
    expect(heroLimit(p)).toBe(1);
    expect(canTrain(sim.world, p, t, 'stormsworn').ok).toBe(true);
    sim.enqueue({ type: 'train', player: 0, building: t.id, unit: 'stormsworn' });
    run(sim, 1);
    expect(canTrain(sim.world, p, t, 'stormsworn')).toEqual({ ok: false, reason: 'limit' });
  });

  it('Aurelian League gets an extra hero slot', () => {
    const sim = newSim(42);
    const p = sim.world.players[1]!;
    p.age = 1;
    expect(heroLimit(p)).toBe(2);
  });

  it('mythic units unlock only with their god', () => {
    const sim = newSim(43);
    const p = rich(sim);
    const t = temple(sim);
    p.age = 1;
    expect(trainOptions(p, 'temple').map((u) => u.id)).not.toContain('rimehulk');
    expect(canTrain(sim.world, p, t, 'rimehulk').ok).toBe(false);
    p.gods.push('hrodna');
    expect(trainOptions(p, 'temple').map((u) => u.id)).toContain('rimehulk');
    expect(canTrain(sim.world, p, t, 'rimehulk').ok).toBe(true);
  });

  it('techs respect age, prerequisites and god', () => {
    const sim = newSim(44);
    const p = rich(sim);
    const w = sim.world;
    const s = w.map.starts[0]!;
    let store = null;
    for (let r = 3; r < 12 && !store; r++)
      for (let dy = -r; dy <= r && !store; dy++)
        for (let dx = -r; dx <= r && !store; dx++)
          if (w.grid.canPlace(s.x + dx, s.y + dy, 2))
            store = placeBuilding(w, 0, 'storehouse', s.x + dx, s.y + dy, true);
    expect(canResearch(w, p, store!, 'saws').reason).toBe('age');
    p.age = 2;
    expect(canResearch(w, p, store!, 'saws').reason).toBe('requires');
    p.techs.push('hand_axes');
    expect(canResearch(w, p, store!, 'saws').ok).toBe(true);
    const t = temple(sim);
    expect(canResearch(w, p, t, 'rune_steel').reason).toBe('god');
    p.gods.push('hrodna', 'brakka');
    expect(canResearch(w, p, t, 'rune_steel').ok).toBe(true);
  });

  it('a full age progression to Mythic grants four powers', () => {
    const sim = newSim(45);
    const p = rich(sim);
    const hall = sim.world.entities.find((e) => e.def === 'town_hall' && e.owner === 0)!;
    const gods = ['skarn', 'eldra', 'sigrun'];
    for (const g of gods) {
      sim.enqueue({ type: 'advanceAge', player: 0, building: hall.id, god: g });
      run(sim, 20 * 75);
    }
    expect(p.age).toBe(3);
    expect(p.gods).toEqual(gods);
    expect(p.powers.map((x) => x.id)).toEqual(['skyhammer', 'wild_hunt', 'farsight', 'tempest']);
  });

  it('cannot pick a god from another age or advance twice at once', () => {
    const sim = newSim(46);
    rich(sim);
    const hall = sim.world.entities.find((e) => e.def === 'town_hall' && e.owner === 0)!;
    sim.enqueue({ type: 'advanceAge', player: 0, building: hall.id, god: 'gorm' });
    run(sim, 2);
    expect(hall.queue.length).toBe(0);
    sim.enqueue({ type: 'advanceAge', player: 0, building: hall.id, god: 'hrodna' });
    sim.enqueue({ type: 'advanceAge', player: 0, building: hall.id, god: 'skarn' });
    run(sim, 2);
    expect(hall.queue.length).toBe(1);
  });
});
