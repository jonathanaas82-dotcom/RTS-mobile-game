import type { Entity } from '../entity';
import type { World } from '../world';
import { attackBehavior, attackMoveBehavior, autoAcquire } from './combat';
import { garrisonBehavior } from './garrison';
import { buildBehavior, gatherBehavior, returnBehavior } from './economy';
import { isMoving } from './movement';

/**
 * Per-unit behaviour state machine, driven by the current order. Extended per milestone:
 * M2 movement, M3 gather/build/return, M4 attack/attack-move/auto-acquire.
 */
export function orderSystem(world: World): void {
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'unit' || e.inside >= 0) continue;
    if (e.stunUntil > world.tick) continue;
    runOrder(world, e);
  }
}

function runOrder(world: World, e: Entity): void {
  switch (e.order.type) {
    case 'idle':
      autoAcquire(world, e);
      break;
    case 'move':
      if (!isMoving(e)) e.order.type = 'idle';
      break;
    case 'attackMove':
      attackMoveBehavior(world, e);
      break;
    case 'attack':
      attackBehavior(world, e);
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
    case 'garrison':
      garrisonBehavior(world, e);
      break;
    default:
      break;
  }
}
