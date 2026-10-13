/**
 * Rule queries shared by command validation, the UI command card and the AI, so all three agree
 * on what is allowed.
 */
import { AGES, HERO_LIMIT_BY_AGE } from '../data/factions';
import {
  buildingDef,
  buildingsFor,
  factionDef,
  godDef,
  powerDef,
  techDef,
  techsAt,
  unitDef,
  unitsTrainedAt,
} from '../data';
import { SIM } from '../data/balance/sim';
import type { BuildingDef, Cost, TechDef, UnitDef } from '../data/types';
import type { Entity } from './entity';
import { canAfford, costOf, type PlayerState } from './player';
import type { World } from './world';

export type Denial =
  | 'cost'
  | 'pop'
  | 'limit'
  | 'age'
  | 'god'
  | 'built'
  | 'busy'
  | 'researched'
  | 'requires'
  | 'cooldown'
  | 'favor';

export interface Check {
  ok: boolean;
  reason?: Denial;
}

const OK: Check = { ok: true };
const no = (reason: Denial): Check => ({ ok: false, reason });

export function countOwned(world: World, owner: number, def: string, includeQueued = true): number {
  let n = 0;
  for (const e of world.entities) {
    if (e.dead || e.owner !== owner) continue;
    if (e.def === def) n++;
    if (includeQueued) for (const q of e.queue) if (q.kind === 'unit' && q.id === def) n++;
  }
  return n;
}

export function heroCount(world: World, owner: number): number {
  let n = 0;
  for (const e of world.entities) {
    if (e.dead || e.owner !== owner) continue;
    if (e.cls === 'hero') n++;
    for (const q of e.queue) if (q.kind === 'unit' && unitDef(q.id).cls === 'hero') n++;
  }
  return n;
}

export function heroLimit(p: PlayerState): number {
  return (HERO_LIMIT_BY_AGE[p.age] ?? 0) + (p.faction === 'aurelian' && p.age > 0 ? 1 : 0);
}

/** Is a mythic unit unlocked (its god chosen)? Non-mythic units only need the age. */
export function unitUnlocked(p: PlayerState, u: UnitDef): boolean {
  if (u.faction !== p.faction) return false;
  if (u.age > p.age) return false;
  if (u.god && !p.gods.includes(u.god) && p.majorGod !== u.god) return false;
  return true;
}

/** Units listed on a building's command card (including locked ones, for discoverability). */
export function trainOptions(p: PlayerState, building: string): UnitDef[] {
  return unitsTrainedAt(p.faction, building).filter((u) => !u.god || p.gods.includes(u.god));
}

export function canTrain(world: World, p: PlayerState, b: Entity, unit: string): Check {
  const u = unitDef(unit);
  if (!b.built) return no('built');
  if (u.trainedAt !== b.def || !unitUnlocked(p, u)) return no('age');
  if (b.queue.length >= 5) return no('busy');
  if (u.cls === 'hero' && heroCount(world, p.id) >= heroLimit(p)) return no('limit');
  if (p.pop + u.pop > p.popCap) return no('pop');
  if (!canAfford(p, costOf(p, world.tick, unit))) return no('cost');
  return OK;
}

export function buildOptions(p: PlayerState): BuildingDef[] {
  return buildingsFor(p.faction);
}

export function canPlace(world: World, p: PlayerState, def: string): Check {
  const d = buildingDef(def);
  if (d.factions && !d.factions.includes(p.faction)) return no('age');
  if (d.age > p.age) return no('age');
  if (d.limit !== undefined && countOwned(world, p.id, def) >= d.limit) return no('limit');
  if (!canAfford(p, costOf(p, world.tick, def))) return no('cost');
  return OK;
}

export function techOptions(p: PlayerState, building: string): TechDef[] {
  return techsAt(p.faction, building).filter(
    (t) => (!t.god || p.gods.includes(t.god)) && !p.techs.includes(t.id),
  );
}

export function techCost(t: TechDef): Cost {
  return t.cost;
}

/** Is the tech already queued anywhere by this player? */
function techQueued(world: World, owner: number, tech: string): boolean {
  for (const e of world.entities) {
    if (e.dead || e.owner !== owner) continue;
    for (const q of e.queue) if (q.kind === 'tech' && q.id === tech) return true;
  }
  return false;
}

export function canResearch(world: World, p: PlayerState, b: Entity, tech: string): Check {
  const t = techDef(tech);
  if (!b.built) return no('built');
  if (t.building !== b.def) return no('age');
  if (p.techs.includes(tech) || techQueued(world, p.id, tech)) return no('researched');
  if (t.god && !p.gods.includes(t.god)) return no('god');
  if (t.age > p.age) return no('age');
  for (const r of t.requires ?? []) if (!p.techs.includes(r)) return no('requires');
  if (b.queue.length >= 5) return no('busy');
  if (!canAfford(p, t.cost)) return no('cost');
  return OK;
}

export interface AgeInfo {
  next: number;
  cost: Cost;
  time: number;
  gods: [string, string];
}

export function nextAge(p: PlayerState): AgeInfo | null {
  if (p.age >= 3) return null;
  const next = (p.age + 1) as 1 | 2 | 3;
  const a = AGES[next]!;
  return { next, cost: a.cost, time: a.time, gods: factionDef(p.faction).minorGods[next] };
}

export function canAdvance(p: PlayerState, b: Entity, god: string): Check {
  const info = nextAge(p);
  if (!info) return no('age');
  if (b.def !== 'town_hall' || !b.built) return no('built');
  if (p.advancing) return no('busy');
  if (!info.gods.includes(god)) return no('god');
  if (b.queue.length >= 5) return no('busy');
  if (!canAfford(p, info.cost)) return no('cost');
  return OK;
}

export function canCast(world: World, p: PlayerState, power: string): Check {
  const ps = p.powers.find((x) => x.id === power);
  if (!ps) return no('god');
  if (ps.readyAt > world.tick) return no('cooldown');
  if (p.res.favor < powerDef(power).favorCost) return no('favor');
  return OK;
}

/** Seconds of cooldown remaining for a power. */
export function powerCooldownLeft(world: World, p: PlayerState, power: string): number {
  const ps = p.powers.find((x) => x.id === power);
  if (!ps) return 0;
  return Math.max(0, (ps.readyAt - world.tick) / SIM.ticksPerSecond);
}

export function minorGodChoices(p: PlayerState): string[] {
  const info = nextAge(p);
  return info ? info.gods : [];
}

export function godName(id: string): string {
  return godDef(id).name.en;
}
