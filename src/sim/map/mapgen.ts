import { MAPGEN } from '../../data/balance/map';
import { Rng } from '../core/rng';
import { fractalNoise } from './noise';
import { Terrain, isWalkable } from './terrain';

export interface TilePoint {
  x: number;
  y: number;
}

export type FeatureKind = 'gold' | 'berries' | 'fish';

/**
 * A static resource on the map. Gold mines occupy 2x2 tiles (x, y = top-left); berries 1x1 on
 * land; fish 1x1 on a shoreline water tile (gathered from the adjacent shore).
 */
export interface MapFeature {
  kind: FeatureKind;
  x: number;
  y: number;
  amount: number;
}

export interface GameMap {
  width: number;
  height: number;
  seed: number;
  /** Terrain per tile, row-major (index = y * width + x). */
  tiles: Uint8Array;
  /** Remaining wood per tile (non-zero only on forest tiles). */
  wood: Uint16Array;
  /** Player start tiles (centre of the Town Hall). Index = player slot. */
  starts: TilePoint[];
  features: MapFeature[];
}

export function featureSize(kind: FeatureKind): number {
  return kind === 'gold' ? 2 : 1;
}

/** 8 compass directions; `TOWARD_CENTER` (index 1) is skipped for start resources. */
const DIRS: readonly TilePoint[] = [
  { x: 1, y: 0 },
  { x: 0.7071, y: 0.7071 },
  { x: 0, y: 1 },
  { x: -0.7071, y: 0.7071 },
  { x: -1, y: 0 },
  { x: -0.7071, y: -0.7071 },
  { x: 0, y: -1 },
  { x: 0.7071, y: -0.7071 },
];
const TOWARD_CENTER = 1;

/**
 * Generate a point-symmetric (180° rotation) 1v1 map. Deterministic for a given seed and size.
 */
export function generateMap(size: number, seed: number): GameMap {
  const w = size;
  const h = size;
  const rng = new Rng(seed);
  const tiles = new Uint8Array(w * h);
  const total = w * h;
  const elevSeed = rng.nextU32() | 0;
  const moistSeed = rng.nextU32() | 0;

  // 1. Terrain from two noise fields. Only the canonical half is sampled, then mirrored.
  const elev = new Float64Array(total);
  const moist = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const j = total - 1 - i;
    if (i > j) break;
    const x = i % w;
    const y = (i - x) / w;
    elev[i] = elev[j] = fractalNoise(x, y, elevSeed, MAPGEN.elevationScale, MAPGEN.octaves);
    moist[i] = moist[j] = fractalNoise(x, y, moistSeed, MAPGEN.moistureScale, MAPGEN.octaves);
  }
  const waterMax = percentile(elev, MAPGEN.waterFraction);
  const sandMax = percentile(elev, MAPGEN.waterFraction + MAPGEN.sandFraction);
  const cliffMin = percentile(elev, 1 - MAPGEN.cliffFraction);
  const forestMin = percentile(moist, 1 - MAPGEN.forestFraction);
  for (let i = 0; i < total; i++) {
    const e = elev[i] as number;
    let t: Terrain = Terrain.Grass;
    if (e < waterMax) t = Terrain.Water;
    else if (e < sandMax) t = Terrain.Sand;
    else if (e >= cliffMin) t = Terrain.Cliff;
    else if ((moist[i] as number) >= forestMin) t = Terrain.Forest;
    tiles[i] = t;
  }

  smoothSpecks(tiles, w, h);

  const map: GameMap = {
    width: w,
    height: h,
    seed,
    tiles,
    wood: new Uint16Array(total),
    starts: [],
    features: [],
  };
  const setSym = (x: number, y: number, t: Terrain): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    tiles[y * w + x] = t;
    tiles[(h - 1 - y) * w + (w - 1 - x)] = t;
  };

  // 2. Start positions and their cleared areas.
  const inset = Math.round(size * MAPGEN.startInset);
  const s0 = { x: inset, y: inset };
  const s1 = mirror(map, s0);
  map.starts.push(s0, s1);
  forDisc(s0, MAPGEN.startClearRadius, (x, y) => setSym(x, y, Terrain.Grass));

  // 3. Guaranteed resources around each start, in three distinct directions away from the enemy.
  const dirIdx = [0, 2, 3, 4, 5, 6, 7].filter((d) => d !== TOWARD_CENTER);
  const takeDir = (): TilePoint => {
    const k = rng.int(0, dirIdx.length - 1);
    const d = dirIdx.splice(k, 1)[0] as number;
    return DIRS[d] as TilePoint;
  };
  const forestDir = takeDir();
  const fc = offset(s0, forestDir, MAPGEN.startForestDistance);
  forDisc(fc, MAPGEN.startForestRadius, (x, y) => {
    if (dist2(s0, { x, y }) >= (MAPGEN.startClearRadius - 1) ** 2) setSym(x, y, Terrain.Forest);
  });
  const goldDir = takeDir();
  const g = offset(s0, goldDir, MAPGEN.startGoldDistance);
  placeFeature(map, 'gold', g.x, g.y, setSym);
  const berryDir = takeDir();
  const b = offset(s0, berryDir, MAPGEN.startBerryDistance);
  placeBerryCluster(map, b, rng, setSym);

  // Clearing the start areas can leave orphaned water/cliff tiles at their rims.
  smoothSpecks(tiles, w, h);

  // 4. Make sure the two bases are connected over walkable ground.
  ensureConnected(map, setSym);

  // 5. Extra resources in the canonical half (mirrored), only on reachable ground.
  placeExtras(map, rng, 'gold', MAPGEN.extraGoldMines, setSym);
  placeExtras(map, rng, 'berries', MAPGEN.extraBerryClusters, setSym);

  for (let i = 0; i < total; i++) {
    if (tiles[i] === Terrain.Forest) map.wood[i] = MAPGEN.woodPerTree;
  }

  // 6. Fishing spots on reachable shorelines (last, so earlier generation is unaffected).
  placeFish(map, rng);
  return map;
}

