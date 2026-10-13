import type { Entity } from './entity';

/**
 * Uniform-grid spatial hash for units, rebuilt every tick with zero allocations
 * (intrusive linked lists in typed arrays). Queries return entities via a reusable buffer.
 */
export class SpatialHash {
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly head: Int32Array;
  private next: Int32Array;
  private items: Entity[] = [];
  /** Shared result buffer; valid until the next query. */
  readonly result: Entity[] = [];

  constructor(width: number, height: number, cellSize = 2) {
    this.cell = cellSize;
    this.cols = Math.ceil(width / cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
    this.head = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(256);
  }

  rebuild(entities: readonly Entity[]): void {
    this.head.fill(-1);
    this.items = entities as Entity[];
    if (this.next.length < entities.length) this.next = new Int32Array(entities.length * 2);
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i] as Entity;
      if (e.dead || e.kind !== 'unit' || e.inside >= 0) continue;
      const c = this.cellIndex(e.x, e.y);
      this.next[i] = this.head[c] as number;
      this.head[c] = i;
    }
  }

  private cellIndex(x: number, y: number): number {
    let cx = Math.floor(x / this.cell);
    let cy = Math.floor(y / this.cell);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  /** Units whose centre lies within `r` of (x, y). Results in `this.result`. */
  query(x: number, y: number, r: number): Entity[] {
    const out = this.result;
    out.length = 0;
    const c0x = Math.max(0, Math.floor((x - r) / this.cell));
    const c1x = Math.min(this.cols - 1, Math.floor((x + r) / this.cell));
    const c0y = Math.max(0, Math.floor((y - r) / this.cell));
    const c1y = Math.min(this.rows - 1, Math.floor((y + r) / this.cell));
    const r2 = r * r;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        let i = this.head[cy * this.cols + cx] as number;
        while (i !== -1) {
          const e = this.items[i] as Entity;
          if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) out.push(e);
          i = this.next[i] as number;
        }
      }
    }
    // Order is deterministic: fixed cell scan order, lists built from the entity array order.
    return out;
  }
}
