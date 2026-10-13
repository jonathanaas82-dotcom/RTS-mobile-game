import { buildingDef, factionDef, isBuilding, unitDef } from '../data';
import { ECONOMY, type ResourceKind } from '../data/balance/economy';
import type { FactionId, UnitClass } from '../data/types';
import { Rng } from './core/rng';
import { createEntity, type Entity } from './entity';
import { Grid } from './grid';
import { generateMap, type GameMap } from './map/mapgen';
import { Pathfinder } from './path/astar';
import { createPlayer, modified, type PlayerState } from './player';
import { SpatialHash } from './spatial';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'passive';

export interface PlayerConfig {
  faction: FactionId;
  majorGod: string;
  /** null = human. */
  ai: Difficulty | null;
}

export interface MatchConfig {
  seed: number;
  mapSize: number;
  players: PlayerConfig[];
}

export interface Projectile {
  owner: number;
  source: number;
  sourceCls: UnitClass;
  target: number;
  x: number;
  y: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  splash: number;
  dead: boolean;
}

/** A lingering area effect from a god power (dot, heal, freeze, slow, reveal). */
export interface AreaEffect {
  power: string;
  kind: 'dot' | 'heal' | 'freeze' | 'slow' | 'reveal';
  owner: number;
  x: number;
  y: number;
  radius: number;
  amount: number;
  vsBuildings: number;
  until: number;
  started: number;
}

/** Things that happened during a tick, consumed by rendering/audio/UI (never by the sim). */
export type SimEvent =
  | { type: 'attack'; id: number; target: number; ranged: boolean }
  | { type: 'hit'; target: number; x: number; y: number; amount: number; owner: number }
  | {
      type: 'death';
      id: number;
      owner: number;
      def: string;
      kind: Entity['kind'];
      x: number;
      y: number;
    }
  | { type: 'built'; id: number; owner: number; def: string }
  | { type: 'trained'; id: number; owner: number; def: string }
  | { type: 'researched'; owner: number; tech: string }
  | { type: 'ageUp'; owner: number; age: number; god: string }
  | { type: 'power'; owner: number; power: string; x: number; y: number }
  | { type: 'ability'; id: number; owner: number; kind: string; x: number; y: number }
  | { type: 'underAttack'; owner: number; x: number; y: number }
  | { type: 'treeCut'; tile: number }
  | { type: 'gathered'; id: number; owner: number }
  | { type: 'gameOver'; winner: number }
  | { type: 'error'; owner: number; code: 'cost' | 'pop' | 'place' | 'limit' | 'age' | 'cooldown' };

/** The complete simulation state. Nothing in here references rendering. */
export interface World {
  readonly config: MatchConfig;
  tick: number;
  readonly rng: Rng;
  readonly map: GameMap;
  readonly grid: Grid;
  readonly path: Pathfinder;
  readonly spatial: SpatialHash;
  entities: Entity[];
  readonly byId: Map<number, Entity>;
  nextId: number;
  readonly players: PlayerState[];
  /** Per player: 0 unexplored, 1 explored, 2 visible. */
  readonly fog: Uint8Array[];
  projectiles: Projectile[];
  effects: AreaEffect[];
  events: SimEvent[];
  /** -1 while the match is running. */
  winner: number;
  /** A* searches performed this tick (budget). */
  pathsThisTick: number;
  /** Last tick each player was warned about an attack (alert throttling). */
  lastAlert: number[];
}

export function createWorld(config: MatchConfig): World {
  const map = generateMap(config.mapSize, config.seed);
  const grid = new Grid(map);
  const world: World = {
    config,
    tick: 0,
    // Separate stream from map generation so map tweaks don't change in-match randomness.
    rng: new Rng((config.seed ^ 0x5bd1e995) >>> 0),
    map,
    grid,
    path: new Pathfinder(grid),
    spatial: new SpatialHash(map.width, map.height),
    entities: [],
    byId: new Map(),
    nextId: 1,
    players: config.players.map((p, i) => createPlayer(i, p.faction, p.majorGod)),
    fog: config.players.map(() => new Uint8Array(map.width * map.height)),
    projectiles: [],
    effects: [],
    events: [],
    winner: -1,
    pathsThisTick: 0,
    lastAlert: config.players.map(() => -10000),
  };

  for (const f of map.features) {
    const e = addEntity(world, 'resource', f.kind, -1);
    e.tileX = f.x;
    e.tileY = f.y;
    e.size = f.kind === 'gold' ? 2 : 1;
    e.x = f.x + e.size / 2;
    e.y = f.y + e.size / 2;
    e.amount = f.amount;
    e.hp = e.maxHp = 1;
    grid.stamp(e, true);
  }

  config.players.forEach((pc, i) => {
    const start = map.starts[i] ?? map.starts[0]!;
    const hall = placeBuilding(world, i, 'town_hall', start.x - 1, start.y - 1, true);
    const worker = factionDef(pc.faction).worker;
    for (let k = 0; k < ECONOMY.startingWorkers; k++) {
      // Spread the starting workers below the hall.
      spawnUnit(world, i, worker, hall.x - 1 + k, hall.y + 2.2);
    }
  });
  for (const p of world.players) recomputePop(world, p.id);
  return world;
}

export function addEntity(world: World, kind: Entity['kind'], def: string, owner: number): Entity {
  const e = createEntity(world.nextId++, kind, def, owner);
  world.entities.push(e);
  world.byId.set(e.id, e);
  return e;
}

export function unitClass(def: string): UnitClass {
  return isBuilding(def) ? 'building' : unitDef(def).cls;
}

