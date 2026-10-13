import { buildingDef, unitDef } from '../../data';
import { RULES } from '../../data/balance/rules';
import { statOf, type World } from '../world';

/** Precomputed disc offsets per radius (tiles), shared by all fog stamps. */
const discCache = new Map<number, Int16Array>();
function disc(r: number): Int16Array {
  const key = Math.round(r * 2) / 2;
  let d = discCache.get(key);
  if (d) return d;
  const pts: number[] = [];
  const R = Math.ceil(key);
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) if (x * x + y * y <= key * key + 0.5) pts.push(x, y);
  d = Int16Array.from(pts);
  discCache.set(key, d);
  return d;
}

function stamp(fog: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): void {
  const d = disc(r);
  const fx = Math.floor(cx);
  const fy = Math.floor(cy);
  for (let k = 0; k < d.length; k += 2) {
    const x = fx + (d[k] as number);
    const y = fy + (d[k + 1] as number);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    fog[y * w + x] = 2;
  }
}

/** Recompute visibility every few ticks: visible -> explored, then stamp each sight circle. */
export function fogSystem(world: World): void {
  if (world.tick % RULES.fogInterval !== 0) return;
  updateFog(world);
}

export function updateFog(world: World): void {
  const w = world.map.width;
  const h = world.map.height;
  for (let p = 0; p < world.fog.length; p++) {
    const fog = world.fog[p]!;
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
  }
  for (const e of world.entities) {
    if (e.dead || e.owner < 0) continue;
    const fog = world.fog[e.owner];
    if (!fog) continue;
    const base = e.kind === 'unit' ? unitDef(e.def).sight : buildingDef(e.def).sight;
    const sight = e.kind === 'building' && !e.built ? 2 : statOf(world, e, 'sight', base);
    stamp(fog, w, h, e.x, e.y, sight + (e.kind === 'building' ? e.size / 2 : 0));
  }
  for (const fx of world.effects) {
    if (fx.kind !== 'reveal' || fx.until <= world.tick) continue;
    const fog = world.fog[fx.owner];
    if (fog) stamp(fog, w, h, fx.x, fx.y, fx.radius);
  }
}
