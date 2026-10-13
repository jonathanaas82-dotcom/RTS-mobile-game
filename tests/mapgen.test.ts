import { describe, expect, it } from 'vitest';
import { featureSize, floodReachable, generateMap, mirror } from '../src/sim/map/mapgen';
import { Terrain, isWalkable } from '../src/sim/map/terrain';

const SEEDS = [1, 2, 3, 42, 1337, 99999, 0xdeadbeef];

describe('generateMap', () => {
  it('is deterministic for a seed', () => {
    const a = generateMap(64, 123);
    const b = generateMap(64, 123);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.features).toEqual(b.features);
  });

  it('differs between seeds', () => {
    const a = generateMap(64, 1);
    const b = generateMap(64, 2);
    expect(Array.from(a.tiles)).not.toEqual(Array.from(b.tiles));
  });

  it.each(SEEDS)('seed %i: is point-symmetric', (seed) => {
    const m = generateMap(64, seed);
    const n = m.tiles.length;
    for (let i = 0; i < n; i++) expect(m.tiles[i]).toBe(m.tiles[n - 1 - i]);
    expect(m.starts[1]).toEqual(mirror(m, m.starts[0]!));
    // Every feature has a mirrored twin of the same kind.
    for (const f of m.features) {
      const mm = mirror(m, f, featureSize(f.kind));
      expect(m.features.some((g) => g.kind === f.kind && g.x === mm.x && g.y === mm.y)).toBe(true);
    }
  });

  it.each(SEEDS)('seed %i: bases are open and connected', (seed) => {
    const m = generateMap(64, seed);
    const [s0, s1] = m.starts as [{ x: number; y: number }, { x: number; y: number }];
    expect(isWalkable(m.tiles[s0.y * m.width + s0.x]!)).toBe(true);
    const reach = floodReachable(m, s0);
    expect(reach[s1.y * m.width + s1.x]).toBe(1);
  });

  it.each(SEEDS)('seed %i: each base has gold, berries and forest nearby', (seed) => {
    const m = generateMap(64, seed);
    for (const s of m.starts) {
      const near = (x: number, y: number, r: number) => (x - s.x) ** 2 + (y - s.y) ** 2 <= r * r;
      expect(m.features.some((f) => f.kind === 'gold' && near(f.x, f.y, 10))).toBe(true);
      expect(
        m.features.filter((f) => f.kind === 'berries' && near(f.x, f.y, 8)).length,
      ).toBeGreaterThanOrEqual(3);
      let forest = 0;
      for (let y = 0; y < m.height; y++)
        for (let x = 0; x < m.width; x++)
          if (m.tiles[y * m.width + x] === Terrain.Forest && near(x, y, 14)) forest++;
      expect(forest).toBeGreaterThan(10);
    }
  });

  it('features sit on walkable ground and do not overlap', () => {
    for (const seed of SEEDS) {
      const m = generateMap(64, seed);
      const occ = new Set<number>();
      for (const f of m.features) {
        const s = featureSize(f.kind);
        for (let dy = 0; dy < s; dy++)
          for (let dx = 0; dx < s; dx++) {
            const i = (f.y + dy) * m.width + f.x + dx;
            expect(isWalkable(m.tiles[i]!)).toBe(true);
            expect(occ.has(i)).toBe(false);
            occ.add(i);
          }
      }
    }
  });

  it('assigns wood only to forest tiles', () => {
    const m = generateMap(48, 5);
    for (let i = 0; i < m.tiles.length; i++) {
      expect(m.wood[i]! > 0).toBe(m.tiles[i] === Terrain.Forest);
    }
  });

  it('has a varied terrain mix', () => {
    const counts = new Array(5).fill(0);
    for (const seed of SEEDS) {
      const m = generateMap(64, seed);
      for (const t of m.tiles) counts[t]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    expect(counts[Terrain.Grass] / total).toBeGreaterThan(0.35);
    expect(counts[Terrain.Water] / total).toBeGreaterThan(0.03);
    expect(counts[Terrain.Forest] / total).toBeGreaterThan(0.08);
    expect(counts[Terrain.Cliff] / total).toBeGreaterThan(0.01);
  });
});