/** Spawn a unit at (x, y) — moved to the nearest walkable spot if needed. */
export function spawnUnit(world: World, owner: number, def: string, x: number, y: number): Entity {
  const d = unitDef(def);
  const e = addEntity(world, 'unit', def, owner);
  e.cls = d.cls;
  const ti = world.grid.nearestWalkable(x, y);
  if (ti >= 0 && world.grid.isBlocked(Math.floor(x), Math.floor(y))) {
    x = (ti % world.grid.w) + 0.5;
    y = Math.floor(ti / world.grid.w) + 0.5;
  }
  e.x = e.px = x;
  e.y = e.py = y;
  e.radius = d.radius;
  e.maxHp = e.hp = Math.round(statOf(world, e, 'hp', d.hp));
  return e;
}

export function placeBuilding(
  world: World,
  owner: number,
  def: string,
  tx: number,
  ty: number,
  built: boolean,
): Entity {
  const d = buildingDef(def);
  const e = addEntity(world, 'building', def, owner);
  e.cls = 'building';
  e.tileX = tx;
  e.tileY = ty;
  e.size = d.size;
  e.x = e.px = tx + d.size / 2;
  e.y = e.py = ty + d.size / 2;
  e.radius = d.size / 2;
  e.maxHp = Math.round(statOf(world, e, 'hp', d.hp));
  e.built = built;
  e.progress = built ? 1 : 0;
  e.hp = built ? e.maxHp : Math.max(1, Math.round(e.maxHp * 0.1));
  world.grid.stamp(e, !d.walkable);
  return e;
}

/** Apply the owner's modifiers to a base stat of an entity. */
export function statOf(
  world: World,
  e: Entity,
  stat: Parameters<typeof modified>[2],
  base: number,
  resource?: ResourceKind,
): number {
  const p = world.players[e.owner];
  if (!p) return base;
  const cls = e.kind === 'building' ? 'building' : (e.cls as UnitClass);
  return modified(p, world.tick, stat, base, cls, e.def, resource);
}

export function player(world: World, id: number): PlayerState {
  const p = world.players[id];
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

/** Recount population and cap for a player (cheap; called on unit/building changes). */
export function recomputePop(world: World, owner: number): void {
  const p = world.players[owner];
  if (!p) return;
  let pop = 0;
  let cap = 0;
  for (const e of world.entities) {
    if (e.dead || e.owner !== owner) continue;
    if (e.kind === 'unit') pop += unitDef(e.def).pop;
    else if (e.kind === 'building' && e.built) cap += buildingDef(e.def).popProvided ?? 0;
    if (e.kind === 'building') {
      // Units in training reserve their population so queues can't overshoot the cap.
      for (const q of e.queue) if (q.kind === 'unit') pop += unitDef(q.id).pop;
    }
  }
  p.pop = pop;
  p.popCap = Math.min(ECONOMY.maxPop, cap);
}

/** Mark an entity dead; cleanup happens at the end of the tick. */
export function killEntity(world: World, e: Entity, killer?: Entity): void {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  if (e.kind !== 'unit') world.grid.unstamp(e);
  if (e.kind === 'building') {
    // Sheltered units pour out of a destroyed building.
    let k = 0;
    for (const u of world.entities) {
      if (u.dead || u.inside !== e.id) continue;
      u.inside = -1;
      const ti = world.grid.nearestWalkable(e.x + (k % 3) - 1, e.y + Math.floor(k / 3) * 0.5);
      if (ti >= 0) {
        u.x = u.px = (ti % world.grid.w) + 0.5;
        u.y = u.py = Math.floor(ti / world.grid.w) + 0.5;
      }
      k++;
    }
  }
  world.events.push({
    type: 'death',
    id: e.id,
    owner: e.owner,
    def: e.def,
    kind: e.kind,
    x: e.x,
    y: e.y,
  });
  const owner = world.players[e.owner];
  if (owner) {
    if (e.kind === 'unit') owner.stats.unitsLost++;
    else if (e.kind === 'building') owner.stats.buildingsLost++;
  }
  const kp = killer ? world.players[killer.owner] : undefined;
  if (kp && e.kind === 'unit') kp.stats.unitsKilled++;
}

/** Remove dead entities (end of tick) and keep indexes in sync. */
export function cleanupDead(world: World): void {
  let anyDead = false;
  for (const e of world.entities) {
    if (e.dead) {
      anyDead = true;
      break;
    }
  }
  if (!anyDead) return;
  const owners = new Set<number>();
  world.entities = world.entities.filter((e) => {
    if (!e.dead) return true;
    world.byId.delete(e.id);
    if (e.owner >= 0) owners.add(e.owner);
    return false;
  });
  for (const o of owners) recomputePop(world, o);
}

/** Order-dependent FNV-1a hash of the state. Used by tests and future desync detection. */
export function hashWorld(world: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    v = v | 0;
    for (let s = 0; s < 32; s += 8) {
      h ^= (v >>> s) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  };
  mix(world.tick);
  mix(world.rng.state);
  for (const e of world.entities) {
    mix(e.id);
    mix(Math.round(e.x * 1000));
    mix(Math.round(e.y * 1000));
    mix(Math.round(e.hp * 100));
    mix(e.amount);
  }
  for (const p of world.players) {
    mix(Math.round(p.res.food * 100));
    mix(Math.round(p.res.wood * 100));
    mix(Math.round(p.res.gold * 100));
    mix(Math.round(p.res.favor * 100));
  }
  const { tiles } = world.map;
  for (let i = 0; i < tiles.length; i++) mix(tiles[i] as number);
  return h >>> 0;
}