/**
 * Fish shoals sit on water tiles next to reachable shore: one near each base when there is water
 * close by, plus a few extras. Mirrored like everything else.
 */
function placeFish(map: GameMap, rng: Rng): void {
  const w = map.width;
  const total = w * map.height;
  const [s0] = map.starts as [TilePoint, TilePoint];
  const reach = floodReachable(map, s0);
  const candidates: TilePoint[] = [];
  for (let i = 0; i < total; i++) {
    if (i > total - 1 - i) break; // canonical half
    if (map.tiles[i] !== Terrain.Water) continue;
    const x = i % w;
    const y = (i - x) / w;
    let shore = 0;
    let water = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!inBounds(map, x + dx, y + dy)) continue;
      const j = (y + dy) * w + x + dx;
      if (reach[j]) shore++;
      else if (map.tiles[j] === Terrain.Water) water++;
    }
    if (shore > 0 && water >= 2) candidates.push({ x, y });
  }
  const spacing2 = MAPGEN.fishSpacing ** 2;
  const fishes: TilePoint[] = [];
  const add = (c: TilePoint): void => {
    const m = mirror(map, c);
    if (dist2(m, c) < spacing2) return;
    fishes.push(c, m);
    map.features.push({ kind: 'fish', x: c.x, y: c.y, amount: MAPGEN.foodPerFish });
    map.features.push({ kind: 'fish', x: m.x, y: m.y, amount: MAPGEN.foodPerFish });
  };
  const free = (c: TilePoint): boolean => !fishes.some((f) => dist2(f, c) < spacing2);
  // Home spot: closest candidate to the first start (its mirror serves the second start).
  let best: TilePoint | null = null;
  let bestD = MAPGEN.homeFishDistance ** 2;
  for (const c of candidates) {
    const d = dist2(c, s0);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best) add(best);
  for (let k = 0; k < 60 && fishes.length < 2 + MAPGEN.extraFishSpots * 2; k++) {
    if (candidates.length === 0) break;
    const c = candidates[rng.int(0, candidates.length - 1)] as TilePoint;
    if (free(c)) add(c);
  }
}

/**
 * Remove single-tile specks of water/cliff (they read as noise and create pathing pockets).
 * Reads from a copy so the pass stays symmetric.
 */
function smoothSpecks(tiles: Uint8Array, w: number, h: number): void {
  const src = Uint8Array.from(tiles);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = src[y * w + x];
      if (t !== Terrain.Water && t !== Terrain.Cliff) continue;
      let same = 0;
      if (y > 0 && src[(y - 1) * w + x] === t) same++;
      if (y < h - 1 && src[(y + 1) * w + x] === t) same++;
      if (x > 0 && src[y * w + x - 1] === t) same++;
      if (x < w - 1 && src[y * w + x + 1] === t) same++;
      if (same <= 1) tiles[y * w + x] = t === Terrain.Water ? Terrain.Sand : Terrain.Grass;
    }
  }
}

/** Value below which `fraction` of the samples lie. */
function percentile(values: Float64Array, fraction: number): number {
  const sorted = Float64Array.from(values).sort();
  const k = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)));
  return sorted[k] as number;
}

export function mirror(map: GameMap, p: TilePoint, size = 1): TilePoint {
  return { x: map.width - size - p.x, y: map.height - size - p.y };
}

function offset(p: TilePoint, d: TilePoint, dist: number): TilePoint {
  return { x: Math.round(p.x + d.x * dist), y: Math.round(p.y + d.y * dist) };
}

function dist2(a: TilePoint, b: TilePoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function forDisc(c: TilePoint, r: number, fn: (x: number, y: number) => void): void {
  for (let y = c.y - r; y <= c.y + r; y++) {
    for (let x = c.x - r; x <= c.x + r; x++) {
      if ((x - c.x) ** 2 + (y - c.y) ** 2 <= r * r) fn(x, y);
    }
  }
}

type SetSym = (x: number, y: number, t: Terrain) => void;

function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** Place a feature and its mirror; forces open ground under the footprint. */
function placeFeature(map: GameMap, kind: FeatureKind, x: number, y: number, setSym: SetSym): void {
  const size = featureSize(kind);
  const amount = kind === 'gold' ? MAPGEN.goldPerMine : MAPGEN.foodPerBerryBush;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) setSym(x + dx, y + dy, Terrain.Grass);
  }
  map.features.push({ kind, x, y, amount });
  const m = mirror(map, { x, y }, size);
  map.features.push({ kind, x: m.x, y: m.y, amount });
}

