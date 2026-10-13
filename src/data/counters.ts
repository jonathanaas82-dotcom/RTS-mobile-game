import type { UnitClass } from './types';

/**
 * Damage multipliers: COUNTERS[attacker][target]. Missing entries = 1.
 * infantry > cavalry > ranged > infantry · heroes ≫ mythic · mythic > infantry/cavalry ·
 * ranged > mythic (mild) · siege ≫ buildings.
 */
export const COUNTERS: Partial<Record<UnitClass, Partial<Record<UnitClass, number>>>> = {
  worker: { building: 0.4, mythic: 0.5, hero: 0.5 },
  infantry: { cavalry: 1.7, ranged: 0.85, siege: 1.6, mythic: 0.6, building: 0.3 },
  cavalry: { ranged: 1.8, infantry: 0.75, siege: 2.0, worker: 1.4, mythic: 0.6, building: 0.25 },
  ranged: { infantry: 1.6, cavalry: 0.7, mythic: 1.3, building: 0.15 },
  siege: {
    building: 5,
    infantry: 0.35,
    cavalry: 0.3,
    ranged: 0.4,
    worker: 0.4,
    mythic: 0.5,
    hero: 0.4,
  },
  hero: { mythic: 3, building: 0.5 },
  mythic: { infantry: 1.6, cavalry: 1.4, worker: 1.5, hero: 0.6, building: 1.2 },
  building: { siege: 0.6 },
};

export function counterMultiplier(attacker: UnitClass, target: UnitClass): number {
  return COUNTERS[attacker]?.[target] ?? 1;
}

/** Classes this class deals ≥1.5× damage to / takes ≥1.5× damage from (for UI hints). */
export function strongAgainst(cls: UnitClass): UnitClass[] {
  const row = COUNTERS[cls] ?? {};
  return (Object.keys(row) as UnitClass[]).filter((k) => (row[k] ?? 1) >= 1.5);
}

export function weakAgainst(cls: UnitClass): UnitClass[] {
  return (Object.keys(COUNTERS) as UnitClass[]).filter(
    (a) => a !== 'building' && (COUNTERS[a]?.[cls] ?? 1) >= 1.5,
  );
}
