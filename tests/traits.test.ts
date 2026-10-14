import { describe, expect, it } from 'vitest';
import { UNITS, unitDef } from '../src/data';
import { counterMultiplier } from '../src/data/counters';
import { TRAIT, TRAITS } from '../src/data/traits';
import { applyDamage } from '../src/sim/systems/combat';
import { spawnUnit, type World } from '../src/sim/world';
import type { UnitClass } from '../src/data/types';
import { newSim, run } from './helpers';

/** Damage a fresh unit of `def` takes from a source of class `cls` (no source entity). */
function taken(world: World, def: string, cls: UnitClass, ranged = false, x = 20, y = 20): number {
  const t = spawnUnit(world, 1, def, x, y);
  world.spatial.rebuild(world.entities);
  const before = t.hp;
  applyDamage(world, { owner: 0, cls, entity: null }, t, 40, false, ranged);
  return before - t.hp;
}

/** Damage dealt by an attacker entity to a fresh dummy target. */
function dealt(world: World, attacker: ReturnType<typeof spawnUnit>, x: number, y: number): number {
  const t = spawnUnit(world, 1, 'citizen', x, y);
  world.spatial.rebuild(world.entities);
  const before = t.hp;
  applyDamage(world, { owner: 0, cls: attacker.cls as UnitClass, entity: attacker }, t, 10);
  return before - t.hp;
}

describe('unit traits', () => {
  it('every trait used by a unit has a name and description', () => {
    for (const u of UNITS)
      for (const tr of u.traits ?? []) {
        expect(TRAITS[tr]?.name.en, `${u.id}:${tr}`).toBeTruthy();
        expect(TRAITS[tr]?.desc.en).toBeTruthy();
      }
  });

  it('each faction fields several distinct traits', () => {
    for (const f of ['hrimfolk', 'aurelian', 'sahrun'] as const) {
      const set = new Set(UNITS.filter((u) => u.faction === f).flatMap((u) => u.traits ?? []));
      expect(set.size).toBeGreaterThanOrEqual(5);
    }
  });

  it('shield wall reduces missile damage only', () => {
    const w = newSim(3).world;
    const melee = taken(w, 'shieldbrother', 'ranged', false);
    const missile = taken(w, 'shieldbrother', 'ranged', true, 22, 20);
    expect(missile / melee).toBeCloseTo(TRAIT.shieldwallTaken, 1);
  });

  it('braced spears take less from cavalry', () => {
    const w = newSim(4).world;
    const d = taken(w, 'spearwarden', 'cavalry');
    const armor = unitDef('spearwarden').armor;
    expect(d).toBeCloseTo(
      40 * counterMultiplier('cavalry', 'infantry') * TRAIT.braceTaken * (1 - armor),
      3,
    );
  });

  it('frenzy hits harder when wounded', () => {
    const w = newSim(5).world;
    const a = spawnUnit(w, 0, 'wildheart', 10, 10);
    const full = dealt(w, a, 11, 10);
    a.hp = a.maxHp / 2;
    const half = dealt(w, a, 11, 11);
    expect(half / full).toBeCloseTo(1 + TRAIT.frenzyMax / 2, 1);
  });

  it('inspire boosts nearby allies', () => {
    const w = newSim(6).world;
    const a = spawnUnit(w, 0, 'shieldbrother', 10, 10);
    const alone = dealt(w, a, 11, 10);
    spawnUnit(w, 0, 'hornblower', 10.5, 10.5);
    const inspired = dealt(w, a, 11, 11);
    expect(inspired / alone).toBeCloseTo(TRAIT.inspireDamage, 2);
  });

  it('phalanx gains armour next to friendly infantry', () => {
    const w = newSim(7).world;
    const alone = taken(w, 'bronzeguard', 'infantry', false, 10, 10);
    for (const [dx, dy] of [
      [0.6, 0],
      [-0.6, 0],
      [0, 0.6],
      [0, -0.6],
    ])
      spawnUnit(w, 1, 'bronzeguard', 30 + dx!, 30 + dy!);
    const packed = taken(w, 'bronzeguard', 'infantry', false, 30, 30);
    expect(packed).toBeLessThan(alone);
  });

  it('cavalry charge fires on the first blow only', () => {
    const sim = newSim(8);
    const w = sim.world;
    const rider = spawnUnit(w, 0, 'wolfrider', 20, 20);
    const foe = spawnUnit(w, 1, 'citizen', 20.9, 20);
    foe.hp = foe.maxHp = 5000;
    rider.order = { type: 'attack', x: 0, y: 0, target: foe.id, tile: -1 };
    let charges = 0;
    for (let i = 0; i < 20 * 6; i++) {
      sim.step();
      charges += sim.drainEvents().filter((e) => e.type === 'charge' && e.id === rider.id).length;
    }
    expect(charges).toBe(1);
  });

  it('regenerating units heal out of combat', () => {
    const sim = newSim(9);
    const m = spawnUnit(sim.world, 0, 'rimehulk', 5, 5);
    m.hp = m.maxHp / 2;
    run(sim, 20 * 15);
    expect(m.hp).toBeGreaterThan(m.maxHp / 2 + 10);
  });
});
