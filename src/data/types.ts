/**
 * Type definitions for all game data (units, buildings, techs, gods, powers, factions).
 * Data files contain only values; the simulation interprets them.
 */
import type { ResourceKind } from './balance/economy';

/** Localised text: English required, Norwegian (bokmål) optional (falls back to English). */
export interface LocText {
  en: string;
  nb?: string;
}

export type Cost = Partial<Record<ResourceKind, number>>;

/** Combat classes used by the counter matrix. */
export type UnitClass =
  'worker' | 'infantry' | 'ranged' | 'cavalry' | 'siege' | 'hero' | 'mythic' | 'building';

export type FactionId = 'hrimfolk' | 'aurelian' | 'sahrun';

/** Age index: 0 Archaic, 1 Classical, 2 Heroic, 3 Mythic. */
export type AgeIndex = 0 | 1 | 2 | 3;

export interface AttackDef {
  damage: number;
  /** Range in tiles measured edge to edge (0.4 ≈ melee). */
  range: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** Projectile speed in tiles/s; omitted = instant (melee). */
  projectileSpeed?: number;
  /** Splash radius in tiles (damage falls to 50% at the edge). */
  splash?: number;
}

/** Procedural placeholder art description (see src/render/assets/procedural/units.ts). */
export interface UnitArt {
  shape: 'humanoid' | 'rider' | 'engine' | 'giant' | 'serpent' | 'beast' | 'flyer' | 'construct';
  weapon?:
    | 'spear'
    | 'sword'
    | 'axe'
    | 'bow'
    | 'sling'
    | 'staff'
    | 'tool'
    | 'javelin'
    | 'greatsword'
    | 'greataxe'
    | 'horn'
    | 'banner'
    | 'none';
  /** Main body colour; team colour is applied to cloth/banners automatically. */
  body: string;
  accent?: string;
  /** Drawing scale relative to a worker. */
  scale?: number;
  /** Detail overrides for humanoids (defaults follow faction and class). */
  helm?:
    'none' | 'cap' | 'nasal' | 'horned' | 'wolfhood' | 'crested' | 'plumed' | 'nemes' | 'crown';
  armor?: 'cloth' | 'fur' | 'leather' | 'mail' | 'scale' | 'plate' | 'linen';
  shield?: 'none' | 'round' | 'hoplon' | 'tower' | 'oval';
  cape?: boolean;
  /** Riders: what they ride (defaults by faction). */
  mount?: 'horse' | 'wolf' | 'chariot' | 'camel';
}

/** Special combat traits (see src/data/traits.ts for names, numbers and descriptions). */
export type TraitId =
  | 'brace'
  | 'shieldwall'
  | 'frenzy'
  | 'charge'
  | 'cleave'
  | 'phalanx'
  | 'piercing'
  | 'demolisher'
  | 'regenerate'
  | 'inspire'
  | 'harrier'
  | 'scout';

export type HeroAbilityKind = 'thunderclap' | 'rally' | 'mend';

export interface HeroAbilityDef {
  kind: HeroAbilityKind;
  name: LocText;
  desc: LocText;
  radius: number;
  /** Damage (thunderclap) or heal amount (rally/mend). */
  amount: number;
  /** Stun seconds (thunderclap) or buff seconds (rally). */
  duration: number;
  cooldown: number;
}

export interface UnitDef {
  id: string;
  name: LocText;
  faction: FactionId;
  cls: UnitClass;
  hp: number;
  /** Tiles per second. */
  speed: number;
  /** Collision radius in tiles. */
  radius: number;
  /** Sight radius in tiles. */
  sight: number;
  /** Damage reduction 0..0.8 applied after counters. */
  armor: number;
  attack?: AttackDef;
  cost: Cost;
  /** Seconds. */
  trainTime: number;
  pop: number;
  age: AgeIndex;
  /** Building def id where this unit is trained. */
  trainedAt: string;
  /** Workers only: resources gathered per second, carry capacity, build speed multiplier. */
  gather?: Partial<Record<ResourceKind, number>>;
  carry?: number;
  buildRate?: number;
  ability?: HeroAbilityDef;
  /** Mythic units: unlocked by this god (in addition to age). */
  god?: string;
  /** Special combat traits. */
  traits?: TraitId[];
  /** One-line role description shown in the codex and tooltips. */
  role?: LocText;
  art: UnitArt;
}

