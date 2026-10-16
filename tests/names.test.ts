import { describe, expect, it } from 'vitest';
import { GODS, POWERS, UNITS, buildingName, godDef, loc } from '../src/data';

describe('display names', () => {
  it('uses faction-specific building names with a shared fallback', () => {
    expect(loc(buildingName('house', 'hrimfolk'), 'en')).toBe('Longhouse');
    expect(loc(buildingName('temple', 'hrimfolk'), 'nb')).toBe('Hov');
    expect(loc(buildingName('house', 'aurelian'), 'en')).toBe('House');
    expect(loc(buildingName('barracks', 'hrimfolk'), 'nb')).toBe('Krigerhall');
    expect(loc(buildingName('stable', 'hrimfolk'), 'nb')).toBe('Stall');
    expect(loc(buildingName('town_hall'), 'en')).toBe('Town Hall');
  });

  it('gives every Norse god, power and unit English and Norwegian text', () => {
    expect(loc(godDef('thunrak').name, 'nb')).toBe('Tor');
    for (const g of GODS.filter((x) => x.faction === 'hrimfolk')) {
      expect(g.name.nb, g.id).toBeTruthy();
      expect(g.title.nb, g.id).toBeTruthy();
      const p = POWERS.find((x) => x.id === g.power)!;
      expect(p.name.nb && p.desc.nb, p.id).toBeTruthy();
    }
    for (const u of UNITS.filter((x) => x.faction === 'hrimfolk')) {
      expect(u.name.nb, u.id).toBeTruthy();
      expect(u.role?.en && u.role.nb, u.id).toBeTruthy();
    }
  });
});
