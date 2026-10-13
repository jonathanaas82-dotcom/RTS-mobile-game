/** Procedural map generation parameters. Thresholds are on noise values in [0, 1). */
export const MAP_SIZES = { small: 48, medium: 64, large: 80 } as const;
export type MapSizeKey = keyof typeof MAP_SIZES;

export const MAPGEN = {
  /** Base noise scale in tiles (larger = broader features). */
  elevationScale: 11,
  moistureScale: 7,
  octaves: 3,
  /**
   * Terrain mix as fractions of the map, applied as percentiles of the noise fields so every seed
   * gets a similar balance: lowest elevation -> water, then a sand shore band; highest -> cliffs;
   * wettest remaining land -> forest.
   */
  waterFraction: 0.13,
  sandFraction: 0.06,
  cliffFraction: 0.05,
  forestFraction: 0.22,
  /** Start positions as a fraction of map size from the top-left corner (player 2 is mirrored). */
  startInset: 0.17,
  /** Radius (tiles) cleared to open ground around each start. */
  startClearRadius: 7,
  /** Guaranteed resources near each start. */
  startGoldDistance: 7,
  startBerryDistance: 5,
  startForestDistance: 9,
  startForestRadius: 3,
  berryClusterSize: 5,
  /** Extra resources per half of the map (mirrored to the other half). */
  extraGoldMines: 3,
  extraBerryClusters: 2,
  /** Minimum distance (tiles) between any two resource features. */
  featureSpacing: 4,
  /** Width (tiles) of the corridor carved if the bases are not connected. */
  corridorWidth: 2,
  goldPerMine: 3000,
  foodPerBerryBush: 200,
  woodPerTree: 150,
} as const;
