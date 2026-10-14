import { buildingDef, unitDef } from '../../data';
import type { ResourceKind } from '../../data/balance/economy';
import { RULES } from '../../data/balance/rules';
import { SIM, secondsToTicks } from '../../data/balance/sim';
import { distToRect, idleOrder, type Entity } from '../entity';
import { Terrain } from '../map/terrain';
import { modified } from '../player';
import { killEntity, recomputePop, statOf, type World } from '../world';
import { isMoving, moveTo, moveToRect, stopMoving } from './movement';

const TPS = SIM.ticksPerSecond;

/** What a gather order targets: a resource entity, a farm, or a forest tile. */
export function gatherKind(world: World, e: Entity): ResourceKind | null {
  if (e.order.tile >= 0) return world.map.tiles[e.order.tile] === Terrain.Forest ? 'wood' : null;
  const t = world.byId.get(e.order.target);
  if (!t || t.dead) return null;
  if (t.kind === 'resource') return t.def === 'gold' ? 'gold' : 'food';
  if (t.kind === 'building' && t.def === 'farm' && t.built) return 'food';
  return null;
}

/** Start (or restart) gathering. Resets carried resources of a different kind. */
export function startGather(world: World, e: Entity, target: number, tile: number): void {
  e.order.type = 'gather';
  e.order.target = target;
  e.order.tile = tile;
  e.tries = 0;
  stopMoving(e);
  const kind = gatherKind(world, e);
  if (kind && e.carryKind && e.carryKind !== kind) {
    e.carry = 0;
    e.carryKind = null;
  }
}

function capacity(e: Entity): number {
  return unitDef(e.def).carry ?? 10;
}

/** Walk next to a rect; true once within reach. Repaths at most every `chaseRepathTicks`. */
function approachRect(world: World, e: Entity, tx: number, ty: number, size: number): boolean {
  const d = distToRect(e.x, e.y, tx, ty, size) - e.radius;
  if (d <= RULES.workReach) {
    if (isMoving(e)) stopMoving(e);
    return true;
  }
  if (!isMoving(e) && world.tick >= e.repathAt) {
    e.tries++;
    e.repathAt = world.tick + RULES.chaseRepathTicks * 2;
    moveToRect(e, tx, ty, size);
  }
  return false;
}

export function gatherBehavior(world: World, e: Entity): void {
  const kind = gatherKind(world, e);
  if (!kind) {
    // Source exhausted: look for more of the same nearby, otherwise return what we carry.
    if (!retarget(world, e)) {
      if (e.carry > 0) e.order.type = 'return';
      else e.order = idleOrder();
    }
    return;
  }
  if (e.carryKind !== kind) {
    e.carry = 0;
    e.carryKind = kind;
  }
  if (e.carry >= capacity(e)) {
    e.order.type = 'return';
    e.tries = 0;
    return;
  }
  // Approach the source.
  let arrived: boolean;
  const t = e.order.tile >= 0 ? null : world.byId.get(e.order.target)!;
  if (e.order.tile >= 0) {
    const w = world.map.width;
    arrived = approachRect(world, e, e.order.tile % w, Math.floor(e.order.tile / w), 1);
  } else if (t!.kind === 'building') {
    // Farms are walkable: work from the middle of the field (a little below centre, so the
    // farmer reads as standing in the crop rather than on its back edge).
    const fy = t!.y + 0.3;
    const d = Math.sqrt((t!.x - e.x) ** 2 + (fy - e.y) ** 2);
    arrived = d <= 0.45;
    if (arrived && isMoving(e)) stopMoving(e);
    if (!arrived && !isMoving(e) && world.tick >= e.repathAt) {
      e.tries++;
      e.repathAt = world.tick + RULES.chaseRepathTicks * 2;
      moveTo(e, t!.x, fy);
    }
  } else {
    arrived = approachRect(world, e, t!.tileX, t!.tileY, t!.size);
  }
  if (!arrived) {
    if (e.tries > 4) {
      // Unreachable: try another source, else give up.
      if (!retarget(world, e, true)) e.order = idleOrder();
    }
    return;
  }
  e.tries = 0;
  // Face the source.
  const sx = t ? t.x : (e.order.tile % world.map.width) + 0.5;
  e.facing = sx >= e.x ? 1 : -1;
  const base = unitDef(e.def).gather?.[kind] ?? 0.5;
  const p = world.players[e.owner]!;
  let rate = modified(p, world.tick, 'gather', base, 'worker', e.def, kind) * p.handicapGather;
  if (t && t.kind === 'building') rate *= RULES.farmRate;
  e.work += rate / TPS;
  // Gather animation hint.
  if (world.tick % 10 === e.id % 10) e.lastAttack = world.tick;
  if (e.work < 1) return;
  let n = Math.floor(e.work);
  e.work -= n;
  if (e.order.tile >= 0) {
    const i = e.order.tile;
    const left = world.map.wood[i] as number;
    n = Math.min(n, left);
    world.map.wood[i] = left - n;
    if (left - n <= 0) {
      world.grid.clearForest(i);
      world.events.push({ type: 'treeCut', tile: i });
    }
  } else if (t && t.kind === 'resource') {
    n = Math.min(n, t.amount);
    t.amount -= n;
    if (t.amount <= 0) killEntity(world, t);
  }
  e.carry += n;
}

