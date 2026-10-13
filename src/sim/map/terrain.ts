/** Terrain kinds stored per tile in GameMap.tiles (Uint8Array). Order is part of the save format. */
export const Terrain = {
  Grass: 0,
  Sand: 1,
  Forest: 2,
  Water: 3,
  Cliff: 4,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_COUNT = 5;

/** Can land units walk on this terrain? (Forest tiles are blocked until their trees are cut.) */
export function isWalkable(t: number): boolean {
  return t === Terrain.Grass || t === Terrain.Sand;
}

/** Can buildings be placed on this terrain? */
export function isBuildable(t: number): boolean {
  return t === Terrain.Grass || t === Terrain.Sand;
}
