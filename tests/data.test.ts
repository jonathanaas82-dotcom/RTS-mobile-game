import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  FACTIONS,
  GODS,
  POWERS,
  TECHS,
  UNITS,
  buildingDef,
  godDef,
  isBuilding,
  powerDef,
  techDef,
  unitDef,
} from '../src/data';

describe('game data', () => {
  it('every reference resolves', () => {
    for (const u of UNITS) {
      expect(isBuilding(u.trainedAt), `${u.id}.trainedAt`).toBe(true);
      if (u.god) expect(godDef(u.god).mythic).toBe(u.id);
    }
    for (const g of GODS) {
      powerDef(g.power);
      if (g.mythic) expect(unitDef(g.mythic).cls).toBe('mythic');
      if (g.tech) expect(techDef(g.tech).god).toBe(g.id);
    }
    for (const t of TECHS) {
      buildingDef(t.building);
      for (const r of t.requires ?? []) techDef(r);
    }
    for (const p of POWERS) if (p.unit) unitDef(p.unit);
  });

  it('each faction has a full roster and gods for every age', () => {
    for (const f of FACTIONS) {
      expect(unitDef(f.worker).cls).toBe('worker');
      for (const cls of ['infantry', 'ranged', 'cavalry', 'siege', 'hero'] as const) {
        expect(
          UNITS.some((u) => u.faction === f.id && u.cls === cls),
          `${f.id} ${cls}`,
        ).toBe(true);
      }
      expect(UNITS.filter((u) => u.faction === f.id && u.cls === 'mythic').length).toBe(4);
      expect(f.majorGods.length).toBeGreaterThanOrEqual(2);
      for (const g of f.majorGods) expect(godDef(g)).toMatchObject({ faction: f.id, age: 0 });
      for (const age of [1, 2, 3] as const) {
        for (const g of f.minorGods[age]) expect(godDef(g)).toMatchObject({ faction: f.id, age });
      }
    }
  });

  it('values are sane', () => {
    for (const u of UNITS) {
      expect(u.hp).toBeGreaterThan(0);
      expect(u.speed).toBeGreaterThan(0);
      expect(u.armor).toBeLessThan(0.8);
      if (u.cls === 'mythic') expect(u.cost.favor ?? 0).toBeGreaterThan(0);
    }
    for (const b of BUILDINGS) expect(b.size).toBeGreaterThanOrEqual(2);
  });
});
