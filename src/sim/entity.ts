import type { ResourceKind } from '../data/balance/economy';
import type { UnitClass } from '../data/types';

export type EntityKind = 'unit' | 'building' | 'resource';

export type OrderType = 'idle' | 'move' | 'attackMove' | 'attack' | 'gather' | 'build' | 'return';

/**
 * What a unit is currently doing. `target` is an entity id (-1 = none); `tile` is a map tile
 * index for forest gathering (-1 = none); x/y is a destination in tiles.
 */
export interface Order {
  type: OrderType;
  x: number;
  y: number;
  target: number;
  tile: number;
}

export type QueueItemKind = 'unit' | 'tech' | 'age';

export interface QueueItem {
  kind: QueueItemKind;
  /** Resources paid (refunded on cancel). */
  paid: Partial<Record<ResourceKind, number>>;
  /** Unit id, tech id, or god id (age advance). */
  id: string;
  /** Progress in ticks. */
  progress: number;
  /** Total ticks (computed when the item starts, includes modifiers). */
  total: number;
}

/**
 * Every object in the match. A single flat shape for all kinds keeps V8 objects monomorphic
 * (fast) and makes serialisation trivial; fields that don't apply keep their defaults.
 */
export interface Entity {
  id: number;
  kind: EntityKind;
  /** Def id (unit/building id, or 'gold'/'berries' for resources). */
  def: string;
  cls: UnitClass | 'resource';
  /** Player index, -1 = nature. */
  owner: number;
  x: number;
  y: number;
  /** Position at the start of the tick (render interpolation). */
  px: number;
  py: number;
  radius: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  facing: number;
  // ── units ──
  order: Order;
  /** Waypoints (tile coords, flattened x,y pairs) and current index. */
  path: number[];
  pathIdx: number;
  needsPath: boolean;
  /** Final goal of the current path (for stuck detection / repath). */
  goalX: number;
  goalY: number;
  /** Rect goal (footprint to stand next to); goalSize 0 = point goal. */
  goalTX: number;
  goalTY: number;
  goalSize: number;
  /** Failed approach attempts for the current order (gives up after a few). */
  tries: number;
  /** Ticks without getting closer to the goal, and the best distance so far. */
  stuck: number;
  bestGoalDist: number;
  repathAt: number;
  carryKind: ResourceKind | null;
  carry: number;
  /** Fractional gather/build accumulator. */
  work: number;
  cooldown: number;
  /** Tick when the last attack happened (render animation). */
  lastAttack: number;
  /** Tick of last damage taken (regen, alerts). */
  lastHit: number;
  stunUntil: number;
  slowUntil: number;
  buffUntil: number;
  abilityReadyAt: number;
  /** Summoned units expire at this tick (0 = never). */
  expiresAt: number;
  // ── buildings / resources ──
  tileX: number;
  tileY: number;
  size: number;
  built: boolean;
  /** Construction progress 0..1. */
  progress: number;
  queue: QueueItem[];
  rallyX: number;
  rallyY: number;
  hasRally: boolean;
  /** Resources: remaining amount. */
  amount: number;
}

export function idleOrder(): Order {
  return { type: 'idle', x: 0, y: 0, target: -1, tile: -1 };
}

export function createEntity(id: number, kind: EntityKind, def: string, owner: number): Entity {
  return {
    id,
    kind,
    def,
    cls: 'resource',
    owner,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    radius: 0.3,
    hp: 1,
    maxHp: 1,
    dead: false,
    facing: 1,
    order: idleOrder(),
    path: [],
    pathIdx: 0,
    needsPath: false,
    goalX: 0,
    goalY: 0,
    goalTX: 0,
    goalTY: 0,
    goalSize: 0,
    tries: 0,
    stuck: 0,
    bestGoalDist: 1e9,
    repathAt: 0,
    carryKind: null,
    carry: 0,
    work: 0,
    cooldown: 0,
    lastAttack: -1000,
    lastHit: -1000,
    stunUntil: 0,
    slowUntil: 0,
    buffUntil: 0,
    abilityReadyAt: 0,
    expiresAt: 0,
    tileX: 0,
    tileY: 0,
    size: 0,
    built: true,
    progress: 1,
    queue: [],
    rallyX: 0,
    rallyY: 0,
    hasRally: false,
    amount: 0,
  };
}

/** Is this entity rect-shaped (building/resource) rather than a round unit? */
export function isRect(e: Entity): boolean {
  return e.kind !== 'unit';
}

/** Distance from a point to a tile rectangle (0 inside). */
export function distToRect(x: number, y: number, tx: number, ty: number, size: number): number {
  const x1 = tx + size;
  const y1 = ty + size;
  const dx = x < tx ? tx - x : x > x1 ? x - x1 : 0;
  const dy = y < ty ? ty - y : y > y1 ? y - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from point to the edge of an entity (0 inside). */
export function distToEntity(x: number, y: number, e: Entity): number {
  if (e.kind === 'unit') {
    const d = Math.sqrt((x - e.x) ** 2 + (y - e.y) ** 2) - e.radius;
    return d < 0 ? 0 : d;
  }
  return distToRect(x, y, e.tileX, e.tileY, e.size);
}

/** Edge-to-edge distance between a unit and any entity. */
export function gap(a: Entity, b: Entity): number {
  const d = distToEntity(a.x, a.y, b) - a.radius;
  return d < 0 ? 0 : d;
}
