import { buildingDef, unitDef } from '../../data';
import { counterMultiplier } from '../../data/counters';
import { RULES } from '../../data/balance/rules';
import { SIM, secondsToTicks } from '../../data/balance/sim';
import type { AttackDef, UnitClass } from '../../data/types';
import { gap, idleOrder, type Entity } from '../entity';
import { killEntity, statOf, type World } from '../world';
import { isMoving, moveTo, moveToEntity, stopMoving } from './movement';

const TPS = SIM.ticksPerSecond;

export function attackDefOf(e: Entity): AttackDef | undefined {
  if (e.kind === 'unit') return unitDef(e.def).attack;
  if (e.kind === 'building') return buildingDef(e.def).attack;
  return undefined;
}

export function isEnemy(a: Entity, b: Entity): boolean {
  return a.owner >= 0 && b.owner >= 0 && a.owner !== b.owner && !b.dead;
}

export function attackRange(world: World, e: Entity, atk: AttackDef): number {
  return statOf(world, e, 'range', atk.range);
}

/**
 * Deal damage from an attacker (or a god power when `src` is null) to a target, applying the
 * counter matrix, armor and buffs. Handles favor-from-combat, alerts and death.
 */
export function applyDamage(
  world: World,
  src: { owner: number; cls: UnitClass; entity: Entity | null },
  target: Entity,
  base: number,
): number {
  if (target.dead || target.kind === 'resource') return 0;
  const tCls: UnitClass = target.kind === 'building' ? 'building' : (target.cls as UnitClass);
  let dmg = base * counterMultiplier(src.cls, tCls);
  if (src.entity && src.entity.buffUntil > world.tick) dmg *= 1.25;
  const baseArmor =
    target.kind === 'unit' ? unitDef(target.def).armor : buildingDef(target.def).armor;
  const armor = Math.min(0.85, Math.max(0, statOf(world, target, 'armor', baseArmor)));
  dmg = Math.max(1, dmg * (1 - armor));
  target.hp -= dmg;
  target.lastHit = world.tick;
  world.events.push({
    type: 'hit',
    target: target.id,
    x: target.x,
    y: target.y,
    amount: dmg,
    owner: src.owner,
  });

  // Hrimfolk earn Favor from fighting (dealing full rate, taking half).
  const ap = world.players[src.owner];
  if (ap && ap.faction === 'hrimfolk' && src.entity && src.entity.cls !== 'worker') {
    ap.res.favor = Math.min(
      RULES.maxFavor,
      ap.res.favor + dmg * statOf(world, src.entity, 'favor', RULES.combatFavorPerDamage),
    );
  }
  const tp = world.players[target.owner];
  if (tp && tp.faction === 'hrimfolk' && target.kind === 'unit' && target.cls !== 'worker') {
    tp.res.favor = Math.min(RULES.maxFavor, tp.res.favor + dmg * RULES.combatFavorPerDamage * 0.5);
  }
  // Alert the victim (throttled).
  if (tp && world.tick - (world.lastAlert[target.owner] ?? -1e9) > TPS * 12) {
    world.lastAlert[target.owner] = world.tick;
    world.events.push({ type: 'underAttack', owner: target.owner, x: target.x, y: target.y });
  }
  // Retaliate: idle units fight back.
  if (
    target.kind === 'unit' &&
    src.entity &&
    !src.entity.dead &&
    target.order.type === 'idle' &&
    target.cls !== 'worker'
  ) {
    target.order = { type: 'attack', x: 0, y: 0, target: src.entity.id, tile: -1 };
  }
  if (target.hp <= 0) killEntity(world, target, src.entity ?? undefined);
  return dmg;
}

function splashDamage(
  world: World,
  src: { owner: number; cls: UnitClass; entity: Entity | null },
  x: number,
  y: number,
  radius: number,
  base: number,
  primary: number,
): void {
  for (const o of world.spatial.query(x, y, radius + 0.6)) {
    if (o.id === primary || o.dead || o.owner === src.owner || o.owner < 0) continue;
    const d = Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) - o.radius;
    if (d > radius) continue;
    const falloff = 1 - 0.5 * Math.max(0, d / radius);
    applyDamage(world, src, o, base * falloff);
  }
}

/** Perform one attack (melee hit or projectile launch). */
function strike(world: World, e: Entity, target: Entity, atk: AttackDef): void {
  const dmg = statOf(world, e, 'damage', atk.damage);
  const cls: UnitClass = e.kind === 'building' ? 'building' : (e.cls as UnitClass);
  e.lastAttack = world.tick;
  e.cooldown = secondsToTicks(atk.cooldown);
  world.events.push({ type: 'attack', id: e.id, target: target.id, ranged: !!atk.projectileSpeed });
  if (atk.projectileSpeed) {
    world.projectiles.push({
      owner: e.owner,
      source: e.id,
      sourceCls: cls,
      target: target.id,
      x: e.x,
      y: e.y - (e.kind === 'building' ? 0.6 : 0.3),
      px: e.x,
      py: e.y,
      tx: target.x,
      ty: target.y,
      speed: atk.projectileSpeed / TPS,
      damage: dmg,
      splash: atk.splash ?? 0,
      dead: false,
    });
    return;
  }
  const src = { owner: e.owner, cls, entity: e };
  applyDamage(world, src, target, dmg);
  if (atk.splash) splashDamage(world, src, target.x, target.y, atk.splash, dmg, target.id);
}

