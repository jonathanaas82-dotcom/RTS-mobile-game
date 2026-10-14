/** Data registry: typed lookups over all definition tables. */
import { BUILDINGS } from './buildings';
import { FACTIONS } from './factions';
import { GODS } from './gods';
import { POWERS } from './powers';
import { TECHS } from './techs';
import type {
  BuildingDef,
  FactionDef,
  FactionId,
  GodDef,
  LocText,
  PowerDef,
  TechDef,
  TraitId,
  UnitDef,
} from './types';
import { UNITS } from './units';

function index<T extends { id: string }>(items: T[], what: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) {
    if (m.has(it.id)) throw new Error(`Duplicate ${what} id: ${it.id}`);
    m.set(it.id, it);
  }
  return m;
}

const units = index(UNITS, 'unit');
const buildings = index(BUILDINGS, 'building');
const techs = index(TECHS, 'tech');
const gods = index(GODS, 'god');
const powers = index(POWERS, 'power');
const factions = index(FACTIONS, 'faction');

function get<T>(m: Map<string, T>, id: string, what: string): T {
  const v = m.get(id);
  if (!v) throw new Error(`Unknown ${what}: ${id}`);
  return v;
}

export const unitDef = (id: string): UnitDef => get(units, id, 'unit');
export const buildingDef = (id: string): BuildingDef => get(buildings, id, 'building');
export const techDef = (id: string): TechDef => get(techs, id, 'tech');
export const godDef = (id: string): GodDef => get(gods, id, 'god');
export const powerDef = (id: string): PowerDef => get(powers, id, 'power');
export const factionDef = (id: FactionId | string): FactionDef => get(factions, id, 'faction');
export const isUnit = (id: string): boolean => units.has(id);

/** Does this unit type have the trait? (Units only; unknown ids have none.) */
export function hasTrait(def: string, trait: TraitId): boolean {
  return units.get(def)?.traits?.includes(trait) ?? false;
}
export const isBuilding = (id: string): boolean => buildings.has(id);

/** Units this faction can train at a building (excluding god-locked ones the caller must filter). */
export function unitsTrainedAt(faction: FactionId, building: string): UnitDef[] {
  return UNITS.filter((u) => u.faction === faction && u.trainedAt === building);
}

export function buildingsFor(faction: FactionId): BuildingDef[] {
  return BUILDINGS.filter((b) => !b.factions || b.factions.includes(faction));
}

export function techsAt(faction: FactionId, building: string): TechDef[] {
  return TECHS.filter(
    (t) => t.building === building && (!t.factions || t.factions.includes(faction)),
  );
}

export function factionUnit(faction: FactionId, cls: UnitDef['cls']): UnitDef | undefined {
  return UNITS.find((u) => u.faction === faction && u.cls === cls && !u.god);
}

/** Pick the language variant of a data text. */
export function loc(text: LocText, lang: string): string {
  return lang === 'nb' ? (text.nb ?? text.en) : text.en;
}

export { BUILDINGS, FACTIONS, GODS, POWERS, TECHS, UNITS };
