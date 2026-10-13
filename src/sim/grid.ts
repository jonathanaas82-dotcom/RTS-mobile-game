import type { Entity } from './entity';
import type { GameMap } from './map/mapgen';
import { Terrain, isWalkable } from './map/terrain';

/**
 * Tile occupancy for pathfinding and placement.
 * - `blocked[i]` = 1 if land units cannot stand on tile i (terrain or a solid footprint).
 * - `occupant[i]` = id of the building/resource covering tile i, or 0.
 * `version` increments on every change so cached paths can be invalidated.
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly blocked: Uint8Array;
  readonly occupant: Int32Array;
  version = 0;
  private readonly map: GameMap;

  constructor(map: GameMap) {
    this.map = map;
    this.w = map.width;
    this.h = map.height;
    this.blocked = new Uint8Array(this.w * this.h);
    this.occupant = new Int32Array(this.w * this.h);
    for (let i = 0; i < this.blocked.length; i++) {
      this.blocked[i] = isWalkable(map.tiles[i] as number) ? 0 : 1;
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  isBlocked(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.blocked[y * this.w + x] === 1;
  }

  /** Mark a building/resource footprint. Walkable buildings (farms) only set the occupant. */
  stamp(e: Entity, solid: boolean): void {
    for (let y = e.tileY; y < e.tileY + e.size; y++) {
      for (let x = e.tileX; x < e.tileX + e.size; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = y * this.w + x;
        this.occupant[i] = e.id;
        if (solid) this.blocked[i] = 1;
      }
    }
    this.version++;
  }

  unstamp(e: Entity): void {
    for (let y = e.tileY; y < e.tileY + e.size; y++) {
      for (let x = e.tileX; x < e.tileX + e.size; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = y * this.w + x;
        if (this.occupant[i] !== e.id) continue;
        this.occupant[i] = 0;
        this.blocked[i] = isWalkable(this.map.tiles[i] as number) ? 0 : 1;
      }
    }
    this.version++;
  }

  /** A forest tile was cleared. */
  clearForest(i: number): void {
    this.map.tiles[i] = Terrain.Grass;
    this.map.wood[i] = 0;
    if (this.occupant[i] === 0) this.blocked[i] = 0;
    this.version++;
  }

  /** Can a building of `size` be placed with its top-left at (tx, ty)? */
  canPlace(tx: number, ty: number, size: number): boolean {
    for (let y = ty; y < ty + size; y++) {
      for (let x = tx; x < tx + size; x++) {
        if (!this.inBounds(x, y)) return false;
        const i = y * this.w + x;
        if (this.blocked[i] || this.occupant[i] !== 0) return false;
        const t = this.map.tiles[i] as number;
        if (t !== Terrain.Grass && t !== Terrain.Sand) return false;
      }
    }
    return true;
  }

  /**
   * Nearest walkable tile to (x, y) searching outward in rings (deterministic order).
   * Returns the tile index or -1.
   */
  nearestWalkable(x: number, y: number, maxR = 12): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (!this.isBlocked(cx, cy)) return cy * this.w + cx;
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.isBlocked(nx, ny)) continue;
          const d = (nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = ny * this.w + nx;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
}
