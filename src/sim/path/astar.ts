import type { Grid } from '../grid';

/** Goal of a path search: a single tile, or "next to" a rectangle (building/resource). */
export interface PathGoal {
  x0: number;
  y0: number;
  /** Inclusive bounds. For a point goal x0 = x1, y0 = y1. */
  x1: number;
  y1: number;
  /** If true, reaching any tile adjacent to (or inside, if walkable) the rect succeeds. */
  adjacent: boolean;
}

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * A* on the tile grid (8-directional, no corner cutting) with octile heuristic.
 * All buffers are allocated once and reused via a generation counter, so searches don't allocate
 * besides the returned path. If the goal is unreachable the path leads to the closest reachable
 * tile, which is what RTS players expect ("go as close as you can").
 */
export class Pathfinder {
  private readonly grid: Grid;
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  private readonly openGen: Uint32Array;
  private readonly closedGen: Uint32Array;
  private gen = 0;
  // Binary heap of node indices keyed by f.
  private heap: Int32Array;
  private heapF: Float64Array;
  private heapSize = 0;
  /** Expanded node budget per search. */
  maxExpand = 3000;
  /** Stats for the debug overlay / tests. */
  lastExpanded = 0;
  /** Whether the last search reached its goal (false = partial path to the closest tile). */
  lastFound = false;

  constructor(grid: Grid) {
    this.grid = grid;
    const n = grid.w * grid.h;
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.openGen = new Uint32Array(n);
    this.closedGen = new Uint32Array(n);
    this.heap = new Int32Array(n);
    this.heapF = new Float64Array(n);
  }

  /**
   * Returns tile indices from the tile after start to the goal (empty if already there).
   */
  find(sx: number, sy: number, goal: PathGoal): number[] {
    const grid = this.grid;
    const w = grid.w;
    this.gen++;
    if (this.gen === 0xffffffff) {
      this.openGen.fill(0);
      this.closedGen.fill(0);
      this.gen = 1;
    }
    const gen = this.gen;
    sx = Math.min(w - 1, Math.max(0, Math.floor(sx)));
    sy = Math.min(grid.h - 1, Math.max(0, Math.floor(sy)));
    const start = sy * w + sx;
    this.heapSize = 0;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.openGen[start] = gen;
    this.push(start, this.h(sx, sy, goal));

    let best = start;
    let bestH = this.h(sx, sy, goal);
    let expanded = 0;
    let found = -1;

    while (this.heapSize > 0 && expanded < this.maxExpand) {
      const cur = this.pop();
      if (this.closedGen[cur] === gen) continue;
      this.closedGen[cur] = gen;
      expanded++;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      if (this.isGoal(cx, cy, goal)) {
        found = cur;
        break;
      }
      const hc = this.h(cx, cy, goal);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      const gc = this.g[cur] as number;
      for (let d = 0; d < 8; d++) {
        const nx = cx + (DX[d] as number);
        const ny = cy + (DY[d] as number);
        if (grid.isBlocked(nx, ny)) continue;
        if (
          d >= 4 &&
          (grid.isBlocked(cx + (DX[d] as number), cy) || grid.isBlocked(cx, cy + (DY[d] as number)))
        ) {
          continue; // no squeezing diagonally between two blocked tiles
        }
        const ni = ny * w + nx;
        if (this.closedGen[ni] === gen) continue;
        const ng = gc + (d >= 4 ? SQRT2 : 1);
        if (this.openGen[ni] === gen && ng >= (this.g[ni] as number)) continue;
        this.openGen[ni] = gen;
        this.g[ni] = ng;
        this.parent[ni] = cur;
        this.push(ni, ng + this.h(nx, ny, goal) * 1.001);
      }
    }
    this.lastExpanded = expanded;
    this.lastFound = found >= 0;
    const end = found >= 0 ? found : best;
    const path: number[] = [];
    for (let i = end; i !== start && i !== -1; i = this.parent[i] as number) path.push(i);
    path.reverse();
    return path;
  }

