import { unitDef } from '../../data';
import { SIM } from '../../data/balance/sim';
import { RULES } from '../../data/balance/rules';
import { distToRect, type Entity } from '../entity';
import { smoothPath, walkable } from '../path/astar';
import { statOf, type World } from '../world';

const TPS = SIM.ticksPerSecond;

/** Ask for a path to a point. Computed by `pathSystem` (budgeted per tick). */
export function moveTo(e: Entity, x: number, y: number): void {
  e.goalX = x;
  e.goalY = y;
  e.goalSize = 0;
  e.needsPath = true;
  e.path.length = 0;
  e.pathIdx = 0;
  e.stuck = 0;
  e.bestGoalDist = 1e9;
}

/** Ask for a path to stand next to a building/resource (or near a unit). */
export function moveToEntity(e: Entity, target: Entity): void {
  if (target.kind === 'unit') {
    moveTo(e, target.x, target.y);
    return;
  }
  moveToRect(e, target.tileX, target.tileY, target.size);
}

/** Ask for a path to stand next to a rectangle of tiles (footprint or forest tile). */
export function moveToRect(e: Entity, tx: number, ty: number, size: number): void {
  e.goalX = tx + size / 2;
  e.goalY = ty + size / 2;
  e.goalTX = tx;
  e.goalTY = ty;
  e.goalSize = size;
  e.needsPath = true;
  e.path.length = 0;
  e.pathIdx = 0;
  e.stuck = 0;
  e.bestGoalDist = 1e9;
}

export function stopMoving(e: Entity): void {
  e.path.length = 0;
  e.pathIdx = 0;
  e.needsPath = false;
  e.stuck = 0;
}

export function isMoving(e: Entity): boolean {
  return e.needsPath || e.pathIdx * 2 < e.path.length;
}

/** Compute queued path requests, at most RULES.pathBudgetPerTick per tick. */
export function pathSystem(world: World): void {
  world.pathsThisTick = 0;
  const grid = world.grid;
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'unit' || !e.needsPath) continue;
    // Straight line possible? Skip A* entirely (the common case for short moves).
    if (e.goalSize === 0 && walkable(grid, e.x, e.y, e.goalX, e.goalY)) {
      e.path = [e.goalX, e.goalY];
      e.pathIdx = 0;
      e.needsPath = false;
      continue;
    }
    if (world.pathsThisTick >= RULES.pathBudgetPerTick) continue;
    world.pathsThisTick++;
    const t = e.goalSize > 0;
    const goal = t
      ? {
          x0: e.goalTX,
          y0: e.goalTY,
          x1: e.goalTX + e.goalSize - 1,
          y1: e.goalTY + e.goalSize - 1,
          adjacent: true,
        }
      : (() => {
          // Point goals inside blocked tiles redirect to the nearest open tile.
          let gx = Math.floor(e.goalX);
          let gy = Math.floor(e.goalY);
          if (grid.isBlocked(gx, gy)) {
            const ni = grid.nearestWalkable(e.goalX, e.goalY);
            if (ni >= 0) {
              gx = ni % grid.w;
              gy = Math.floor(ni / grid.w);
              e.goalX = gx + 0.5;
              e.goalY = gy + 0.5;
            }
          }
          return { x0: gx, y0: gy, x1: gx, y1: gy, adjacent: false };
        })();
    const tiles = world.path.find(e.x, e.y, goal);
    // Unreachable goal: we walk to the closest point; don't retry the expensive search for a while.
    if (!world.path.lastFound) e.repathAt = world.tick + 60;
    e.path = smoothPath(grid, e.x, e.y, tiles, t ? undefined : e.goalX, t ? undefined : e.goalY);
    if (!t && e.path.length >= 2) {
      // If the final tile was reached exactly, finish at the precise requested point.
      const lx = e.path[e.path.length - 2] as number;
      const ly = e.path[e.path.length - 1] as number;
      if (Math.floor(lx) === Math.floor(e.goalX) && Math.floor(ly) === Math.floor(e.goalY)) {
        e.path[e.path.length - 2] = e.goalX;
        e.path[e.path.length - 1] = e.goalY;
      }
    }
    e.pathIdx = 0;
    e.needsPath = false;
  }
}

/** Effective speed in tiles per tick. */
export function speedPerTick(world: World, e: Entity): number {
  let s = statOf(world, e, 'speed', unitDef(e.def).speed) / TPS;
  if (e.slowUntil > world.tick) s *= 0.5;
  return s;
}

/** Advance units along their paths, then separate overlapping units. */
export function movementSystem(world: World): void {
  const grid = world.grid;
  const tick = world.tick;
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'unit') continue;
    if (e.pathIdx * 2 >= e.path.length || e.stunUntil > tick) continue;
    const step = speedPerTick(world, e);
    // Every few ticks, skip a waypoint if the one after it is already in a straight line of walk.
    if ((tick + e.id) % 4 === 0 && (e.pathIdx + 1) * 2 < e.path.length) {
      const nx = e.path[(e.pathIdx + 1) * 2] as number;
      const ny = e.path[(e.pathIdx + 1) * 2 + 1] as number;
      if (walkable(grid, e.x, e.y, nx, ny)) e.pathIdx++;
    }
    let budget = step;
    while (budget > 0 && e.pathIdx * 2 < e.path.length) {
      const tx = e.path[e.pathIdx * 2] as number;
      const ty = e.path[e.pathIdx * 2 + 1] as number;
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (dx > 0.01) e.facing = 1;
      else if (dx < -0.01) e.facing = -1;
      const isLast = (e.pathIdx + 1) * 2 >= e.path.length;
      // Intermediate waypoints only need to be passed near, so crowds don't fight over a point.
      if (!isLast && d < 0.45) {
        e.pathIdx++;
        continue;
      }
      if (d <= budget) {
        tryMove(grid, e, tx, ty);
        budget -= d;
        e.pathIdx++;
      } else {
        tryMove(grid, e, e.x + (dx / d) * budget, e.y + (dy / d) * budget);
        budget = 0;
      }
    }
    // Stuck detection by progress towards the goal: crowds at the destination simply stop;
    // elsewhere we repath once in a while.
    const dGoal =
      e.goalSize > 0 ? distToGoalRect(e) : Math.sqrt((e.goalX - e.x) ** 2 + (e.goalY - e.y) ** 2);
    if (dGoal < e.bestGoalDist - 0.05) {
      e.bestGoalDist = dGoal;
      e.stuck = 0;
    } else {
      e.stuck++;
    }
    if (
      e.stuck > 16 &&
      (dGoal < 2.5 + Math.sqrt(world.spatial.query(e.x, e.y, 2).length) * 0.4 || e.goalSize > 0)
    ) {
      stopMoving(e);
    } else if (e.stuck > 60) {
      e.needsPath = true;
      e.stuck = 0;
      e.bestGoalDist = 1e9;
    }
  }
  separate(world);
}

