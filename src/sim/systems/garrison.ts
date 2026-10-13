import { buildingDef } from '../../data';
import { RULES } from '../../data/balance/rules';
import { distToRect, idleOrder, type Entity } from '../entity';
import type { World } from '../world';
import { isMoving, moveToRect, stopMoving } from './movement';

export function garrisonCapacity(b: Entity): number {
  return b.kind === 'building' && b.built ? (buildingDef(b.def).garrison ?? 0) : 0;
}

export function garrisonCount(world: World, b: Entity): number {
  let n = 0;
  for (const e of world.entities) if (!e.dead && e.inside === b.id) n++;
  return n;
}

/** Nearest own building with free shelter space. */
export function nearestShelter(world: World, e: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of world.entities) {
    if (b.dead || b.owner !== e.owner || garrisonCapacity(b) === 0) continue;
    if (garrisonCount(world, b) >= garrisonCapacity(b)) continue;
    const d = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Walk to the target building and go inside (if there's room). */
export function garrisonBehavior(world: World, e: Entity): void {
  const b = world.byId.get(e.order.target);
  if (!b || b.dead || b.owner !== e.owner || garrisonCapacity(b) === 0) {
    e.order = idleOrder();
    return;
  }
  const d = distToRect(e.x, e.y, b.tileX, b.tileY, b.size) - e.radius;
  if (d > RULES.workReach) {
    if (!isMoving(e) && world.tick >= e.repathAt) {
      e.repathAt = world.tick + 20;
      e.tries++;
      moveToRect(e, b.tileX, b.tileY, b.size);
    }
    if (e.tries > 6) e.order = idleOrder();
    return;
  }
  if (garrisonCount(world, b) >= garrisonCapacity(b)) {
    e.order = idleOrder();
    stopMoving(e);
    return;
  }
  stopMoving(e);
  e.inside = b.id;
  e.order = idleOrder();
  e.x = e.px = b.x;
  e.y = e.py = b.y;
}

/** Put sheltered units back on the map around the building. */
export function releaseGarrison(world: World, b: Entity): void {
  let k = 0;
  for (const e of world.entities) {
    if (e.dead || e.inside !== b.id) continue;
    e.inside = -1;
    const ti = world.grid.nearestWalkable(
      b.x + (k % 3) - 1,
      b.tileY + b.size + 0.5 + Math.floor(k / 3) * 0.6,
    );
    if (ti >= 0) {
      e.x = e.px = (ti % world.grid.w) + 0.5 + ((k % 2) - 0.5) * 0.3;
      e.y = e.py = Math.floor(ti / world.grid.w) + 0.5;
    }
    k++;
  }
}
