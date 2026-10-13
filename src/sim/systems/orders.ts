import type { Entity } from '../entity';
import type { World } from '../world';
import { buildBehavior, gatherBehavior, returnBehavior } from './economy';
import { isMoving } from './movement';

/**
 * Per-unit behaviour state machine, driven by the current order. Extended per milestone:
 * M2 movement, M3 gather/build/return, M4 attack/attack-move/auto-acquire.
 */
export function orderSystem(world: World): void {
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'unit') continue;
    if (e.stunUntil > world.tick) continue;
    runOrder(world, e);
  }
}

function runOrder(world: World, e: Entity): void {
  switch (e.order.type) {
    case 'move':
    case 'attackMove':
      if (!isMoving(e)) e.order.type = 'idle';
      break;
    case 'gather':
      gatherBehavior(world, e);
      break;
    case 'return':
      returnBehavior(world, e);
      break;
    case 'build':
      buildBehavior(world, e);
      break;
    default:
      break;
  }
}
