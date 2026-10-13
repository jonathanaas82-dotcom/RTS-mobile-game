import { describe, expect, it } from 'vitest';
import { Grid } from '../src/sim/grid';
import type { GameMap } from '../src/sim/map/mapgen';
import { Terrain } from '../src/sim/map/terrain';
import { Pathfinder, smoothPath } from '../src/sim/path/astar';
import { spawnUnit } from '../src/sim/world';
import { newSim, run, unitsOf } from './helpers';

function emptyMap(w: number, h: number): GameMap {
  return {
    width: w,
    height: h,
    seed: 0,
    tiles: new Uint8Array(w * h),
    wood: new Uint16Array(w * h),
    starts: [],
    features: [],
  };
}

describe('Pathfinder', () => {
  it('finds a straight path on open ground', () => {
    const grid = new Grid(emptyMap(20, 20));
    const p = new Pathfinder(grid).find(1, 1, { x0: 10, y0: 1, x1: 10, y1: 1, adjacent: false });
    expect(p.at(-1)).toBe(1 * 20 + 10);
    expect(p).toHaveLength(9);
  });

  it('routes around a wall and never steps on blocked tiles', () => {
    const m = emptyMap(20, 20);
    for (let y = 0; y < 15; y++) m.tiles[y * 20 + 10] = Terrain.Cliff;
    const grid = new Grid(m);
    const p = new Pathfinder(grid).find(2, 2, { x0: 17, y0: 2, x1: 17, y1: 2, adjacent: false });
    expect(p.at(-1)).toBe(2 * 20 + 17);
    for (const i of p) expect(grid.blocked[i]).toBe(0);
    expect(p.some((i) => Math.floor(i / 20) >= 15)).toBe(true);
    const wp = smoothPath(grid, 2.5, 2.5, p);
    expect(wp.length).toBeLessThan(p.length * 2);
  });

  it('goes as close as possible when the goal is unreachable', () => {
    const m = emptyMap(20, 20);
    for (let y = 0; y < 20; y++) m.tiles[y * 20 + 10] = Terrain.Water;
    const grid = new Grid(m);
    const p = new Pathfinder(grid).find(2, 5, { x0: 15, y0: 5, x1: 15, y1: 5, adjacent: false });
    expect(p.at(-1)! % 20).toBe(9);
  });

  it('reaches a tile adjacent to a rect goal', () => {
    const grid = new Grid(emptyMap(20, 20));
    const p = new Pathfinder(grid).find(1, 1, { x0: 10, y0: 10, x1: 11, y1: 11, adjacent: true });
    const last = p.at(-1)!;
    const x = last % 20;
    const y = Math.floor(last / 20);
    expect(x >= 9 && x <= 12 && y >= 9 && y <= 12).toBe(true);
  });
});

describe('movement', () => {
  it('moves a group to a distant point without overlapping', () => {
    const sim = newSim(5, 48);
    const w = sim.world;
    const s0 = w.map.starts[0]!;
    // Add a sizeable army.
    for (let i = 0; i < 30; i++)
      spawnUnit(
        w,
        0,
        'shieldbrother',
        s0.x + 2 + (i % 6) * 0.5,
        s0.y + 3 + Math.floor(i / 6) * 0.5,
      );
    const army = unitsOf(sim, 0, 'shieldbrother');
    const ti = w.grid.nearestWalkable(w.map.width / 2, w.map.height / 2);
    const target = { x: (ti % w.grid.w) + 0.5, y: Math.floor(ti / w.grid.w) + 0.5 };
    sim.enqueue({ type: 'move', player: 0, ids: army.map((u) => u.id), x: target.x, y: target.y });
    run(sim, 20 * 40);
    for (const u of army) {
      expect(Math.hypot(u.x - target.x, u.y - target.y)).toBeLessThan(6.5);
      expect(w.grid.isBlocked(Math.floor(u.x), Math.floor(u.y))).toBe(false);
      expect(u.order.type).toBe('idle');
    }
    let overlaps = 0;
    for (let i = 0; i < army.length; i++)
      for (let j = i + 1; j < army.length; j++) {
        if (Math.hypot(army[i]!.x - army[j]!.x, army[i]!.y - army[j]!.y) < 0.3) overlaps++;
      }
    expect(overlaps).toBe(0);
  });

  it('a single unit follows the path to the exact point', () => {
    const sim = newSim(9, 48);
    const u = unitsOf(sim, 0)[0]!;
    const tx = u.x + 4.25;
    const ty = u.y + 0.5;
    sim.enqueue({ type: 'move', player: 0, ids: [u.id], x: tx, y: ty });
    run(sim, 100);
    if (!sim.world.grid.isBlocked(Math.floor(tx), Math.floor(ty))) {
      expect(Math.hypot(u.x - tx, u.y - ty)).toBeLessThan(0.4);
    }
  });
});
