import { buildingDef, powerDef } from '../../data';
import { RULES } from '../../data/balance/rules';
import { SIM, secondsToTicks } from '../../data/balance/sim';
import type { Entity } from '../entity';
import { modified } from '../player';
import { canCast } from '../rules';
import { spawnUnit, type World } from '../world';
import { applyDamage } from './combat';
import { updateFog } from './fog';

const TPS = SIM.ticksPerSecond;
/** Area effects apply every N ticks (cheaper, same total). */
const EFFECT_PERIOD = 5;

/** Enemy (or allied) units and buildings within radius of a point. */
function inArea(
  world: World,
  x: number,
  y: number,
  r: number,
  pred: (e: Entity) => boolean,
): Entity[] {
  const out: Entity[] = [];
  for (const e of world.spatial.query(x, y, r + 0.8)) {
    if (!e.dead && pred(e) && (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.radius) ** 2) out.push(e);
  }
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'building' || !pred(e)) continue;
    const cx = Math.max(e.tileX, Math.min(x, e.tileX + e.size));
    const cy = Math.max(e.tileY, Math.min(y, e.tileY + e.size));
    if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) out.push(e);
  }
  return out;
}

/** Validate and cast a god power for `player` at (x, y). */
export function castPower(world: World, player: number, power: string, x: number, y: number): void {
  const p = world.players[player];
  if (!p) return;
  const chk = canCast(world, p, power);
  if (!chk.ok) {
    world.events.push({
      type: 'error',
      owner: player,
      code: chk.reason === 'cooldown' ? 'cooldown' : 'cost',
    });
    return;
  }
  const d = powerDef(power);
  const ps = p.powers.find((q) => q.id === power)!;
  p.res.favor -= d.favorCost;
  ps.readyAt = world.tick + secondsToTicks(d.cooldown);
  const tick = world.tick;
  const dur = secondsToTicks(d.duration ?? 0);
  const enemy = (e: Entity): boolean => e.owner >= 0 && e.owner !== player;
  if (d.radius <= 0) {
    // Untargeted: centre the visual on the player's first Town Hall.
    const hall = world.entities.find(
      (e) => !e.dead && e.owner === player && e.kind === 'building' && buildingDef(e.def).main,
    );
    x = hall?.x ?? 0;
    y = hall?.y ?? 0;
  }
  world.events.push({ type: 'power', owner: player, power, x, y });
  switch (d.kind) {
    case 'strike':
      for (const e of inArea(world, x, y, d.radius, enemy)) {
        const amt = (d.amount ?? 0) * (e.kind === 'building' ? (d.vsBuildings ?? 1) : 1);
        applyDamage(world, { owner: player, cls: 'mythic', entity: null }, e, amt, true);
      }
      break;
    case 'freeze':
      for (const e of inArea(world, x, y, d.radius, enemy))
        if (e.kind === 'unit') e.stunUntil = Math.max(e.stunUntil, tick + dur);
      world.effects.push(
        effect(world, power, 'freeze', player, x, y, d.radius, d.amount ?? 0, 0, dur),
      );
      break;
    case 'dot':
    case 'heal':
    case 'slow':
      world.effects.push(
        effect(
          world,
          power,
          d.kind,
          player,
          x,
          y,
          d.radius,
          d.amount ?? 0,
          d.vsBuildings ?? 1,
          dur,
        ),
      );
      break;
    case 'reveal':
      world.effects.push(effect(world, power, 'reveal', player, x, y, d.radius, 0, 0, dur));
      updateFog(world);
      break;
    case 'summon': {
      const n = d.count ?? 1;
      for (let i = 0; i < n; i++) {
        const u = spawnUnit(
          world,
          player,
          d.unit!,
          x + (i % 3) * 0.6 - 0.6,
          y + Math.floor(i / 3) * 0.6 - 0.3,
        );
        u.expiresAt = tick + secondsToTicks(d.duration ?? RULES.summonLifetime);
      }
      break;
    }
    case 'boost':
      for (const m of d.boost ?? []) p.timed.push({ mod: m, until: tick + dur });
      break;
  }
}

function effect(
  world: World,
  power: string,
  kind: World['effects'][number]['kind'],
  owner: number,
  x: number,
  y: number,
  radius: number,
  amount: number,
  vsBuildings: number,
  dur: number,
): World['effects'][number] {
  return {
    power,
    kind,
    owner,
    x,
    y,
    radius,
    amount,
    vsBuildings,
    until: world.tick + dur,
    started: world.tick,
  };
}

/** Tick lingering god-power areas; drop expired effects and timed modifiers. */
export function powerEffectsSystem(world: World): void {
  const tick = world.tick;
  if (world.effects.length > 0) {
    for (const fx of world.effects) {
      if (fx.until <= tick) continue;
      const enemy = (e: Entity): boolean => e.owner >= 0 && e.owner !== fx.owner;
      if (fx.kind === 'slow') {
        for (const e of inArea(world, fx.x, fx.y, fx.radius, enemy))
          if (e.kind === 'unit') e.slowUntil = tick + 3;
        if (fx.amount <= 0) continue;
      }
      if ((tick - fx.started) % EFFECT_PERIOD !== 0) continue;
      const share = (fx.amount * EFFECT_PERIOD) / TPS;
      if (fx.kind === 'dot' || ((fx.kind === 'freeze' || fx.kind === 'slow') && fx.amount > 0)) {
        for (const e of inArea(world, fx.x, fx.y, fx.radius, enemy)) {
          const amt = share * (e.kind === 'building' ? fx.vsBuildings : 1);
          if (amt > 0)
            applyDamage(world, { owner: fx.owner, cls: 'mythic', entity: null }, e, amt, true);
          if (fx.power === 'frostbite' && e.kind === 'unit') e.slowUntil = tick + EFFECT_PERIOD + 1;
        }
      } else if (fx.kind === 'heal') {
        for (const e of inArea(
          world,
          fx.x,
          fx.y,
          fx.radius,
          (o) => o.owner === fx.owner && o.kind === 'unit',
        )) {
          e.hp = Math.min(e.maxHp, e.hp + share);
        }
      }
    }
    if (world.effects.some((f) => f.until <= tick))
      world.effects = world.effects.filter((f) => f.until > tick);
  }
  for (const p of world.players) {
    if (p.timed.length > 0 && p.timed.some((t) => t.until <= tick))
      p.timed = p.timed.filter((t) => t.until > tick);
  }
}

/** Shrines, monuments and (Aurelian) heroes generate Favor over time. */
export function favorSystem(world: World): void {
  const rates = new Array<number>(world.players.length).fill(0);
  for (const e of world.entities) {
    if (e.dead || e.owner < 0) continue;
    if (e.kind === 'building' && e.built) {
      const r = buildingDef(e.def).favorRate;
      if (r) rates[e.owner]! += r;
    } else if (
      e.kind === 'unit' &&
      e.cls === 'hero' &&
      world.players[e.owner]?.faction === 'aurelian'
    ) {
      rates[e.owner]! += RULES.heroFavorRate;
    }
  }
  for (const p of world.players) {
    const r = rates[p.id]!;
    if (r <= 0) continue;
    const rate = modified(p, world.tick, 'favor', r, 'building', 'favor');
    p.res.favor = Math.min(RULES.maxFavor, p.res.favor + rate / TPS);
  }
}
