import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';

/** The local player's current selection and control groups. Pure logic (no rendering). */
export class Selection {
  readonly ids = new Set<number>();
  readonly groups: number[][] = [[], [], [], [], []];
  /** Bumped on every change so UI can cheaply detect updates. */
  version = 0;

  set(ids: Iterable<number>): void {
    this.ids.clear();
    for (const id of ids) this.ids.add(id);
    this.version++;
  }

  clear(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
    this.version++;
  }

  /** Drop dead/missing entities. */
  prune(world: World): void {
    let changed = false;
    for (const id of this.ids) {
      const e = world.byId.get(id);
      if (!e || e.dead) {
        this.ids.delete(id);
        changed = true;
      }
    }
    if (changed) this.version++;
    for (const g of this.groups) {
      for (let i = g.length - 1; i >= 0; i--) {
        const e = world.byId.get(g[i] as number);
        if (!e || e.dead) g.splice(i, 1);
      }
    }
  }

  entities(world: World): Entity[] {
    const out: Entity[] = [];
    for (const id of this.ids) {
      const e = world.byId.get(id);
      if (e && !e.dead) out.push(e);
    }
    return out;
  }

  /** Own units in the selection. */
  ownUnits(world: World, me: number): Entity[] {
    return this.entities(world).filter((e) => e.owner === me && e.kind === 'unit');
  }

  assignGroup(i: number): void {
    this.groups[i] = [...this.ids];
  }

  recallGroup(i: number): boolean {
    const g = this.groups[i];
    if (!g || g.length === 0) return false;
    this.set(g);
    return true;
  }
}

/**
 * Find the entity under a world point (tile coords). Units win over buildings; among units the
 * nearest centre within its radius + `slop` wins. `slop` is the finger tolerance in tiles.
 */
export function pickEntity(
  world: World,
  x: number,
  y: number,
  slop: number,
  visible: (e: Entity) => boolean,
): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of world.entities) {
    if (e.dead || e.kind !== 'unit' || !visible(e)) continue;
    // Units are drawn standing on their position; also accept taps on the body above the feet.
    const dy = y - (e.y - e.radius * 0.8);
    const d = Math.sqrt((x - e.x) ** 2 + dy * dy) - e.radius;
    if (d < slop && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) return best;
  for (const e of world.entities) {
    if (e.dead || e.kind === 'unit' || !visible(e)) continue;
    const pad = Math.min(slop, 0.4);
    if (
      x >= e.tileX - pad &&
      x <= e.tileX + e.size + pad &&
      y >= e.tileY - pad &&
      y <= e.tileY + e.size + pad
    )
      return e;
  }
  return null;
}

/** Own units inside a world-space rectangle. Military is preferred over workers. */
export function unitsInRect(
  world: World,
  me: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Entity[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const inside = world.entities.filter(
    (e) =>
      !e.dead &&
      e.kind === 'unit' &&
      e.owner === me &&
      e.x >= minX &&
      e.x <= maxX &&
      e.y >= minY &&
      e.y <= maxY,
  );
  const military = inside.filter((e) => e.cls !== 'worker');
  return military.length > 0 ? military : inside;
}
