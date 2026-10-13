import { ECONOMY, type ResourceKind } from '../data/balance/economy';
import { buildingDef, factionDef, godDef, isBuilding, unitDef } from '../data';
import type { AgeIndex, Cost, FactionId, Modifier, StatKey, UnitClass } from '../data/types';

export interface PowerState {
  id: string;
  /** Tick from which it can be cast again. */
  readyAt: number;
}

/** A timed player-wide modifier (boost god powers, hero rally). */
export interface TimedModifier {
  mod: Modifier;
  until: number;
}

export interface PlayerStats {
  unitsTrained: number;
  unitsKilled: number;
  unitsLost: number;
  buildingsBuilt: number;
  buildingsLost: number;
  gathered: number;
}

export interface PlayerState {
  id: number;
  faction: FactionId;
  majorGod: string;
  /** Minor gods chosen, one per age advanced. */
  gods: string[];
  age: AgeIndex;
  res: Record<ResourceKind, number>;
  pop: number;
  popCap: number;
  techs: string[];
  /** Permanent modifiers (faction, gods, techs). */
  mods: Modifier[];
  timed: TimedModifier[];
  powers: PowerState[];
  /** True while an age advance is being researched (blocks a second one). */
  advancing: boolean;
  defeated: boolean;
  /** Fractional favor accumulator to keep integer-ish display stable. */
  stats: PlayerStats;
  /** Bumped whenever modifiers change, invalidating the stat cache. */
  modVersion: number;
  cache: Map<string, number>;
  cacheVersion: number;
  /** Extra gather multiplier (Hard AI bonus). Explicit and shown in the UI. */
  handicapGather: number;
}

export function createPlayer(id: number, faction: FactionId, majorGod: string): PlayerState {
  const f = factionDef(faction);
  const god = godDef(majorGod);
  return {
    id,
    faction,
    majorGod,
    gods: [],
    age: 0,
    res: { ...ECONOMY.startingResources },
    pop: 0,
    popCap: 0,
    techs: [],
    mods: [...f.bonuses, ...god.bonuses],
    timed: [],
    powers: [{ id: god.power, readyAt: 0 }],
    advancing: false,
    defeated: false,
    stats: {
      unitsTrained: 0,
      unitsKilled: 0,
      unitsLost: 0,
      buildingsBuilt: 0,
      buildingsLost: 0,
      gathered: 0,
    },
    modVersion: 0,
    cache: new Map(),
    cacheVersion: -1,
    handicapGather: 1,
  };
}

function applies(
  m: Modifier,
  stat: StatKey,
  cls: UnitClass,
  id: string,
  resource?: ResourceKind,
): boolean {
  if (m.stat !== stat) return false;
  if (m.classes && !m.classes.includes(cls)) return false;
  if (m.ids && !m.ids.includes(id)) return false;
  if (m.resource && m.resource !== resource) return false;
  return true;
}

/**
 * Apply all of a player's modifiers to a base value. Multipliers multiply, additions add after.
 * Cached per (stat, class, id, resource) until modifiers change.
 */
export function modified(
  p: PlayerState,
  tick: number,
  stat: StatKey,
  base: number,
  cls: UnitClass,
  id: string,
  resource?: ResourceKind,
): number {
  if (p.cacheVersion !== p.modVersion) {
    p.cache.clear();
    p.cacheVersion = p.modVersion;
  }
  const key = `${stat}|${cls}|${id}|${resource ?? ''}`;
  let factor = p.cache.get(key);
  let add = p.cache.get(key + '+');
  if (factor === undefined || add === undefined) {
    factor = 1;
    add = 0;
    for (const m of p.mods) {
      if (!applies(m, stat, cls, id, resource)) continue;
      if (m.mul !== undefined) factor *= m.mul;
      if (m.add !== undefined) add += m.add;
    }
    p.cache.set(key, factor);
    p.cache.set(key + '+', add);
  }
  // Timed modifiers are few and short-lived: not cached.
  for (const t of p.timed) {
    if (t.until <= tick || !applies(t.mod, stat, cls, id, resource)) continue;
    if (t.mod.mul !== undefined) factor *= t.mod.mul;
    if (t.mod.add !== undefined) add += t.mod.add;
  }
  return base * factor + add;
}

export function addMods(p: PlayerState, mods: Modifier[]): void {
  p.mods.push(...mods);
  p.modVersion++;
}

/** Effective cost of a unit or building for this player. */
export function costOf(p: PlayerState, tick: number, id: string): Cost {
  let base: Cost;
  let cls: UnitClass;
  if (isBuilding(id)) {
    base = buildingDef(id).cost;
    cls = 'building';
  } else {
    const u = unitDef(id);
    base = u.cost;
    cls = u.cls;
  }
  const out: Cost = {};
  for (const k of Object.keys(base) as ResourceKind[]) {
    out[k] = Math.round(modified(p, tick, 'cost', base[k] ?? 0, cls, id));
  }
  return out;
}

export function canAfford(p: PlayerState, cost: Cost): boolean {
  for (const k of Object.keys(cost) as ResourceKind[]) {
    if (p.res[k] < (cost[k] ?? 0)) return false;
  }
  return true;
}

export function pay(p: PlayerState, cost: Cost): void {
  for (const k of Object.keys(cost) as ResourceKind[]) p.res[k] -= cost[k] ?? 0;
}

export function refund(p: PlayerState, cost: Cost): void {
  for (const k of Object.keys(cost) as ResourceKind[]) p.res[k] += cost[k] ?? 0;
}

export const START_POP_CAP = ECONOMY.startingPopCap;