function distToGoalRect(e: Entity): number {
  return distToRect(e.x, e.y, e.goalTX, e.goalTY, e.goalSize);
}

/** Move to (nx, ny) unless that enters a blocked tile; slide along walls. Returns distance moved. */
function tryMove(grid: World['grid'], e: Entity, nx: number, ny: number): number {
  const ox = e.x;
  const oy = e.y;
  if (!grid.isBlocked(Math.floor(nx), Math.floor(ny))) {
    e.x = nx;
    e.y = ny;
  } else if (!grid.isBlocked(Math.floor(nx), Math.floor(oy))) {
    e.x = nx;
  } else if (!grid.isBlocked(Math.floor(ox), Math.floor(ny))) {
    e.y = ny;
  }
  return Math.sqrt((e.x - ox) ** 2 + (e.y - oy) ** 2);
}

/** Push overlapping units apart. Busy (stationary, working) units are harder to push. */
function separate(world: World): void {
  const sh = world.spatial;
  sh.rebuild(world.entities);
  const grid = world.grid;
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'unit') continue;
    const near = sh.query(e.x, e.y, e.radius + 0.75);
    for (let k = 0; k < near.length; k++) {
      const o = near[k] as Entity;
      if (o.id <= e.id) continue; // each pair once
      let dx = o.x - e.x;
      let dy = o.y - e.y;
      let d2 = dx * dx + dy * dy;
      const minD = (e.radius + o.radius) * 0.9;
      if (d2 >= minD * minD) continue;
      if (d2 < 1e-6) {
        // Exactly on top of each other: split deterministically by id.
        dx = (o.id % 2 === 0 ? 1 : -1) * 0.01;
        dy = 0.01;
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2);
      const overlap = (minD - d) * 0.5;
      const ux = dx / d;
      const uy = dy / d;
      const eMoving = isMoving(e);
      const oMoving = isMoving(o);
      // Idle units yield to moving ones; two of a kind share equally.
      const we = eMoving === oMoving ? 0.5 : eMoving ? 0.25 : 0.75;
      const wo = 1 - we;
      nudge(grid, e, -ux * overlap * we * 2, -uy * overlap * we * 2);
      nudge(grid, o, ux * overlap * wo * 2, uy * overlap * wo * 2);
    }
  }
}

function nudge(grid: World['grid'], e: Entity, dx: number, dy: number): void {
  if (e.stunUntil > 0 && dx === 0 && dy === 0) return;
  const nx = e.x + dx;
  const ny = e.y + dy;
  if (!grid.isBlocked(Math.floor(nx), Math.floor(e.y))) e.x = nx;
  if (!grid.isBlocked(Math.floor(e.x), Math.floor(ny))) e.y = ny;
}

/** Units standing inside a newly blocked footprint are moved to the nearest open tile. */
export function ejectUnitsFrom(world: World, b: Entity): void {
  for (const u of world.entities) {
    if (u.dead || u.kind !== 'unit') continue;
    if (u.x < b.tileX - 0.2 || u.x > b.tileX + b.size + 0.2) continue;
    if (u.y < b.tileY - 0.2 || u.y > b.tileY + b.size + 0.2) continue;
    if (!world.grid.isBlocked(Math.floor(u.x), Math.floor(u.y))) continue;
    const ti = world.grid.nearestWalkable(u.x, u.y);
    if (ti < 0) continue;
    u.x = (ti % world.grid.w) + 0.5;
    u.y = Math.floor(ti / world.grid.w) + 0.5;
    if (u.pathIdx * 2 < u.path.length) u.needsPath = true;
  }
}

/**
 * Formation slots for a group move: walkable points around the target, nearest first, spaced so
 * units don't fight over the same spot.
 */
export function formationSlots(
  world: World,
  x: number,
  y: number,
  count: number,
  spacing = 0.8,
): Array<[number, number]> {
  const slots: Array<[number, number]> = [];
  if (count <= 1) return [[x, y]];
  const grid = world.grid;
  for (let ring = 0; slots.length < count && ring < 12; ring++) {
    if (ring === 0) {
      if (!grid.isBlocked(Math.floor(x), Math.floor(y))) slots.push([x, y]);
      continue;
    }
    for (let dy = -ring; dy <= ring && slots.length < count; dy++) {
      for (let dx = -ring; dx <= ring && slots.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const sx = x + dx * spacing;
        const sy = y + dy * spacing;
        if (!grid.isBlocked(Math.floor(sx), Math.floor(sy))) slots.push([sx, sy]);
      }
    }
  }
  while (slots.length < count) slots.push([x, y]);
  return slots;
}
