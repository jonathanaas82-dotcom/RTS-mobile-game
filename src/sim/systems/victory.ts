import { buildingDef } from '../../data';
import type { World } from '../world';

/**
 * A player is defeated when they own no main building (Town Hall) and no fighting units.
 * When only one player remains, they win.
 */
export function victorySystem(world: World): void {
  if (world.winner >= 0 || world.tick % 20 !== 0) return;
  const hasMain = new Array<boolean>(world.players.length).fill(false);
  const hasArmy = new Array<boolean>(world.players.length).fill(false);
  for (const e of world.entities) {
    if (e.dead || e.owner < 0) continue;
    if (e.kind === 'building' && buildingDef(e.def).main) hasMain[e.owner] = true;
    else if (e.kind === 'unit' && e.cls !== 'worker' && e.expiresAt === 0) hasArmy[e.owner] = true;
  }
  for (const p of world.players) {
    if (!p.defeated && !hasMain[p.id] && !hasArmy[p.id]) defeat(world, p.id);
  }
  checkWinner(world);
}

export function defeat(world: World, player: number): void {
  const p = world.players[player];
  if (!p || p.defeated) return;
  p.defeated = true;
}

export function checkWinner(world: World): void {
  const alive = world.players.filter((p) => !p.defeated);
  if (alive.length === 1 && world.winner < 0) {
    world.winner = alive[0]!.id;
    world.events.push({ type: 'gameOver', winner: world.winner });
  }
}