export type BuildingArt =
  | 'hall'
  | 'house'
  | 'storehouse'
  | 'farm'
  | 'barracks'
  | 'stable'
  | 'workshop'
  | 'temple'
  | 'tower'
  | 'shrine'
  | 'monument';

export interface BuildingDef {
  id: string;
  name: LocText;
  /** Optional faction-specific display names (e.g. a Norse Longhouse); see `buildingName`. */
  names?: Partial<Record<FactionId, LocText>>;
  /** Footprint in tiles (square). */
  size: number;
  hp: number;
  armor: number;
  cost: Cost;
  buildTime: number;
  age: AgeIndex;
  /** Restricted to these factions (omitted = all factions). */
  factions?: FactionId[];
  popProvided?: number;
  dropoff?: ResourceKind[];
  /** Units can walk over it (farms). */
  walkable?: boolean;
  /** Farms: infinite food source for workers standing on it. */
  farm?: boolean;
  /** Favor per second while standing (shrines/monuments). */
  favorRate?: number;
  /** Max number a player may own. */
  limit?: number;
  sight: number;
  attack?: AttackDef;
  /** Units that can shelter inside (each adds an arrow to its attack). */
  garrison?: number;
  /** Counts towards "main buildings" for the win condition. */
  main?: boolean;
  art: BuildingArt;
}

/** Numeric stat a modifier can change. */
export type StatKey =
  | 'hp'
  | 'damage'
  | 'speed'
  | 'range'
  | 'sight'
  | 'armor'
  | 'trainTime'
  | 'cost'
  | 'gather'
  | 'buildTime'
  | 'favor';

export interface Modifier {
  stat: StatKey;
  /** Multiplier (1.1 = +10%). */
  mul?: number;
  /** Flat addition applied after multiplication. */
  add?: number;
  /** Restrict to unit classes (buildings use 'building'). */
  classes?: UnitClass[];
  /** Restrict to specific unit/building ids. */
  ids?: string[];
  /** For 'gather': restrict to one resource. */
  resource?: ResourceKind;
}

export interface TechDef {
  id: string;
  name: LocText;
  desc: LocText;
  cost: Cost;
  researchTime: number;
  age: AgeIndex;
  building: string;
  factions?: FactionId[];
  /** Only available after choosing this god. */
  god?: string;
  /** Requires these techs first. */
  requires?: string[];
  effects: Modifier[];
}

export type PowerKind =
  'strike' | 'dot' | 'heal' | 'freeze' | 'slow' | 'summon' | 'boost' | 'reveal';

export interface PowerDef {
  id: string;
  name: LocText;
  desc: LocText;
  kind: PowerKind;
  favorCost: number;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Area radius in tiles (0 = no target needed). */
  radius: number;
  /** Damage (strike: total, dot: per second), heal per second, or boost multiplier. */
  amount?: number;
  /** Effect duration in seconds. */
  duration?: number;
  /** Damage multiplier against buildings (strike/dot). */
  vsBuildings?: number;
  /** Summon: unit id and count. */
  unit?: string;
  count?: number;
  /** Boost: player-wide modifiers while active. */
  boost?: Modifier[];
  /** Visual effect colour (render only). */
  color: string;
}

export interface GodDef {
  id: string;
  name: LocText;
  /** Short epithet shown under the name. */
  title: LocText;
  faction: FactionId;
  /** 0 = major god (chosen at start); 1..3 = minor god for that age. */
  age: AgeIndex;
  desc: LocText;
  /** Passive bonuses applied when chosen. */
  bonuses: Modifier[];
  power: string;
  /** Mythic unit unlocked (if any). */
  mythic?: string;
  /** Unique tech unlocked (if any). */
  tech?: string;
}

export type FavorMode = 'combat' | 'shrines' | 'monuments';

export interface FactionDef {
  id: FactionId;
  name: LocText;
  desc: LocText;
  /** How this faction earns Favor. */
  favorMode: FavorMode;
  favorDesc: LocText;
  /** Unit ids by role. */
  worker: string;
  /** Faction-wide passive modifiers. */
  bonuses: Modifier[];
  majorGods: string[];
  /** Minor gods offered per age: index 1 Classical, 2 Heroic, 3 Mythic. Two each. */
  minorGods: Record<1 | 2 | 3, [string, string]>;
  /** Building visual style. */
  style: { wall: string; roof: string; trim: string };
}