  private isGoal(x: number, y: number, g: PathGoal): boolean {
    if (!g.adjacent) return x === g.x0 && y === g.y0;
    return x >= g.x0 - 1 && x <= g.x1 + 1 && y >= g.y0 - 1 && y <= g.y1 + 1;
  }

  /** Octile distance to the goal rect (expanded by 1 for adjacency goals). */
  private h(x: number, y: number, g: PathGoal): number {
    const pad = g.adjacent ? 1 : 0;
    const dx = x < g.x0 - pad ? g.x0 - pad - x : x > g.x1 + pad ? x - g.x1 - pad : 0;
    const dy = y < g.y0 - pad ? g.y0 - pad - y : y > g.y1 + pad ? y - g.y1 - pad : 0;
    const mn = dx < dy ? dx : dy;
    const mx = dx < dy ? dy : dx;
    return mx + (SQRT2 - 1) * mn;
  }

  private push(i: number, f: number): void {
    let k = this.heapSize++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if ((this.heapF[p] as number) <= f) break;
      this.heap[k] = this.heap[p] as number;
      this.heapF[k] = this.heapF[p] as number;
      k = p;
    }
    this.heap[k] = i;
    this.heapF[k] = f;
  }

  private pop(): number {
    const top = this.heap[0] as number;
    const n = --this.heapSize;
    const li = this.heap[n] as number;
    const lf = this.heapF[n] as number;
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && (this.heapF[c + 1] as number) < (this.heapF[c] as number)) c++;
      if ((this.heapF[c] as number) >= lf) break;
      this.heap[k] = this.heap[c] as number;
      this.heapF[k] = this.heapF[c] as number;
      k = c;
    }
    this.heap[k] = li;
    this.heapF[k] = lf;
    return top;
  }
}

/**
 * Line-of-walk check between two points in tile space: samples the segment densely enough that
 * a unit following it never enters a blocked tile.
 */
export function walkable(grid: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len * 4);
  // Check a slightly widened corridor (unit body) by testing offsets perpendicular to the line.
  const nx = len > 0 ? (-dy / len) * 0.3 : 0;
  const ny = len > 0 ? (dx / len) * 0.3 : 0;
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    if (grid.isBlocked(Math.floor(x), Math.floor(y))) return false;
    if (grid.isBlocked(Math.floor(x + nx), Math.floor(y + ny))) return false;
    if (grid.isBlocked(Math.floor(x - nx), Math.floor(y - ny))) return false;
  }
  return true;
}

/**
 * Turn a tile path into a short list of waypoints (flattened x,y pairs, tile centres) by
 * skipping intermediate tiles while a straight walk is possible ("string pulling").
 */
export function smoothPath(
  grid: Grid,
  fromX: number,
  fromY: number,
  tiles: number[],
  endX?: number,
  endY?: number,
): number[] {
  const w = grid.w;
  const pts: number[] = [];
  for (const i of tiles) {
    const x = i % w;
    pts.push(x + 0.5, (i - x) / w + 0.5);
  }
  if (endX !== undefined && endY !== undefined && pts.length >= 2) {
    // Replace the final tile centre with the exact requested point when it lies in that tile.
    const lx = pts[pts.length - 2] as number;
    const ly = pts[pts.length - 1] as number;
    if (Math.floor(endX) === Math.floor(lx) && Math.floor(endY) === Math.floor(ly)) {
      pts[pts.length - 2] = endX;
      pts[pts.length - 1] = endY;
    }
  }
  const out: number[] = [];
  let cx = fromX;
  let cy = fromY;
  let i = 0;
  const n = pts.length / 2;
  while (i < n) {
    // Greedily extend while the next point is still directly walkable (linear in path length).
    let j = i;
    while (
      j + 1 < n &&
      walkable(grid, cx, cy, pts[(j + 1) * 2] as number, pts[(j + 1) * 2 + 1] as number)
    )
      j++;
    cx = pts[j * 2] as number;
    cy = pts[j * 2 + 1] as number;
    out.push(cx, cy);
    i = j + 1;
  }
  return out;
}
