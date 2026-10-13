import type { World } from '../sim/world';

/**
 * Find a building spot for `owner` near (cx, cy): searches outward ring by ring (deterministic),
 * requires explored, buildable tiles, keeps a one-tile walking gap around other buildings and a
 * two-tile gap from resources so gatherers aren't boxed in.
 */
export function findBuildSpot(
  world: World,
  owner: number,
  size: number,
  cx: number,
  cy: number,
  minR = 2,
  maxR = 16,
): { x: number; y: number } | null {
  const grid = world.grid;
  const fog = world.fog[owner];
  const w = world.map.width;
  const ox = Math.floor(cx - size / 2);
  const oy = Math.floor(cy - size / 2);
  for (let r = minR; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = ox + dx;
        const ty = oy + dy;
        if (!grid.canPlace(tx, ty, size)) continue;
        if (!clearAround(world, tx, ty, size)) continue;
        let explored = true;
        for (let y = ty; y < ty + size && explored; y++)
          for (let x = tx; x < tx + size && explored; x++)
            if (fog && fog[y * w + x] === 0) explored = false;
        if (!explored) continue;
        return { x: tx, y: ty };
      }
    }
  }
  return null;
}

function clearAround(world: World, tx: number, ty: number, size: number): boolean {
  const grid = world.grid;
  for (let y = ty - 2; y < ty + size + 2; y++) {
    for (let x = tx - 2; x < tx + size + 2; x++) {
      if (!grid.inBounds(x, y)) continue;
      const inner = x >= tx && x < tx + size && y >= ty && y < ty + size;
      if (inner) continue;
      const occ = grid.occupant[y * grid.w + x] ?? 0;
      if (!occ) continue;
      const e = world.byId.get(occ);
      if (!e) continue;
      const ring1 = x >= tx - 1 && x <= tx + size && y >= ty - 1 && y <= ty + size;
      // Buildings must leave a 1-tile path; resources a 2-tile gathering space.
      if (e.kind === 'resource') return false;
      if (ring1) return false;
    }
  }
  return true;
}
