import { Terrain } from '../../sim/map/terrain';
import type { GameMap } from '../../sim/map/mapgen';
import { tileHash } from '../../sim/map/noise';

/**
 * Tileset layout contract. Any replacement tileset image (real art) must follow this layout:
 * one row per terrain, 16 columns, TILE_PX square tiles with MARGIN/SPACING extrusion.
 *
 * - Grass / Sand / Forest rows: columns 0..VARIANTS-1 are interchangeable variants.
 * - Water / Cliff rows: column = 4-bit edge mask of neighbours that are NOT the same terrain
 *   (bit 0 = north, 1 = east, 2 = south, 3 = west) so shores and cliff rims can be drawn.
 */
export const TILE_PX = 64;
export const TILESET_MARGIN = 1;
export const TILESET_SPACING = 2;
export const TILESET_COLUMNS = 16;
export const TILESET_ROWS = 5;
export const VARIANTS = 4;

export const TILESET_ROW: Record<Terrain, number> = {
  [Terrain.Grass]: 0,
  [Terrain.Sand]: 1,
  [Terrain.Forest]: 2,
  [Terrain.Water]: 3,
  [Terrain.Cliff]: 4,
};

export const EDGE_N = 1;
export const EDGE_E = 2;
export const EDGE_S = 4;
export const EDGE_W = 8;

/** Mask of neighbours that differ from `t` (off-map counts as the same terrain). */
export function edgeMask(map: GameMap, x: number, y: number, t: number): number {
  const same = (nx: number, ny: number): boolean => {
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return true;
    return map.tiles[ny * map.width + nx] === t;
  };
  let m = 0;
  if (!same(x, y - 1)) m |= EDGE_N;
  if (!same(x + 1, y)) m |= EDGE_E;
  if (!same(x, y + 1)) m |= EDGE_S;
  if (!same(x - 1, y)) m |= EDGE_W;
  return m;
}

/** Tileset frame index for map tile (x, y). */
export function tileFrame(map: GameMap, x: number, y: number): number {
  const t = map.tiles[y * map.width + x] as Terrain;
  const row = TILESET_ROW[t];
  let col: number;
  if (t === Terrain.Water || t === Terrain.Cliff) col = edgeMask(map, x, y, t);
  else col = Math.floor(tileHash(x, y, 0x51ed) * VARIANTS);
  return row * TILESET_COLUMNS + col;
}
