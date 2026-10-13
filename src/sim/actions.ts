import type { Command } from './commands';
import { idleOrder, type Entity } from './entity';
import { formationSlots, moveTo, stopMoving } from './systems/movement';
import type { World } from './world';
import { attackDefOf } from './systems/combat';
import { useAbility } from './systems/abilities';
import { castPower } from './systems/powers';
import { garrisonCapacity, nearestShelter, releaseGarrison } from './systems/garrison';
import { checkWinner, defeat } from './systems/victory';

/** Own, living units from a command's id list (in a stable order). */
export function ownUnits(world: World, player: number, ids: number[]): Entity[] {
  const out: Entity[] = [];
  for (const id of ids) {
    const e = world.byId.get(id);
    if (e && !e.dead && e.owner === player && e.kind === 'unit' && e.inside < 0) out.push(e);
  }
  return out;
}

export function setOrder(
  e: Entity,
  type: Entity['order']['type'],
  x = 0,
  y = 0,
  target = -1,
  tile = -1,
): void {
  e.order.type = type;
  e.order.x = x;
  e.order.y = y;
  e.order.target = target;
  e.order.tile = tile;
}

/** Spread a group over formation slots around (x, y); nearest units take the inner slots. */
export function groupMove(
  world: World,
  units: Entity[],
  x: number,
  y: number,
  type: 'move' | 'attackMove',
): void {
  if (units.length === 0) return;
  // A target inside water/cliffs/buildings moves to the nearest open ground.
  const g = world.grid;
  if (g.isBlocked(Math.floor(x), Math.floor(y))) {
    const ti = g.nearestWalkable(x, y);
    if (ti >= 0) {
      x = (ti % g.w) + 0.5;
      y = Math.floor(ti / g.w) + 0.5;
    }
  }
  const spacing = units.length > 12 ? 0.75 : 0.85;
  const slots = formationSlots(world, x, y, units.length, spacing);
  const sorted = [...units].sort((a, b) => {
    const da = (a.x - x) ** 2 + (a.y - y) ** 2;
    const db = (b.x - x) ** 2 + (b.y - y) ** 2;
    return da - db || a.id - b.id;
  });
  sorted.forEach((u, i) => {
    const [sx, sy] = slots[i] as [number, number];
    setOrder(u, type, sx, sy);
    u.carryKind = u.carry > 0 ? u.carryKind : null;
    moveTo(u, sx, sy);
  });
}

export function applyMovementCommand(world: World, c: Command): boolean {
  switch (c.type) {
    case 'move':
    case 'attackMove':
      groupMove(world, ownUnits(world, c.player, c.ids), c.x, c.y, c.type);
      return true;
    case 'attack': {
      const target = world.byId.get(c.target);
      if (!target || target.dead || target.owner === c.player || target.owner < 0) return true;
      for (const u of ownUnits(world, c.player, c.ids)) {
        if (!attackDefOf(u)) continue;
        setOrder(u, 'attack', target.x, target.y, target.id);
        u.repathAt = 0;
        stopMoving(u);
      }
      return true;
    }
    case 'ability': {
      const h = world.byId.get(c.id);
      if (h && !h.dead && h.owner === c.player && h.cls === 'hero') useAbility(world, h);
      return true;
    }
    case 'garrison': {
      for (const u of ownUnits(world, c.player, c.ids)) {
        const b = c.target >= 0 ? world.byId.get(c.target) : nearestShelter(world, u);
        if (!b || b.dead || b.owner !== c.player || garrisonCapacity(b) === 0) continue;
        setOrder(u, 'garrison', b.x, b.y, b.id);
        u.tries = 0;
        u.repathAt = 0;
        stopMoving(u);
      }
      return true;
    }
    case 'ungarrison': {
      const b = world.byId.get(c.building);
      if (b && !b.dead && b.owner === c.player) releaseGarrison(world, b);
      return true;
    }
    case 'castPower':
      castPower(world, c.player, c.power, c.x, c.y);
      return true;
    case 'resign':
      defeat(world, c.player);
      checkWinner(world);
      return true;
    case 'stop':
      for (const u of ownUnits(world, c.player, c.ids)) {
        u.order = idleOrder();
        stopMoving(u);
      }
      return true;
    default:
      return false;
  }
}
