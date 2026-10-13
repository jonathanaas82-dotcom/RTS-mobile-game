import { buildingDef, godDef, techDef, unitDef } from '../../data';
import { secondsToTicks } from '../../data/balance/sim';
import type { Entity, QueueItem } from '../entity';
import { addMods, modified } from '../player';
import { recomputePop, spawnUnit, statOf, type World } from '../world';
import { startGather } from './economy';
import { moveTo } from './movement';
import { Terrain } from '../map/terrain';

/** Advance building queues: train units, research techs, advance ages. */
export function productionSystem(world: World): void {
  for (const b of world.entities) {
    if (b.dead || b.kind !== 'building' || !b.built || b.queue.length === 0) continue;
    const q = b.queue[0]!;
    const p = world.players[b.owner];
    if (!p) continue;
    // Train-time modifiers (permanent and timed boosts) scale progress speed.
    let speed = 1;
    if (q.kind === 'unit') {
      const u = unitDef(q.id);
      speed = 1 / Math.max(0.1, modified(p, world.tick, 'trainTime', 1, u.cls, u.id));
    }
    q.progress += speed;
    if (q.progress < q.total) continue;
    b.queue.shift();
    complete(world, b, q);
  }
}

function complete(world: World, b: Entity, q: QueueItem): void {
  const p = world.players[b.owner]!;
  if (q.kind === 'unit') {
    const [x, y] = exitPoint(world, b);
    const u = spawnUnit(world, b.owner, q.id, x, y);
    p.stats.unitsTrained++;
    recomputePop(world, b.owner);
    world.events.push({ type: 'trained', id: u.id, owner: b.owner, def: q.id });
    if (b.hasRally) sendToRally(world, u, b);
  } else if (q.kind === 'tech') {
    p.techs.push(q.id);
    addMods(p, techDef(q.id).effects);
    refreshMaxHp(world, b.owner);
    world.events.push({ type: 'researched', owner: b.owner, tech: q.id });
  } else {
    const god = godDef(q.id);
    p.age = Math.min(3, p.age + 1) as typeof p.age;
    p.gods.push(god.id);
    p.advancing = false;
    addMods(p, god.bonuses);
    if (!p.powers.some((x) => x.id === god.power)) p.powers.push({ id: god.power, readyAt: 0 });
    refreshMaxHp(world, b.owner);
    world.events.push({ type: 'ageUp', owner: b.owner, age: p.age, god: god.id });
  }
}

/** New units appear on the footprint edge closest to the rally point (default: south side). */
export function exitPoint(world: World, b: Entity): [number, number] {
  const tx = b.hasRally ? b.rallyX : b.x;
  const ty = b.hasRally ? b.rallyY : b.tileY + b.size + 1;
  let best: [number, number] = [b.x, b.tileY + b.size + 0.5];
  let bestD = Infinity;
  for (let y = b.tileY - 1; y <= b.tileY + b.size; y++) {
    for (let x = b.tileX - 1; x <= b.tileX + b.size; x++) {
      const edge =
        x === b.tileX - 1 || x === b.tileX + b.size || y === b.tileY - 1 || y === b.tileY + b.size;
      if (!edge || world.grid.isBlocked(x, y)) continue;
      const d = (x + 0.5 - tx) ** 2 + (y + 0.5 - ty) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [x + 0.5, y + 0.5];
      }
    }
  }
  return best;
}

function sendToRally(world: World, u: Entity, b: Entity): void {
  const rx = b.rallyX;
  const ry = b.rallyY;
  if (u.cls === 'worker') {
    const tx = Math.floor(rx);
    const ty = Math.floor(ry);
    if (world.grid.inBounds(tx, ty)) {
      const i = ty * world.map.width + tx;
      if (world.map.tiles[i] === Terrain.Forest) {
        startGather(world, u, -1, i);
        return;
      }
      const occ = world.grid.occupant[i] ?? 0;
      const o = occ ? world.byId.get(occ) : undefined;
      if (o && (o.kind === 'resource' || (o.def === 'farm' && o.owner === u.owner))) {
        startGather(world, u, o.id, -1);
        return;
      }
    }
  }
  u.order.type = 'move';
  u.order.x = rx;
  u.order.y = ry;
  moveTo(u, rx, ry);
}

/** Re-apply HP modifiers to existing entities after techs/gods (keeps the HP fraction). */
export function refreshMaxHp(world: World, owner: number): void {
  for (const e of world.entities) {
    if (e.dead || e.owner !== owner || e.kind === 'resource') continue;
    const base = e.kind === 'unit' ? unitDef(e.def).hp : buildingDef(e.def).hp;
    const max = Math.round(statOf(world, e, 'hp', base));
    if (max === e.maxHp) continue;
    const frac = e.hp / e.maxHp;
    e.maxHp = max;
    e.hp = Math.max(1, Math.round(max * frac));
  }
}

export function queueItem(
  kind: QueueItem['kind'],
  id: string,
  seconds: number,
  paid: QueueItem['paid'],
): QueueItem {
  return { kind, id, progress: 0, total: secondsToTicks(seconds), paid };
}
