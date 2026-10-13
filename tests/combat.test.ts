import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/sim/systems/combat';
import { killEntity, spawnUnit } from '../src/sim/world';
import { newSim, run, unitsOf } from './helpers';

/** Open spot in the middle of the map. */
function arena(sim: ReturnType<typeof newSim>): { x: number; y: number } {
  const w = sim.world;
  const i = w.grid.nearestWalkable(w.map.width / 2, w.map.height / 2);
  return { x: (i % w.map.width) + 0.5, y: Math.floor(i / w.map.width) + 0.5 };
}

describe('combat', () => {
  it('counters: infantry beats cavalry one-on-one', () => {
    const sim = newSim(21);
    const a = arena(sim);
    const inf = spawnUnit(sim.world, 0, 'shieldbrother', a.x, a.y);
    const cav = spawnUnit(sim.world, 1, 'lancer', a.x + 1, a.y);
    sim.enqueue({ type: 'attack', player: 0, ids: [inf.id], target: cav.id });
    run(sim, 20 * 40);
    expect(cav.dead).toBe(true);
    expect(inf.dead).toBe(false);
  });

  it('counter multiplier and armor shape damage', () => {
    const sim = newSim(22);
    const a = arena(sim);
    const target = spawnUnit(sim.world, 1, 'lancer', a.x, a.y);
    const hp0 = target.hp;
    const dmg = applyDamage(sim.world, { owner: 0, cls: 'infantry', entity: null }, target, 10);
    expect(dmg).toBeCloseTo(10 * 1.7 * (1 - 0.1));
    expect(target.hp).toBeCloseTo(hp0 - dmg);
  });

  it('ranged units fire projectiles that hit', () => {
    const sim = newSim(23);
    const a = arena(sim);
    const archer = spawnUnit(sim.world, 0, 'ravenbow', a.x, a.y);
    const victim = spawnUnit(sim.world, 1, 'bronzeguard', a.x + 4, a.y);
    sim.enqueue({ type: 'attack', player: 0, ids: [archer.id], target: victim.id });
    let sawProjectile = false;
    for (let i = 0; i < 60; i++) {
      sim.step();
      if (sim.world.projectiles.length > 0) sawProjectile = true;
    }
    expect(sawProjectile).toBe(true);
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });

  it('idle military units auto-engage enemies in sight', () => {
    const sim = newSim(24);
    const a = arena(sim);
    const guard = spawnUnit(sim.world, 0, 'shieldbrother', a.x, a.y);
    const intruder = spawnUnit(sim.world, 1, 'slinger', a.x + 3, a.y);
    run(sim, 20 * 20);
    expect(intruder.dead || guard.dead).toBe(true);
  });

  it('town halls shoot at nearby enemies', () => {
    const sim = newSim(25);
    const hall = sim.world.entities.find((e) => e.def === 'town_hall' && e.owner === 0)!;
    const raider = spawnUnit(sim.world, 1, 'citizen', hall.x + 3, hall.y + 2);
    run(sim, 20 * 8);
    expect(raider.hp).toBeLessThan(raider.maxHp);
  });

  it('heroes stun with Thunderclap', () => {
    const sim = newSim(26);
    const a = arena(sim);
    const hero = spawnUnit(sim.world, 0, 'stormsworn', a.x, a.y);
    const foe = spawnUnit(sim.world, 1, 'bronzeguard', a.x + 1, a.y);
    run(sim, 1);
    sim.enqueue({ type: 'ability', player: 0, id: hero.id });
    run(sim, 2);
    expect(foe.stunUntil).toBeGreaterThan(sim.world.tick);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it('hrimfolk earn favor from fighting', () => {
    const sim = newSim(27);
    const a = arena(sim);
    const p = sim.world.players[0]!;
    const inf = spawnUnit(sim.world, 0, 'shieldbrother', a.x, a.y);
    spawnUnit(sim.world, 1, 'bronzeguard', a.x + 1, a.y);
    sim.enqueue({
      type: 'attack',
      player: 0,
      ids: [inf.id],
      target: unitsOf(sim, 1, 'bronzeguard')[0]!.id,
    });
    run(sim, 20 * 10);
    expect(p.res.favor).toBeGreaterThan(0);
  });
});

describe('fog of war', () => {
  it('own base is visible, enemy base unexplored at start', () => {
    const sim = newSim(28);
    const w = sim.world;
    const fog = w.fog[0]!;
    const [s0, s1] = w.map.starts as [{ x: number; y: number }, { x: number; y: number }];
    expect(fog[s0.y * w.map.width + s0.x]).toBe(2);
    expect(fog[s1.y * w.map.width + s1.x]).toBe(0);
  });

  it('areas become explored after units leave', () => {
    const sim = newSim(29);
    const w = sim.world;
    const scout = unitsOf(sim, 0)[0]!;
    const a = arena(sim);
    sim.enqueue({ type: 'move', player: 0, ids: [scout.id], x: a.x, y: a.y });
    run(sim, 20 * 25);
    const i = Math.floor(scout.y) * w.map.width + Math.floor(scout.x);
    expect(w.fog[0]![i]).toBe(2);
    sim.enqueue({
      type: 'move',
      player: 0,
      ids: [scout.id],
      x: w.map.starts[0]!.x,
      y: w.map.starts[0]!.y + 3,
    });
    run(sim, 20 * 25);
    expect(w.fog[0]![i]).toBe(1);
  });
});

describe('victory', () => {
  it('a player with no town hall and no army is defeated', () => {
    const sim = newSim(30);
    const w = sim.world;
    for (const e of w.entities) if (e.owner === 1 && e.kind === 'building') killEntity(w, e);
    run(sim, 40);
    expect(w.players[1]!.defeated).toBe(true);
    expect(w.winner).toBe(0);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('resigning ends the match', () => {
    const sim = newSim(31);
    sim.enqueue({ type: 'resign', player: 0 });
    run(sim, 2);
    expect(sim.world.winner).toBe(1);
  });
});
