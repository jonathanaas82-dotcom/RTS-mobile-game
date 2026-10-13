import { buildingDef, techDef, unitDef } from '../data';
import { ownUnits } from './actions';
import type { Command } from './commands';
import { canAfford, costOf, pay, refund, type PlayerState } from './player';
import { canAdvance, canPlace, canResearch, canTrain, nextAge, type Check } from './rules';
import { startGather } from './systems/economy';
import { ejectUnitsFrom, stopMoving } from './systems/movement';
import { queueItem } from './systems/production';
import { placeBuilding, recomputePop, type World } from './world';
import { Terrain } from './map/terrain';

function deny(world: World, p: PlayerState, chk: Check): void {
  const code =
    chk.reason === 'pop'
      ? 'pop'
      : chk.reason === 'limit'
        ? 'limit'
        : chk.reason === 'cost' || chk.reason === 'favor'
          ? 'cost'
          : chk.reason === 'cooldown'
            ? 'cooldown'
            : 'age';
  world.events.push({ type: 'error', owner: p.id, code });
}

function ownBuilding(world: World, player: number, id: number) {
  const b = world.byId.get(id);
  return b && !b.dead && b.owner === player && b.kind === 'building' ? b : null;
}

/** Economy & production commands. Returns true if handled. */
export function applyEconomyCommand(world: World, c: Command): boolean {
  const p = world.players[c.player];
  if (!p) return true;
  switch (c.type) {
    case 'gather': {
      const workers = ownUnits(world, c.player, c.ids).filter((u) => u.cls === 'worker');
      if (c.tile >= 0) {
        if (world.map.tiles[c.tile] !== Terrain.Forest) return true;
        for (const w of workers) startGather(world, w, -1, c.tile);
        return true;
      }
      const t = world.byId.get(c.target);
      if (!t || t.dead) return true;
      const ok =
        t.kind === 'resource' ||
        (t.kind === 'building' && t.def === 'farm' && t.owner === c.player);
      if (!ok) return true;
      for (const w of workers) startGather(world, w, t.id, -1);
      return true;
    }
    case 'build': {
      const workers = ownUnits(world, c.player, c.ids).filter((u) => u.cls === 'worker');
      if (workers.length === 0) return true;
      const chk = canPlace(world, p, c.def);
      if (!chk.ok) {
        deny(world, p, chk);
        return true;
      }
      const def = c.def;
      if (!world.grid.canPlace(c.tileX, c.tileY, buildingDef(def).size)) {
        world.events.push({ type: 'error', owner: p.id, code: 'place' });
        return true;
      }
      pay(p, costOf(p, world.tick, def));
      const b = placeBuilding(world, c.player, def, c.tileX, c.tileY, false);
      ejectUnitsFrom(world, b);
      for (const w of workers) {
        w.order = { type: 'build', x: 0, y: 0, target: b.id, tile: -1 };
        w.tries = 0;
        stopMoving(w);
      }
      return true;
    }
    case 'construct': {
      const b = ownBuilding(world, c.player, c.target);
      if (!b) return true;
      for (const w of ownUnits(world, c.player, c.ids).filter((u) => u.cls === 'worker')) {
        w.order = { type: 'build', x: 0, y: 0, target: b.id, tile: -1 };
        w.tries = 0;
        stopMoving(w);
      }
      return true;
    }
    case 'train': {
      const b = ownBuilding(world, c.player, c.building);
      if (!b) return true;
      const chk = canTrain(world, p, b, c.unit);
      if (!chk.ok) {
        deny(world, p, chk);
        return true;
      }
      const cost = costOf(p, world.tick, c.unit);
      pay(p, cost);
      b.queue.push(queueItem('unit', c.unit, unitDef(c.unit).trainTime, cost));
      recomputePop(world, c.player);
      return true;
    }
    case 'research': {
      const b = ownBuilding(world, c.player, c.building);
      if (!b) return true;
      const chk = canResearch(world, p, b, c.tech);
      if (!chk.ok) {
        deny(world, p, chk);
        return true;
      }
      const t = techDef(c.tech);
      pay(p, t.cost);
      b.queue.push(queueItem('tech', c.tech, t.researchTime, t.cost));
      return true;
    }
    case 'advanceAge': {
      const b = ownBuilding(world, c.player, c.building);
      if (!b) return true;
      const chk = canAdvance(p, b, c.god);
      const info = nextAge(p);
      if (!chk.ok || !info) {
        deny(world, p, chk);
        return true;
      }
      if (!canAfford(p, info.cost)) return true;
      pay(p, info.cost);
      p.advancing = true;
      b.queue.push(queueItem('age', c.god, info.time, info.cost));
      return true;
    }
    case 'cancel': {
      const b = ownBuilding(world, c.player, c.building);
      if (!b) return true;
      const q = b.queue[c.index];
      if (!q) return true;
      b.queue.splice(c.index, 1);
      refund(p, q.paid);
      if (q.kind === 'age') p.advancing = false;
      recomputePop(world, c.player);
      return true;
    }
    case 'rally': {
      const b = ownBuilding(world, c.player, c.building);
      if (!b) return true;
      b.rallyX = c.x;
      b.rallyY = c.y;
      b.hasRally = true;
      return true;
    }
    default:
      return false;
  }
}