/** Order 'attack' (and engaging during attack-move). Returns false when the target is gone. */
function engage(world: World, e: Entity, target: Entity, atk: AttackDef): void {
  const range = attackRange(world, e, atk);
  const d = gap(e, target);
  if (d <= range + 0.05) {
    if (isMoving(e)) stopMoving(e);
    e.facing = target.x >= e.x ? 1 : -1;
    if (e.cooldown <= 0) strike(world, e, target, atk);
    return;
  }
  // Chase: repath periodically (targets move).
  if (!isMoving(e) || world.tick >= e.repathAt) {
    e.repathAt = world.tick + RULES.chaseRepathTicks;
    moveToEntity(e, target);
  }
}

/** Nearest enemy within `r`: units first (threats before workers), then buildings. */
export function findEnemy(world: World, e: Entity, r: number, visibleTo?: number): Entity | null {
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const o of world.spatial.query(e.x, e.y, r)) {
    if (!isEnemy(e, o)) continue;
    if (visibleTo !== undefined && !visibleFor(world, visibleTo, o)) continue;
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
    // Prefer fighting units over workers.
    const score = d + (o.cls === 'worker' ? 9 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (best) return best;
  for (const o of world.entities) {
    if (o.kind !== 'building' || !isEnemy(e, o)) continue;
    const d = gap(e, o);
    if (d <= r && d * d < bestScore) {
      bestScore = d * d;
      best = o;
    }
  }
  return best;
}

export function visibleFor(world: World, player: number, e: Entity): boolean {
  const fog = world.fog[player];
  if (!fog) return true;
  const i = Math.floor(e.y) * world.map.width + Math.floor(e.x);
  return fog[i] === 2;
}

export function attackBehavior(world: World, e: Entity): void {
  const atk = attackDefOf(e);
  const target = world.byId.get(e.order.target);
  if (!atk || !target || target.dead || !isEnemy(e, target)) {
    e.order = idleOrder();
    stopMoving(e);
    return;
  }
  engage(world, e, target, atk);
}

/** Move to a point, fighting anything met on the way. order.target = current engagement. */
export function attackMoveBehavior(world: World, e: Entity): void {
  const atk = attackDefOf(e);
  if (!atk) {
    if (!isMoving(e)) e.order = idleOrder();
    return;
  }
  let target = e.order.target >= 0 ? world.byId.get(e.order.target) : undefined;
  if (target && (target.dead || !isEnemy(e, target) || gap(e, target) > unitDef(e.def).sight + 3)) {
    target = undefined;
    e.order.target = -1;
    moveTo(e, e.order.x, e.order.y);
  }
  if (!target && (world.tick + e.id) % 5 === 0) {
    const found = findEnemy(world, e, statOf(world, e, 'sight', unitDef(e.def).sight));
    if (found) {
      e.order.target = found.id;
      target = found;
    }
  }
  if (target) {
    engage(world, e, target, atk);
    return;
  }
  if (!isMoving(e)) {
    const d = Math.sqrt((e.order.x - e.x) ** 2 + (e.order.y - e.y) ** 2);
    if (d < 2.5) e.order = idleOrder();
    else if (world.tick >= e.repathAt) {
      e.repathAt = world.tick + 40;
      moveTo(e, e.order.x, e.order.y);
    }
  }
}

/** Idle military units engage enemies that come within sight. */
export function autoAcquire(world: World, e: Entity): void {
  if (e.cls === 'worker' || (world.tick + e.id) % 5 !== 0) return;
  const d = unitDef(e.def);
  if (!d.attack) return;
  const found = findEnemy(world, e, statOf(world, e, 'sight', d.sight));
  if (found) e.order = { type: 'attack', x: e.x, y: e.y, target: found.id, tile: -1 };
}

/** Cooldowns, projectiles, building attacks, regen and summon expiry. */
export function combatSystem(world: World): void {
  const tick = world.tick;
  for (const e of world.entities) {
    if (e.dead) continue;
    if (e.cooldown > 0) e.cooldown--;
    if (e.kind === 'unit') {
      if (e.expiresAt > 0 && tick >= e.expiresAt) {
        killEntity(world, e);
        continue;
      }
      if (e.cls === 'hero' && tick - e.lastHit > RULES.regenDelay * TPS && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + RULES.heroRegen / TPS);
      }
    } else if (e.kind === 'building' && e.built && e.owner >= 0) {
      const atk = buildingDef(e.def).attack;
      if (!atk || e.cooldown > 0) continue;
      const range = attackRange(world, e, atk);
      const t = findEnemy(world, e, range + e.size / 2);
      if (t && gap(t, e) <= range) strike(world, e, t, atk);
    }
  }
  // Projectiles home in on their target; splash on impact.
  for (const pr of world.projectiles) {
    const t = world.byId.get(pr.target);
    if (t && !t.dead) {
      pr.tx = t.x;
      pr.ty = t.y;
    }
    pr.px = pr.x;
    pr.py = pr.y;
    const dx = pr.tx - pr.x;
    const dy = pr.ty - pr.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= pr.speed) {
      pr.x = pr.tx;
      pr.y = pr.ty;
      pr.dead = true;
      const src = { owner: pr.owner, cls: pr.sourceCls, entity: world.byId.get(pr.source) ?? null };
      if (t && !t.dead) applyDamage(world, src, t, pr.damage);
      if (pr.splash > 0) splashDamage(world, src, pr.tx, pr.ty, pr.splash, pr.damage, pr.target);
    } else {
      pr.x += (dx / d) * pr.speed;
      pr.y += (dy / d) * pr.speed;
    }
  }
  if (world.projectiles.some((p) => p.dead))
    world.projectiles = world.projectiles.filter((p) => !p.dead);
}