function placeBerryCluster(map: GameMap, c: TilePoint, rng: Rng, setSym: SetSym): void {
  const offsets = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: -1 },
  ];
  let placed = 0;
  while (placed < MAPGEN.berryClusterSize && offsets.length > 0) {
    const o = offsets.splice(placed === 0 ? 0 : rng.int(0, offsets.length - 1), 1)[0] as TilePoint;
    const x = c.x + o.x;
    const y = c.y + o.y;
    if (!inBounds(map, x, y) || featureAt(map, x, y)) continue;
    placeFeature(map, 'berries', x, y, setSym);
    placed++;
  }
}

function featureAt(map: GameMap, x: number, y: number): MapFeature | undefined {
  return map.features.find((f) => {
    const s = featureSize(f.kind);
    return x >= f.x && x < f.x + s && y >= f.y && y < f.y + s;
  });
}

/** Tiles walkable for pathing purposes at generation time (terrain walkable and no feature). */
function blockedMask(map: GameMap): Uint8Array {
  const mask = new Uint8Array(map.width * map.height);
  for (let i = 0; i < mask.length; i++) mask[i] = isWalkable(map.tiles[i] as number) ? 0 : 1;
  for (const f of map.features) {
    const s = featureSize(f.kind);
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) mask[(f.y + dy) * map.width + f.x + dx] = 1;
    }
  }
  return mask;
}

/** 4-connected flood fill of open tiles from `from`. Returns 1 for reachable tiles. */
export function floodReachable(
  map: GameMap,
  from: TilePoint,
  blocked = blockedMask(map),
): Uint8Array {
  const w = map.width;
  const seen = new Uint8Array(w * map.height);
  const stack: number[] = [from.y * w + from.x];
  seen[from.y * w + from.x] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    const nbs = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const;
    for (const [nx, ny] of nbs) {
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * w + nx;
      if (seen[j] || blocked[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

function ensureConnected(map: GameMap, setSym: SetSym): void {
  const [s0, s1] = map.starts as [TilePoint, TilePoint];
  const reach = floodReachable(map, s0);
  if (reach[s1.y * map.width + s1.x]) return;
  // Carve a straight corridor between the bases (symmetric because both endpoints are mirrors).
  const steps = Math.max(Math.abs(s1.x - s0.x), Math.abs(s1.y - s0.y));
  const r = Math.floor(MAPGEN.corridorWidth / 2);
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(s0.x + ((s1.x - s0.x) * k) / steps);
    const y = Math.round(s0.y + ((s1.y - s0.y) * k) / steps);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (!inBounds(map, x + dx, y + dy)) continue;
        const t = map.tiles[(y + dy) * map.width + x + dx];
        if (!isWalkable(t as number)) setSym(x + dx, y + dy, Terrain.Grass);
      }
    }
  }
}

function placeExtras(
  map: GameMap,
  rng: Rng,
  kind: FeatureKind,
  count: number,
  setSym: SetSym,
): void {
  const size = featureSize(kind);
  const [s0, s1] = map.starts as [TilePoint, TilePoint];
  const minStartDist2 = (MAPGEN.startClearRadius + 3) ** 2;
  let placed = 0;
  for (let attempt = 0; attempt < 200 && placed < count; attempt++) {
    const x = rng.int(1, map.width - 2 - size);
    // Canonical half: upper half of the map (mirror lands in the lower half).
    const y = rng.int(1, Math.floor(map.height / 2) - size);
    const c = { x, y };
    if (dist2(c, s0) < minStartDist2 || dist2(c, s1) < minStartDist2) continue;
    const spacing2 = MAPGEN.featureSpacing ** 2;
    if (map.features.some((f) => dist2(f, c) < spacing2)) continue;
    const mc = mirror(map, c, size);
    if (dist2(mc, c) < spacing2 * 4) continue;
    const blocked = blockedMask(map);
    const reach = floodReachable(map, s0, blocked);
    let ok = true;
    for (let dy = 0; dy < size && ok; dy++) {
      for (let dx = 0; dx < size && ok; dx++) {
        if (!reach[(y + dy) * map.width + x + dx]) ok = false;
      }
    }
    if (!ok) continue;
    const before = map.features.length;
    placeFeature(map, kind, x, y, setSym);
    // Reject placements that cut the bases apart (e.g. a mine plugging a 1-tile choke).
    const after = floodReachable(map, s0);
    if (!after[s1.y * map.width + s1.x]) {
      map.features.length = before;
      continue;
    }
    if (kind === 'berries') {
      // Grow the cluster around the seed bush.
      const seedBush = { x, y };
      map.features.length = before;
      placeBerryCluster(map, seedBush, rng, setSym);
    }
    placed++;
  }
}
