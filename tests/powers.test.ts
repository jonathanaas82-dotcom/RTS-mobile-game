import { buildingDef } from '../src/data';
import { describe, expect, it } from 'vitest';
import { modified } from '../src/sim/player';
import { placeBuilding, spawnUnit } from '../src/sim/world';
import { newSim, run, testConfig, unitsOf } from './helpers';
import { Simulation } from '../src/sim/simulation';

function arena(sim: Simulation): { x: number; y: number } {
  const w = sim.world;
  const i = w.grid.nearestWalkable(w.map.width / 2, w.map.height / 2);
  return { x: (i % w.map.width) + 0.5, y: Math.floor(i / w.map.width) + 0.5 };
}

function grant(sim: Simulation, power: string, owner = 0) {
  const p = sim.world.players[owner]!;
  p.res.favor = 200;
  if (!p.powers.some((x) => x.id === power)) p.powers.push({ id: power, readyAt: 0 });
  return p;
}

describe('god powers', () => {
  it('strike damages enemies in the area, costs favor and goes on cooldown', () => {
    const sim = newSim(51);
    const a = arena(sim);
    const p = grant(sim, 'skyhammer');
    const foes = [0, 1, 2].map((i) => spawnUnit(sim.world, 1, 'bronzeguard', a.x + i * 0.4, a.y));
    const friend = spawnUnit(sim.world, 0, 'shieldbrother', a.x, a.y + 0.5);
    run(sim, 1);
    sim.enqueue({ type: 'castPower', player: 0, power: 'skyhammer', x: a.x, y: a.y });
    run(sim, 2);
    expect(foes.every((f) => f.dead || f.hp < f.maxHp)).toBe(true);
    expect(friend.hp).toBe(friend.maxHp);
    expect(p.res.favor).toBe(175);
    // Second cast is rejected while on cooldown (Norse may still earn a little Favor from the
    // survivors' blows, but nothing is spent).
    sim.enqueue({ type: 'castPower', player: 0, power: 'skyhammer', x: a.x, y: a.y });
    run(sim, 2);
    expect(p.res.favor).toBeGreaterThanOrEqual(175);
  });

  it('cannot cast without enough favor', () => {
    const sim = newSim(52);
    const p = sim.world.players[0]!;
    p.res.favor = 5;
    sim.enqueue({ type: 'castPower', player: 0, power: 'skyhammer', x: 10, y: 10 });
    run(sim, 2);
    expect(p.powers[0]!.readyAt).toBe(0);
  });

  it('freeze stuns, slow slows, dot damages over time, heal heals', () => {
    const sim = newSim(53);
    const a = arena(sim);
    for (const pw of ['whiteout', 'sandstorm_veil', 'sunfire_lens', 'radiant_ward']) grant(sim, pw);
    const f1 = spawnUnit(sim.world, 1, 'bronzeguard', a.x, a.y);
    run(sim, 1);
    sim.enqueue({ type: 'castPower', player: 0, power: 'whiteout', x: a.x, y: a.y });
    run(sim, 2);
    expect(f1.stunUntil).toBeGreaterThan(sim.world.tick + 20);
    sim.enqueue({ type: 'castPower', player: 0, power: 'sandstorm_veil', x: a.x, y: a.y });
    run(sim, 3);
    expect(f1.slowUntil).toBeGreaterThan(sim.world.tick);
    const hp0 = f1.hp;
    sim.enqueue({ type: 'castPower', player: 0, power: 'sunfire_lens', x: a.x, y: a.y });
    run(sim, 40);
    expect(f1.hp).toBeLessThan(hp0);
    const hurt = spawnUnit(sim.world, 0, 'shieldbrother', a.x + 10, a.y);
    hurt.hp = 20;
    run(sim, 1);
    sim.enqueue({ type: 'castPower', player: 0, power: 'radiant_ward', x: hurt.x, y: hurt.y });
    run(sim, 60);
    expect(hurt.hp).toBeGreaterThan(40);
  });

  it('summons temporary units that expire', () => {
    const sim = newSim(54);
    const a = arena(sim);
    grant(sim, 'wild_hunt');
    const before = unitsOf(sim, 0, 'wolfrider').length;
    sim.enqueue({ type: 'castPower', player: 0, power: 'wild_hunt', x: a.x, y: a.y });
    run(sim, 2);
    expect(unitsOf(sim, 0, 'wolfrider').length).toBe(before + 4);
    run(sim, 20 * 46);
    expect(unitsOf(sim, 0, 'wolfrider').length).toBe(before);
  });

  it('boost powers apply timed modifiers', () => {
    const sim = newSim(55);
    const p = grant(sim, 'golden_flood');
    const base = modified(p, sim.world.tick, 'gather', 1, 'worker', 'hearthkin', 'gold');
    sim.enqueue({ type: 'castPower', player: 0, power: 'golden_flood', x: 0, y: 0 });
    run(sim, 2);
    expect(modified(p, sim.world.tick, 'gather', 1, 'worker', 'hearthkin', 'gold')).toBeCloseTo(
      base * 1.8,
    );
    run(sim, 20 * 46);
    expect(modified(p, sim.world.tick, 'gather', 1, 'worker', 'hearthkin', 'gold')).toBeCloseTo(
      base,
    );
  });

  it('untargeted powers work when the player owns units before buildings in the list', () => {
    const sim = newSim(58);
    const p = grant(sim, 'bountiful');
    // Units created before the town hall in entity order must not break the hall lookup.
    sim.world.entities.unshift(sim.world.entities.pop()!);
    sim.enqueue({ type: 'castPower', player: 0, power: 'bountiful', x: 0, y: 0 });
    run(sim, 2);
    expect(p.timed.length).toBe(1);
  });

  it('reveal uncovers fog in the area', () => {
    const sim = newSim(56);
    grant(sim, 'farsight');
    const s1 = sim.world.map.starts[1]!;
    const i = s1.y * sim.world.map.width + s1.x;
    expect(sim.world.fog[0]![i]).toBe(0);
    sim.enqueue({ type: 'castPower', player: 0, power: 'farsight', x: s1.x, y: s1.y });
    run(sim, 2);
    expect(sim.world.fog[0]![i]).toBe(2);
  });
});

describe('favor income', () => {
  it('Aurelian shrines and Sahrun monuments generate favor', () => {
    const cfg = testConfig(57);
    cfg.players = [
      { faction: 'aurelian', majorGod: 'aetheon', ai: null },
      { faction: 'sahrun', majorGod: 'merit_asha', ai: null },
    ];
    const sim = new Simulation(cfg);
    const w = sim.world;
    for (const owner of [0, 1]) {
      const s = w.map.starts[owner]!;
      let done = false;
      for (let r = 3; r < 12 && !done; r++)
        for (let dy = -r; dy <= r && !done; dy++)
          for (let dx = -r; dx <= r && !done; dx++)
            if (w.grid.canPlace(s.x + dx, s.y + dy, 2)) {
              placeBuilding(
                w,
                owner,
                owner === 0 ? 'shrine' : 'monument',
                s.x + dx,
                s.y + dy,
                true,
              );
              done = true;
            }
    }
    run(sim, 20 * 30);
    expect(w.players[0]!.res.favor).toBeCloseTo(buildingDef('shrine').favorRate! * 30, 0);
    // Merit-Asha: +25% monument favor.
    expect(w.players[1]!.res.favor).toBeCloseTo(buildingDef('monument').favorRate! * 1.25 * 30, 0);
  });
});
