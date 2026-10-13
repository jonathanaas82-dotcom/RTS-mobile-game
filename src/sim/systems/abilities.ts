import { unitDef } from '../../data';
import { secondsToTicks } from '../../data/balance/sim';
import type { Entity } from '../entity';
import type { World } from '../world';
import { applyDamage } from './combat';

/** Activate a hero's ability (validated: own hero, off cooldown). */
export function useAbility(world: World, hero: Entity): void {
  const ab = unitDef(hero.def).ability;
  if (!ab || hero.dead || hero.abilityReadyAt > world.tick || hero.stunUntil > world.tick) return;
  hero.abilityReadyAt = world.tick + secondsToTicks(ab.cooldown);
  hero.lastAttack = world.tick;
  world.events.push({
    type: 'ability',
    id: hero.id,
    owner: hero.owner,
    kind: ab.kind,
    x: hero.x,
    y: hero.y,
  });
  const r = ab.radius;
  for (const o of world.spatial.query(hero.x, hero.y, r + 0.6)) {
    if (o.dead || (o.x - hero.x) ** 2 + (o.y - hero.y) ** 2 > (r + o.radius) ** 2) continue;
    if (ab.kind === 'thunderclap') {
      if (o.owner === hero.owner || o.owner < 0) continue;
      applyDamage(world, { owner: hero.owner, cls: 'hero', entity: hero }, o, ab.amount);
      o.stunUntil = Math.max(o.stunUntil, world.tick + secondsToTicks(ab.duration));
    } else if (o.owner === hero.owner) {
      o.hp = Math.min(o.maxHp, o.hp + ab.amount);
      if (ab.kind === 'rally') o.buffUntil = world.tick + secondsToTicks(ab.duration);
    }
  }
}