/** Find the nearest source of the same kind (excluding the current one when `skipCurrent`). */
function retarget(world: World, e: Entity, skipCurrent = false): boolean {
  const kind = e.carryKind ?? (e.order.tile >= 0 ? 'wood' : null);
  const r = RULES.resourceSearchRadius;
  if (kind === 'wood' || e.order.tile >= 0) {
    const tile = nearestForest(world, e.x, e.y, r, skipCurrent ? e.order.tile : -1);
    if (tile >= 0) {
      startGather(world, e, -1, tile);
      e.carryKind = 'wood';
      return true;
    }
    return false;
  }
  let best: Entity | null = null;
  let bestD = r * r;
  const prev = world.byId.get(e.order.target);
  const wantDef = prev?.def ?? (kind === 'gold' ? 'gold' : 'berries');
  for (const o of world.entities) {
    if (o.dead || o.id === e.order.target) continue;
    const isMatch =
      (o.kind === 'resource' && o.def === wantDef) ||
      (wantDef === 'farm' &&
        o.kind === 'building' &&
        o.def === 'farm' &&
        o.owner === e.owner &&
        o.built);
    if (!isMatch) continue;
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return false;
  const carry = e.carry;
  const ck = e.carryKind;
  startGather(world, e, best.id, -1);
  e.carry = carry;
  e.carryKind = ck;
  return true;
}

/** Nearest forest tile within `r` that has a walkable neighbour (so it can be reached). */
export function nearestForest(world: World, x: number, y: number, r: number, exclude = -1): number {
  const w = world.map.width;
  const h = world.map.height;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let best = -1;
  let bestD = Infinity;
  for (let ty = Math.max(0, cy - r); ty <= Math.min(h - 1, cy + r); ty++) {
    for (let tx = Math.max(0, cx - r); tx <= Math.min(w - 1, cx + r); tx++) {
      const i = ty * w + tx;
      if (i === exclude || world.map.tiles[i] !== Terrain.Forest) continue;
      const g = world.grid;
      if (
        g.isBlocked(tx + 1, ty) &&
        g.isBlocked(tx - 1, ty) &&
        g.isBlocked(tx, ty + 1) &&
        g.isBlocked(tx, ty - 1)
      )
        continue;
      const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

/** Nearest own completed drop-off building accepting `kind`. */
export function nearestDropoff(world: World, e: Entity, kind: ResourceKind): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of world.entities) {
    if (b.dead || b.kind !== 'building' || b.owner !== e.owner || !b.built) continue;
    const drop = buildingDef(b.def).dropoff;
    if (!drop || !drop.includes(kind)) continue;
    const d = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function returnBehavior(world: World, e: Entity): void {
  if (e.carry <= 0 || !e.carryKind) {
    e.order.type = gatherKind(world, e) ? 'gather' : 'idle';
    return;
  }
  const drop = nearestDropoff(world, e, e.carryKind);
  if (!drop) {
    // Nowhere to drop: wait idle holding the goods.
    e.order = idleOrder();
    return;
  }
  if (!approachRect(world, e, drop.tileX, drop.tileY, drop.size)) {
    if (e.tries > 6) e.order = idleOrder();
    return;
  }
  const p = world.players[e.owner]!;
  p.res[e.carryKind] += e.carry;
  p.stats.gathered += e.carry;
  world.events.push({ type: 'gathered', id: e.id, owner: e.owner });
  e.carry = 0;
  e.tries = 0;
  // Resume gathering if the source still exists (or a similar one nearby).
  if (gatherKind(world, e)) e.order.type = 'gather';
  else if (!retarget(world, e)) e.order = idleOrder();
}

/** Construct or repair the target building. */
export function buildBehavior(world: World, e: Entity): void {
  const b = world.byId.get(e.order.target);
  if (!b || b.dead || b.owner !== e.owner) {
    e.order = idleOrder();
    return;
  }
  if (b.built && b.hp >= b.maxHp) {
    finishedBuilding(world, e, b);
    return;
  }
  if (!approachRect(world, e, b.tileX, b.tileY, b.size)) {
    if (e.tries > 6) e.order = idleOrder();
    return;
  }
  e.tries = 0;
  e.facing = b.x >= e.x ? 1 : -1;
  if (world.tick % 8 === e.id % 8) e.lastAttack = world.tick;
  const d = buildingDef(b.def);
  const rate = unitDef(e.def).buildRate ?? 1;
  if (!b.built) {
    const p = world.players[e.owner]!;
    const timeMul = modified(p, world.tick, 'buildTime', 1, 'building', b.def);
    const dp = rate / (secondsToTicks(d.buildTime) * timeMul);
    b.progress = Math.min(1, b.progress + dp);
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dp);
    if (b.progress >= 1) completeBuilding(world, b);
  } else {
    // Repair: half the build speed, free.
    b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / secondsToTicks(d.buildTime)) * rate * 0.5);
  }
}

export function completeBuilding(world: World, b: Entity): void {
  b.built = true;
  b.progress = 1;
  b.maxHp = Math.round(statOf(world, b, 'hp', buildingDef(b.def).hp));
  b.hp = Math.max(b.hp, b.maxHp * 0.999);
  b.hp = b.maxHp;
  const p = world.players[b.owner];
  if (p) p.stats.buildingsBuilt++;
  recomputePop(world, b.owner);
  world.events.push({ type: 'built', id: b.id, owner: b.owner, def: b.def });
}

/** After construction: farmers start farming, others look for another unfinished building. */
function finishedBuilding(world: World, e: Entity, b: Entity): void {
  if (b.def === 'farm') {
    // Only one farmer per farm.
    const taken = world.entities.some(
      (o) => o !== e && !o.dead && o.order.type === 'gather' && o.order.target === b.id,
    );
    if (!taken) {
      startGather(world, e, b.id, -1);
      return;
    }
  }
  let best: Entity | null = null;
  let bestD = 8 * 8;
  for (const o of world.entities) {
    if (o.dead || o.kind !== 'building' || o.owner !== e.owner || o.built) continue;
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best) {
    e.order.target = best.id;
    e.tries = 0;
    return;
  }
  // Drop-off buildings: go gather the nearest resource next to it.
  const drop = buildingDef(b.def).dropoff;
  if (drop && drop.includes('wood')) {
    const tile = nearestForest(world, b.x, b.y, 8);
    if (tile >= 0) {
      startGather(world, e, -1, tile);
      return;
    }
  }
  e.order = idleOrder();
  stopMoving(e);
}
