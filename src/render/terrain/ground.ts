import type { GameMap } from '../../sim/map/mapgen';
import { Terrain } from '../../sim/map/terrain';
import { tileHash, valueNoise } from '../../sim/map/noise';

/**
 * Paints the whole map's ground into canvas chunks: terrain types are blended through smooth,
 * noise-perturbed fields so shores, beaches, forest floor and cliffs get organic outlines instead
 * of square tiles. Pure canvas code (no Phaser), deterministic per map seed.
 */
export const GROUND_PX = 32; // canvas pixels per tile (displayed scaled to the world tile size)
export const CHUNK_TILES = 16;

type RGB = [number, number, number];

const C = {
  grassLush: [54, 112, 46] as RGB,
  grassMeadow: [108, 154, 62] as RGB,
  grassDry: [160, 156, 78] as RGB,
  grassCool: [46, 104, 72] as RGB,
  grassWarm: [134, 160, 64] as RGB,
  highland: [114, 134, 70] as RGB,
  earth: [138, 112, 78] as RGB,
  earthLight: [164, 138, 98] as RGB,
  forestFloor: [46, 78, 36] as RGB,
  leafLitter: [92, 86, 44] as RGB,
  sand: [226, 204, 150] as RGB,
  sandDark: [196, 172, 122] as RGB,
  wetSand: [176, 152, 106] as RGB,
  shallow: [84, 182, 176] as RGB,
  midWater: [38, 128, 156] as RGB,
  deep: [20, 62, 112] as RGB,
  foam: [236, 246, 242] as RGB,
  rockLight: [196, 182, 158] as RGB,
  rockDark: [118, 106, 92] as RGB,
  rockFace: [112, 94, 78] as RGB,
  moss: [96, 136, 62] as RGB,
};

/** Side of the tileable painterly brush pattern (power of two). */
const BRUSH = 256;
let brushCache: Float32Array | null = null;

/**
 * A tileable field of short, curved brush strokes (values about -1..1): multiplied into the
 * ground colours it gives grass a hand-painted, blade-like texture instead of smooth noise.
 * Painted once with canvas strokes and read back.
 */
function brushPattern(): Float32Array {
  if (brushCache) return brushCache;
  const cv = document.createElement('canvas');
  cv.width = cv.height = BRUSH;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgb(128,128,128)';
  c.fillRect(0, 0, BRUSH, BRUSH);
  let s = 0x2f6e2b1;
  const rnd = (): number => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9;
    s ^= s >>> 12;
    return (s >>> 0) / 4294967296;
  };
  c.lineCap = 'round';
  // Broad soft dabs first (painterly patches), then blades on top.
  for (let i = 0; i < 260; i++) {
    const x = rnd() * BRUSH;
    const y = rnd() * BRUSH;
    const g = 100 + rnd() * 56;
    const rx = 5 + rnd() * 9;
    const ry = rx * (0.4 + rnd() * 0.3);
    const a = (rnd() - 0.5) * 0.9;
    c.fillStyle = `rgba(${g},${g},${g},0.35)`;
    for (const ox of [-BRUSH, 0, BRUSH])
      for (const oy of [-BRUSH, 0, BRUSH]) {
        if (Math.abs(x + ox - BRUSH / 2) > BRUSH / 2 + 16) continue;
        if (Math.abs(y + oy - BRUSH / 2) > BRUSH / 2 + 16) continue;
        c.beginPath();
        c.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2);
        c.fill();
      }
  }
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * BRUSH;
    const y = rnd() * BRUSH;
    const len = 2.5 + rnd() * 5;
    const lean = (rnd() - 0.5) * 2.4;
    const light = rnd() < 0.5;
    const g = light ? 150 + rnd() * 70 : 40 + rnd() * 60;
    c.strokeStyle = `rgba(${g},${g},${g},${light ? 0.5 : 0.55})`;
    c.lineWidth = 0.8 + rnd() * 0.9;
    for (const ox of [-BRUSH, 0, BRUSH])
      for (const oy of [-BRUSH, 0, BRUSH]) {
        if (Math.abs(x + ox - BRUSH / 2) > BRUSH / 2 + 8) continue;
        if (Math.abs(y + oy - BRUSH / 2) > BRUSH / 2 + 8) continue;
        c.beginPath();
        c.moveTo(x + ox, y + oy);
        c.quadraticCurveTo(x + ox + lean * 0.2, y + oy - len * 0.6, x + ox + lean, y + oy - len);
        c.stroke();
      }
  }
  const d = c.getImageData(0, 0, BRUSH, BRUSH).data;
  const out = new Float32Array(BRUSH * BRUSH);
  for (let i = 0; i < out.length; i++) out[i] = ((d[i * 4] as number) - 128) / 100;
  brushCache = out;
  return out;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Per-tile 0/1 indicator field sampled bilinearly between tile centres. */
/** In-place separable [1 2 1] blur: softens the per-tile step pattern before sampling. */
export function blur121(v: Float32Array, w: number, h: number): void {
  const tmp = new Float32Array(v.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = v[x > 0 ? i - 1 : i] as number;
      const r = v[x < w - 1 ? i + 1 : i] as number;
      tmp[i] = (l + 2 * (v[i] as number) + r) / 4;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = tmp[y > 0 ? i - w : i] as number;
      const d = tmp[y < h - 1 ? i + w : i] as number;
      v[i] = (u + 2 * (tmp[i] as number) + d) / 4;
    }
  }
}

class Field {
  constructor(
    private readonly v: Float32Array,
    private readonly w: number,
    private readonly h: number,
  ) {}

  static from(map: GameMap, pred: (t: number) => boolean): Field {
    const v = new Float32Array(map.width * map.height);
    for (let i = 0; i < v.length; i++) v[i] = pred(map.tiles[i] as number) ? 1 : 0;
    blur121(v, map.width, map.height);
    return new Field(v, map.width, map.height);
  }

  at(u: number, v: number): number {
    const x = Math.min(this.w - 1.001, Math.max(0, u - 0.5));
    const y = Math.min(this.h - 1.001, Math.max(0, v - 0.5));
    const x0 = x | 0;
    const y0 = y | 0;
    // Smoothstep weights round off the diamond artefacts of plain bilinear sampling.
    let fx = x - x0;
    let fy = y - y0;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const i = y0 * this.w + x0;
    const a = this.v[i] as number;
    const b = this.v[i + 1] as number;
    const c = this.v[i + this.w] as number;
    const d = this.v[i + this.w + 1] as number;
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
}

/** Precomputed noise lattice sampled bilinearly (fast per-pixel noise). */
class NoiseGrid {
  private readonly v: Float32Array;
  private readonly gw: number;
  private readonly gh: number;
  constructor(
    w: number,
    h: number,
    private readonly perTile: number,
    seed: number,
    scales: Array<[number, number]>,
  ) {
    this.gw = w * perTile + 2;
    this.gh = h * perTile + 2;
    this.v = new Float32Array(this.gw * this.gh);
    let norm = 0;
    for (const [, amp] of scales) norm += amp;
    for (let y = 0; y < this.gh; y++) {
      for (let x = 0; x < this.gw; x++) {
        let s = 0;
        scales.forEach(([scale, amp], k) => {
          s += valueNoise(x / perTile / scale, y / perTile / scale, seed + k * 977) * amp;
        });
        this.v[y * this.gw + x] = s / norm;
      }
    }
  }

  at(u: number, v: number): number {
    const x = Math.min(this.gw - 1.001, Math.max(0, u * this.perTile));
    const y = Math.min(this.gh - 1.001, Math.max(0, v * this.perTile));
    const x0 = x | 0;
    const y0 = y | 0;
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * this.gw + x0;
    const a = this.v[i] as number;
    const b = this.v[i + 1] as number;
    const c = this.v[i + this.gw] as number;
    const d = this.v[i + this.gw + 1] as number;
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
}

/**
 * Each chunk canvas carries this many extra pixels on every side (painted from the neighbouring
 * area) and is cropped back when displayed, so linear filtering leaves no seams between chunks.
 */
export const GROUND_PAD = 1;

export interface GroundChunk {
  /** Chunk origin in tiles. */
  tx: number;
  ty: number;
  canvas: HTMLCanvasElement;
  /**
   * Two water-only ripple layers (half resolution, transparent elsewhere) that the renderer
   * drifts and cross-fades for moving water; null when the chunk has no water.
   */
  waves: [WaveLayer, WaveLayer] | null;
}

/** A water ripple layer cropped to the water in its chunk; `x`, `y` = offset in tiles. */
export interface WaveLayer {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

/** Values on a lattice (`perTile` samples per tile) computed once and sampled bilinearly. */
class FnGrid {
  private readonly v: Float32Array;
  private readonly gw: number;
  private readonly gh: number;
  constructor(
    w: number,
    h: number,
    private readonly perTile: number,
    fn: (u: number, v: number) => number,
  ) {
    this.gw = w * perTile + 2;
    this.gh = h * perTile + 2;
    this.v = new Float32Array(this.gw * this.gh);
    for (let y = 0; y < this.gh; y++)
      for (let x = 0; x < this.gw; x++) this.v[y * this.gw + x] = fn(x / perTile, y / perTile);
  }

  at(u: number, v: number): number {
    const x = Math.min(this.gw - 1.001, Math.max(0, u * this.perTile));
    const y = Math.min(this.gh - 1.001, Math.max(0, v * this.perTile));
    const x0 = x | 0;
    const y0 = y | 0;
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * this.gw + x0;
    const a = this.v[i] as number;
    const b = this.v[i + 1] as number;
    const c = this.v[i + this.gw] as number;
    const d = this.v[i + this.gw + 1] as number;
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
}

/** Like FnGrid, but for RGB colours. */
class RGBGrid {
  private readonly v: Float32Array;
  private readonly gw: number;
  private readonly gh: number;
  constructor(
    w: number,
    h: number,
    private readonly perTile: number,
    fn: (u: number, v: number, o: { r: number; g: number; b: number }) => void,
  ) {
    this.gw = w * perTile + 2;
    this.gh = h * perTile + 2;
    this.v = new Float32Array(this.gw * this.gh * 3);
    const o = { r: 0, g: 0, b: 0 };
    for (let y = 0; y < this.gh; y++)
      for (let x = 0; x < this.gw; x++) {
        fn(x / perTile, y / perTile, o);
        const i = (y * this.gw + x) * 3;
        this.v[i] = o.r;
        this.v[i + 1] = o.g;
        this.v[i + 2] = o.b;
      }
  }

  at(u: number, v: number, out: { r: number; g: number; b: number }): void {
    const x = Math.min(this.gw - 1.001, Math.max(0, u * this.perTile));
    const y = Math.min(this.gh - 1.001, Math.max(0, v * this.perTile));
    const x0 = x | 0;
    const y0 = y | 0;
    const fx = x - x0;
    const fy = y - y0;
    const a = (y0 * this.gw + x0) * 3;
    const c = a + this.gw * 3;
    const d = this.v;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    out.r =
      (d[a] as number) * w00 +
      (d[a + 3] as number) * w10 +
      (d[c] as number) * w01 +
      (d[c + 3] as number) * w11;
    out.g =
      (d[a + 1] as number) * w00 +
      (d[a + 4] as number) * w10 +
      (d[c + 1] as number) * w01 +
      (d[c + 4] as number) * w11;
    out.b =
      (d[a + 2] as number) * w00 +
      (d[a + 5] as number) * w10 +
      (d[c + 2] as number) * w01 +
      (d[c + 5] as number) * w11;
  }
}

export function paintGround(map: GameMap): GroundChunk[] {
  const w = map.width;
  const h = map.height;
  const water = Field.from(map, (t) => t === Terrain.Water);
  const sand = Field.from(map, (t) => t === Terrain.Sand);
  const cliff = Field.from(map, (t) => t === Terrain.Cliff);
  const forest = Field.from(map, (t) => t === Terrain.Forest);
  const seed = map.seed | 0;
  const edge = new NoiseGrid(w, h, 3, seed ^ 0x1234, [
    [1.4, 1],
    [0.6, 0.35],
  ]);
  const color = new NoiseGrid(w, h, 1, seed ^ 0x9876, [
    [7, 1],
    [2.5, 0.6],
  ]);
  const moist = new NoiseGrid(w, h, 1, seed ^ 0x5151, [
    [5, 1],
    [1.8, 0.4],
  ]);
  // Fine texture: clumps of lighter/darker grass and soil grain.
  const detail = new NoiseGrid(w, h, 6, seed ^ 0x7777, [
    [0.4, 1],
    [0.16, 0.6],
  ]);
  // Medium-scale clumps: tall dark grass tussocks and sun-bleached patches.
  const clump = new NoiseGrid(w, h, 3, seed ^ 0x6a6a, [
    [1.1, 1],
    [0.45, 0.45],
  ]);
  // Base grass colour (moisture, dryness, cool/warm patches, tussocks, sunny clearings) depends
  // only on smooth fields, so it is computed on a lattice and sampled bilinearly per pixel.
  const grass = new RGBGrid(w, h, 3, (u, v, o) => {
    const mo = moist.at(u, v);
    const col = color.at(u, v);
    const cl = clump.at(u, v);
    o.r = C.grassMeadow[0];
    o.g = C.grassMeadow[1];
    o.b = C.grassMeadow[2];
    const mix = (c: RGB, t: number): void => {
      o.r += (c[0] - o.r) * t;
      o.g += (c[1] - o.g) * t;
      o.b += (c[2] - o.b) * t;
    };
    mix(C.grassLush, smooth(0.35, 0.7, mo));
    mix(C.grassDry, smooth(0.6, 0.85, col) * (1 - smooth(0.4, 0.7, mo)) * 0.7);
    mix(C.grassCool, smooth(0.5, 0.25, col) * 0.35);
    mix(C.grassWarm, smooth(0.55, 0.8, col) * smooth(0.3, 0.6, mo) * 0.35);
    const tall = smooth(0.6, 0.72, cl);
    o.r *= 1 - tall * 0.2;
    o.g *= 1 - tall * 0.12;
    o.b *= 1 - tall * 0.1;
    mix(C.grassWarm, smooth(0.36, 0.26, cl) * (1 - smooth(0.5, 0.75, mo)) * 0.3);
  });
  // Rolling height: lit from the north-west, giving gentle hills and hollows.
  const height = new NoiseGrid(w, h, 2, seed ^ 0x2468, [
    [8, 1],
    [3, 0.5],
    [1.2, 0.18],
  ]);
  const e = 0.35;
  const shadeGrid = new FnGrid(w, h, 3, (u, v) => {
    const gx = (height.at(u + e, v) - height.at(u - e, v)) / (2 * e);
    const gy = (height.at(u, v + e) - height.at(u, v - e)) / (2 * e);
    return Math.max(-1, Math.min(1, -(gx + gy) * 4.2));
  });
  // Worn, trampled earth around each base, with a ragged edge.
  const plaza = new FnGrid(w, h, 2, (u, v) => {
    let best = 99;
    for (const st of map.starts) best = Math.min(best, Math.hypot(u - st.x, v - st.y));
    const n = valueNoise(u / 1.7, v / 1.7, seed ^ 0x3131) * 2.4;
    return 1 - smooth(3.2, 5.6, best + n - 1.2);
  });
  // Footpaths worn from each base out to its nearby gold mines and berry patches; they wander a
  // little (noise-displaced) and only show on open grass.
  const segs: Array<[number, number, number, number]> = [];
  for (const st of map.starts)
    for (const f of map.features) {
      if (f.kind === 'fish') continue;
      const o = f.kind === 'gold' ? 1 : 0.5;
      const d = Math.hypot(f.x + o - st.x, f.y + o - st.y);
      if (d > 4 && d < 15) segs.push([st.x + 0.5, st.y + 0.5, f.x + o, f.y + o]);
    }
  const path = new FnGrid(w, h, 3, (u, v) => {
    const pu = u + (valueNoise(u / 2.2, v / 2.2, seed ^ 0x7a7a) - 0.5) * 1.4;
    const pv = v + (valueNoise(u / 2.2, v / 2.2, seed ^ 0x7b7b) - 0.5) * 1.4;
    let best = 9;
    for (const [x0, y0, x1, y1] of segs) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((pu - x0) * dx + (pv - y0) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(pu - x0 - dx * t, pv - y0 - dy * t));
    }
    return 1 - smooth(0.1, 0.38, best);
  });
  // Tiles within 2 of a cliff / water / sand / forest: elsewhere those layers are skipped.
  const near = (pred: (t: number) => boolean, r = 2): Uint8Array => {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!pred(map.tiles[y * w + x] as number)) continue;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) m[ny * w + nx] = 1;
          }
      }
    return m;
  };
  const nearCliff = near((t) => t === Terrain.Cliff, 3);
  const nearWater = near((t) => t === Terrain.Water || t === Terrain.Sand);
  const nearForest = near((t) => t === Terrain.Forest);
  const nearBase = near(() => false);
  for (const st of map.starts)
    for (let y = st.y - 8; y <= st.y + 8; y++)
      for (let x = st.x - 8; x <= st.x + 8; x++)
        if (x >= 0 && y >= 0 && x < w && y < h) nearBase[y * w + x] = 1;
  // Tiles a footpath can reach (its wander is at most ~1.2 tiles off the straight line).
  const nearPath = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of segs) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let k = 0; k <= n; k++) {
      const px = x0 + ((x1 - x0) * k) / n;
      const py = y0 + ((y1 - y0) * k) / n;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const tx = Math.floor(px) + dx;
          const ty = Math.floor(py) + dy;
          if (tx >= 0 && ty >= 0 && tx < w && ty < h) nearPath[ty * w + tx] = 1;
        }
    }
  }
  const P = GROUND_PX;
  const brush = brushPattern();
  const chunks: GroundChunk[] = [];
  const out = { r: 0, g: 0, b: 0 };
  const mixInto = (c: RGB, t: number): void => {
    out.r += (c[0] - out.r) * t;
    out.g += (c[1] - out.g) * t;
    out.b += (c[2] - out.b) * t;
  };
  for (let cy = 0; cy < h; cy += CHUNK_TILES) {
    for (let cx = 0; cx < w; cx += CHUNK_TILES) {
      const tw = Math.min(CHUNK_TILES, w - cx);
      const th = Math.min(CHUNK_TILES, h - cy);
      const canvas = document.createElement('canvas');
      canvas.width = tw * P + 2 * GROUND_PAD;
      canvas.height = th * P + 2 * GROUND_PAD;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(canvas.width, canvas.height);
      const px = img.data;
      for (let py = 0; py < canvas.height; py++) {
        const v = cy + (py - GROUND_PAD + 0.5) / P;
        for (let pxx = 0; pxx < canvas.width; pxx++) {
          const u = cx + (pxx - GROUND_PAD + 0.5) / P;
          const ti =
            Math.min(h - 1, Math.max(0, Math.floor(v))) * w +
            Math.min(w - 1, Math.max(0, Math.floor(u)));
          const n = edge.at(u, v) - 0.5;
          const col = color.at(u, v);
          const mo = moist.at(u, v);
          const dt = detail.at(u, v) - 0.5;
          // Pixel grain: cheap integer hash.
          let gh = Math.imul((pxx + cx * P) * 374761393 + (py + cy * P) * 668265263, 1274126177);
          gh = ((gh ^ (gh >>> 13)) >>> 0) / 4294967296 - 0.5;
          // Painterly brush strokes (tileable pattern in global pixel space).
          const gpx = cx * P + pxx - GROUND_PAD;
          const gpy = cy * P + py - GROUND_PAD;
          const br = brush[((gpy & (BRUSH - 1)) << 8) | (gpx & (BRUSH - 1))] as number;
          const wNear = nearWater[ti] === 1;
          const wv = wNear ? water.at(u, v) + n * 0.32 : 0;
          const cNear = nearCliff[ti] === 1;
          const cv = cNear ? cliff.at(u, v) : 0;
          const cn = cNear ? cv + n * 0.3 : 0;
          // Pixels fully under water or on a plateau top skip the land layers (painted over).
          const land = wv < 0.535 && cn < 0.53;
          if (!land) {
            out.r = out.g = out.b = 0;
          } else {
            // Grass: lush (moist) ↔ meadow ↔ dry, with cool and sun-warmed patches.
            grass.at(u, v, out);
            // Light strokes lean warm/yellow, dark ones cool/blue: a hand-painted blade texture.
            const tex = 1 + dt * 0.16;
            out.r *= tex + br * 0.17;
            out.g *= tex + br * 0.13;
            out.b *= tex + br * 0.05;
            // Bare-earth patches in the dry meadows, and the trampled ground around the bases.
            const dirt = smooth(0.74, 0.84, col + dt * 0.25) * (1 - smooth(0.5, 0.7, mo));
            const pz = nearBase[ti] ? plaza.at(u, v) : 0;
            const pw = nearPath[ti] ? path.at(u, v) * smooth(-0.35, 0.15, dt + br * 0.25) : 0;
            const earth = Math.max(dirt * 0.8, smooth(0.25, 0.75, pz + dt * 0.5) * 0.85, pw * 0.7);
            if (earth > 0) {
              const el = smooth(-0.15, 0.25, dt);
              const ec: RGB = [
                C.earth[0] + (C.earthLight[0] - C.earth[0]) * el,
                C.earth[1] + (C.earthLight[1] - C.earth[1]) * el,
                C.earth[2] + (C.earthLight[2] - C.earth[2]) * el,
              ];
              mixInto(ec, earth);
            }
            // Forest floor: dark moss with leaf litter; grass next to the trees lies in their shade.
            const fo = nearForest[ti] ? forest.at(u, v) : 0;
            const ff = fo > 0 ? smooth(0.32, 0.62, fo + n * 0.35) : 0;
            if (fo > 0) {
              const ao = 1 - smooth(0.04, 0.4, fo + n * 0.2) * 0.2;
              out.r *= ao;
              out.g *= ao;
              out.b *= ao * 1.04;
            }
            if (ff > 0) {
              mixInto(C.forestFloor, ff * 0.92);
              mixInto(C.leafLitter, ff * smooth(0, 0.3, dt) * 0.6);
            }
            // Beaches: sand tiles plus a band around all water.
            const sd = wNear
              ? Math.max(smooth(0.4, 0.6, sand.at(u, v) + n * 0.4), smooth(0.2, 0.42, wv))
              : 0;
            if (sd > 0) {
              mixInto(C.sand, sd);
              if (dt > 0.12) mixInto(C.sandDark, sd * 0.35);
            }
            if (wv > 0.36 && wv <= 0.5) mixInto(C.wetSand, smooth(0.36, 0.5, wv) * 0.8);
            else if (wv > 0.05 && sd < 0.5) mixInto(C.grassCool, smooth(0.05, 0.3, wv) * 0.3);
            // Hill shading on land: warm light on the sunny slopes, cool shade in hollows.
            const sh = shadeGrid.at(u, v);
            const lk = 1 + sh * 0.24;
            out.r *= lk + (sh > 0 ? sh * 0.04 : 0);
            out.g *= lk;
            out.b *= lk + (sh < 0 ? -sh * 0.06 : 0);
          }
          // Cliffs: a raised plateau (lit rim, turf, cracks) with a tall layered rock wall below
          // its south edge, narrow side walls, and a long shadow cast to the south-east.
          if (cNear) {
            const shadow = cliff.at(u - 0.55, v - 1.5) - cv;
            if (shadow > 0) {
              const k = 1 - Math.min(0.45, shadow * 0.6);
              out.r *= k;
              out.g *= k;
              out.b *= k * 1.03;
            }
          }
          if (cNear && cn < 0.53) {
            // Coverage of the open ground (1) vs the plateau (0): blends the wall's top edge.
            const ground = 1 - smooth(0.47, 0.53, cn);
            // South wall: scan upwards for the plateau edge (wall height varies a little).
            const H = CLIFF_H * (0.85 + (edge.at(u * 0.7, 3.3) - 0.5) * 0.6);
            let d = -1;
            let prev = cn;
            for (let k = 1; k <= 12; k++) {
              const dd = (k / 12) * H;
              const val = cliff.at(u, v - dd) + (edge.at(u, v - dd) - 0.5) * 0.3;
              if (val > 0.5) {
                // Interpolate the exact crossing between the last two samples (smooth foot).
                const f = (0.5 - prev) / Math.max(1e-4, val - prev);
                d = dd - (1 - Math.min(1, Math.max(0, f))) * (H / 12);
                break;
              }
              prev = val;
            }
            let wallW = 0;
            if (d > 0) {
              const t = d / H; // 0 at the lip, 1 at the foot
              // Weathered rock columns: each has a lit west face, a shaded east face and a dark
              // crevice between, crossed by wobbly horizontal strata.
              const cu = u * 2.3 + (edge.at(u * 0.6, v * 0.4) - 0.5) * 1.6 + t * 0.25;
              const ci = Math.floor(cu);
              const cf = cu - ci;
              const colK = 0.88 + tileHash(ci, 7, 0x51) * 0.24;
              const face =
                1 +
                (1 - smooth(0.0, 0.22, cf)) * 0.28 -
                smooth(0.62, 0.92, cf) * 0.3 -
                (1 - smooth(0.0, 0.05, cf)) * 0.35;
              const band = Math.sin((t * 4.4 + dt * 0.7 + Math.sin(u * 1.7) * 0.2) * Math.PI);
              let k = colK * face * (1 + band * 0.08 + dt * 0.3 + br * 0.06);
              k *= 1.3 - t * 0.6; // light near the lip, occluded at the foot
              const lip = 1 - smooth(0.02, 0.12, t);
              const warm = tileHash(ci, 3, 0x77) * 0.5 + 0.5;
              const wall: RGB = [
                C.rockFace[0] * k * (0.96 + warm * 0.08) + 40 * lip,
                C.rockFace[1] * k + 32 * lip,
                C.rockFace[2] * k * (1.06 - warm * 0.08) + 18 * lip,
              ];
              // Moss and grass hanging over the lip, ivy streaks running down some columns.
              const drip =
                (1 - smooth(0.06, 0.2 + tileHash(ci, 9, 0x33) * 0.35, t + dt * 0.3)) * 0.8;
              if (drip > 0) {
                wall[0] += (C.moss[0] * 0.8 - wall[0]) * drip;
                wall[1] += (C.moss[1] * 0.85 - wall[1]) * drip;
                wall[2] += (C.moss[2] * 0.8 - wall[2]) * drip;
              }
              wallW = ground * (1 - smooth(0.9, 1, t));
              mixInto(wall, wallW);
              // Dark seam where the wall meets the ground.
              const seam = smooth(0.84, 0.98, t) * (1 - smooth(0.98, 1.08, t));
              out.r *= 1 - seam * 0.3;
              out.g *= 1 - seam * 0.3;
              out.b *= 1 - seam * 0.26;
            }
            // Side walls: lit on the west-facing edge, shaded on the east-facing one.
            const east = smooth(0.46, 0.56, cliff.at(u - 0.3, v) + n * 0.3);
            const west = smooth(0.46, 0.56, cliff.at(u + 0.3, v) + n * 0.3);
            const sideW = Math.max(east, west) * ground * (1 - wallW);
            if (sideW > 0.01) {
              const f = west > east ? 1.18 : 0.66;
              const strata = 1 + Math.sin((v * 4.4 + dt) * Math.PI) * 0.08;
              const side: RGB = [
                C.rockFace[0] * f * strata,
                C.rockFace[1] * f * strata,
                C.rockFace[2] * f * strata * 1.04,
              ];
              mixInto(side, sideW * 0.9);
            }
          }
          if (cn > 0.45) {
            const t = smooth(0.45, 0.53, cn);
            const rock = col * 0.5 + (dt + 0.5) * 0.5;
            const r: RGB = [
              C.rockDark[0] + (C.rockLight[0] - C.rockDark[0]) * rock,
              C.rockDark[1] + (C.rockLight[1] - C.rockDark[1]) * rock,
              C.rockDark[2] + (C.rockLight[2] - C.rockDark[2]) * rock,
            ];
            // Cracks.
            const ck =
              1 - (1 - smooth(0.02, 0.1, Math.abs(Math.sin(u * 7 + v * 3 + dt * 8)))) * 0.25;
            r[0] *= ck;
            r[1] *= ck;
            r[2] *= ck;
            // Highland turf over the plateau interior with rocky outcrops; bare rock at the rim.
            const moss =
              smooth(0.57, 0.72, cn + dt * 0.35 + (mo - 0.5) * 0.2) *
              0.95 *
              (1 - smooth(0.7, 0.8, col + dt * 0.5) * 0.55);
            if (moss > 0) {
              const tk = 1 + br * 0.16 + dt * 0.15;
              r[0] += (C.highland[0] * (tk + br * 0.03) - r[0]) * moss;
              r[1] += (C.highland[1] * tk - r[1]) * moss;
              r[2] += (C.highland[2] * (tk - br * 0.06) - r[2]) * moss;
            }
            // Edge lighting from the cliff field's slope: bright rim on north/west edges,
            // darker lip on south/east ones; the raised top catches a bit more sun overall.
            const gx = cliff.at(u + 0.15, v) - cliff.at(u - 0.15, v);
            const gy = cliff.at(u, v + 0.15) - cliff.at(u, v - 0.15);
            const lit =
              (1.05 + Math.max(-0.35, Math.min(0.45, (gx + gy) * 1.6))) *
              (1 - (1 - smooth(0.5, 0.57, cn)) * 0.28);
            r[0] *= lit;
            r[1] *= lit;
            r[2] *= lit;
            mixInto(r, t);
          }
          // Water: depth gradient, caustic shimmer, foam line; the shore blends over a few pixels.
          if (wv > 0.45) {
            const depth = smooth(0.5, 1.05, wv + dt * 0.08);
            const caus = Math.abs(
              Math.sin((u * 3.1 + dt * 2.5) * 2.2) * Math.sin((v * 2.7 - dt * 2) * 2.4),
            );
            const ck = 1 + (caus - 0.35) * 0.2 * (1 - depth * 0.8);
            // Shallow turquoise over a sandy bottom → teal → deep blue.
            const d1 = Math.min(1, depth * 2);
            const d2 = Math.max(0, depth * 2 - 1);
            const water: RGB = [
              (C.shallow[0] + (C.midWater[0] - C.shallow[0]) * d1) * ck,
              (C.shallow[1] + (C.midWater[1] - C.shallow[1]) * d1) * ck,
              (C.shallow[2] + (C.midWater[2] - C.shallow[2]) * d1) * ck,
            ];
            water[0] += (C.deep[0] - water[0]) * d2;
            water[1] += (C.deep[1] - water[1]) * d2;
            water[2] += (C.deep[2] - water[2]) * d2;
            // Sky reflection: a soft lighter sheen drifting across open water.
            const sky = smooth(0.55, 0.9, col) * depth * 14;
            water[0] += sky;
            water[1] += sky;
            water[2] += sky * 1.2;
            mixInto(water, smooth(0.465, 0.535, wv));
            const foam = smooth(0.475, 0.505, wv) * (1 - smooth(0.515, 0.565, wv));
            if (foam > 0) mixInto(C.foam, foam * 0.6);
          }
          // Grain and darkening towards the map border.
          const g = gh * (wv > 0.52 ? 2.5 : cn > 0.45 ? 10 : 5);
          const border = Math.min(u, v, w - u, h - v);
          const vig = border < 2 ? 0.75 + 0.125 * border : 1;
          const o = (py * canvas.width + pxx) * 4;
          px[o] = Math.max(0, Math.min(255, (out.r + g) * vig));
          px[o + 1] = Math.max(0, Math.min(255, (out.g + g) * vig));
          px[o + 2] = Math.max(0, Math.min(255, (out.b + g) * vig));
          px[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.translate(GROUND_PAD, GROUND_PAD);
      decorate(ctx, map, cx, cy, tw, th, plaza);
      let hasWater = false;
      for (let y = cy; y < cy + th && !hasWater; y++)
        for (let x = cx; x < cx + tw; x++)
          if (map.tiles[y * w + x] === Terrain.Water) {
            hasWater = true;
            break;
          }
      const waves = hasWater
        ? ([0, 1].map((k) => waveLayer(cx, cy, tw, th, k, water, edge, detail)) as [
            WaveLayer,
            WaveLayer,
          ])
        : null;
      chunks.push({ tx: cx, ty: cy, canvas, waves });
    }
  }
  return chunks;
}

/** Height of cliff walls in tiles (drawn below the plateau's south edge). */
const CLIFF_H = 1.35;

/** Half-resolution pixels per tile for the animated water layers. */
export const WAVE_PX = GROUND_PX / 2;

/**
 * Light ripple lines on open water plus a foam band hugging the shore; layer `k` uses a different
 * phase so cross-fading the two reads as moving water and lapping waves.
 */
function waveLayer(
  cx: number,
  cy: number,
  tw: number,
  th: number,
  k: number,
  water: Field,
  edge: NoiseGrid,
  detail: NoiseGrid,
): WaveLayer {
  const P = WAVE_PX;
  const W = tw * P;
  const H = th * P;
  const px = new Uint8ClampedArray(W * H * 4);
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let py = 0; py < H; py++) {
    const v = cy + (py + 0.5) / P;
    for (let pxx = 0; pxx < W; pxx++) {
      const u = cx + (pxx + 0.5) / P;
      const wv = water.at(u, v) + (edge.at(u, v) - 0.5) * 0.32;
      if (wv < 0.5) continue;
      const dt = detail.at(u, v) - 0.5;
      // Thin wavy crests across open water.
      const phase = (v * 1.6 + u * 0.35 + dt * 1.4 + k * 0.5) * Math.PI * 2;
      const crest = Math.pow(1 - Math.abs(Math.sin(phase)), 10);
      const open = smooth(0.56, 0.75, wv);
      // A second foam line a little off the shore (the wave coming in).
      const shoreBand = Math.exp(-(((wv - (k ? 0.575 : 0.545)) / 0.024) ** 2));
      // Fade in over the shore instead of a hard cut (no stair-stepped half-res edge).
      const a = Math.min(1, crest * open * 0.55 + shoreBand * 0.7) * smooth(0.5, 0.54, wv);
      if (a < 0.02) continue;
      const o = (py * W + pxx) * 4;
      px[o] = 235;
      px[o + 1] = 248;
      px[o + 2] = 255;
      px[o + 3] = a * 255;
      if (pxx < x0) x0 = pxx;
      if (pxx > x1) x1 = pxx;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  // Crop to the water's bounding box so the renderer never draws empty quads.
  if (x1 < 0) {
    x0 = y0 = 0;
    x1 = y1 = 0;
  }
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const c = cv.getContext('2d')!;
  c.putImageData(new ImageData(px, W, H), -x0, -y0, x0, y0, cw, ch);
  return { canvas: cv, x: cx + x0 / P, y: cy + y0 / P };
}

/** Tiles occupied by a resource feature (no clutter is drawn there). */
function featureMask(map: GameMap): Uint8Array {
  const m = new Uint8Array(map.width * map.height);
  for (const f of map.features) {
    const s = f.kind === 'gold' ? 2 : 1;
    for (let dy = -1; dy <= s; dy++)
      for (let dx = -1; dx <= s; dx++) {
        const x = f.x + dx;
        const y = f.y + dy;
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) m[y * map.width + x] = 1;
      }
  }
  return m;
}

const FLOWERS: Array<[string, string]> = [
  ['#ffe066', '#f6f2ea'],
  ['#f6f2ea', '#c9a0ff'],
  ['#e86a8a', '#ffd0dc'],
  ['#8fb0ff', '#f6f2ea'],
  ['#ffa94d', '#ffe066'],
];

let maskCache: { map: GameMap; mask: Uint8Array } | null = null;

/**
 * Bake small details into the ground: grass blades, flowers, pebbles, boulders, bushes, fallen
 * logs, mushrooms, leaf litter, reeds and lilies. All drawn inside their tile so chunk edges
 * never cut them.
 */
function decorate(
  c: CanvasRenderingContext2D,
  map: GameMap,
  cx: number,
  cy: number,
  tw: number,
  th: number,
  plaza: FnGrid,
): void {
  const P = GROUND_PX;
  if (maskCache?.map !== map) maskCache = { map, mask: featureMask(map) };
  const mask = maskCache.mask;
  const W = map.width;
  const tileAt = (x: number, y: number): number =>
    map.tiles[Math.min(map.height - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] ?? 0;
  for (let ty = cy; ty < cy + th; ty++) {
    for (let tx = cx; tx < cx + tw; tx++) {
      const t = map.tiles[ty * W + tx];
      const r = (k: number): number => tileHash(tx, ty, 0x77 + k);
      const ox = (tx - cx) * P;
      const oy = (ty - cy) * P;
      // The tile right below a cliff is covered by its wall: keep clutter off it.
      const underWall = tileAt(tx, ty - 1) === Terrain.Cliff && t !== Terrain.Cliff;
      const free = !mask[ty * W + tx] && !underWall;
      if (
        !underWall &&
        t !== Terrain.Cliff &&
        tileAt(tx, ty - 2) === Terrain.Cliff &&
        t !== Terrain.Water
      ) {
        // Scree: fallen rocks gathered at the foot of the wall.
        for (let k = 0; k < 4; k++)
          boulder(
            c,
            ox + 5 + r(300 + k) * (P - 10),
            oy + 4 + r(310 + k) * 7,
            1.6 + r(320 + k) * 2.2,
            r,
          );
      }
      const inPlaza = plaza.at(tx + 0.5, ty + 0.5) > 0.4;
      if (t === Terrain.Grass && !underWall) {
        // Grass tufts: little clumps of blades, dark roots and sunlit tips (painterly texture).
        const tufts = inPlaza ? 1 : 2;
        for (let k = 0; k < tufts; k++) {
          const x = ox + 4 + r(k) * (P - 8);
          const y = oy + 6 + r(k + 10) * (P - 8);
          const hgt = 3.5 + r(k + 40) * 2.5;
          c.lineWidth = 1;
          for (let b = 0; b < 4; b++) {
            const lean = (b - 1.5) * 1.1 + (r(k + 20) - 0.5) * 1.5;
            c.strokeStyle = b === 1 || b === 2 ? 'rgba(160,204,96,0.42)' : 'rgba(26,58,26,0.4)';
            c.beginPath();
            c.moveTo(x + (b - 1.5) * 0.7, y);
            c.quadraticCurveTo(x + lean * 0.4, y - hgt * 0.6, x + lean, y - hgt + (b % 2) * 1.2);
            c.stroke();
          }
        }
        // Wildflower meadows in some regions, scattered clusters elsewhere.
        const meadow = valueNoise(tx / 5, ty / 5, map.seed ^ 0x4e4e);
        const clusters = inPlaza ? 0 : meadow > 0.82 ? 2 : meadow > 0.75 || r(30) < 0.04 ? 1 : 0;
        if (clusters > 0) {
          const pal = FLOWERS[Math.floor(valueNoise(tx / 3, ty / 3, map.seed ^ 0x1f1f) * 4.99)]!;
          for (let q = 0; q < clusters; q++) {
            const qx = ox + 7 + r(32 + q) * (P - 14);
            const qy = oy + 8 + r(36 + q) * (P - 14);
            // A leafy rosette under each tight bunch of blossoms.
            c.fillStyle = 'rgba(38,84,30,0.45)';
            c.beginPath();
            c.ellipse(qx, qy + 1, 4.5, 2.6, 0, 0, Math.PI * 2);
            c.fill();
            for (let k = 0; k < 5; k++) {
              const fx = qx + (r(40 + q * 8 + k) - 0.5) * 7;
              const fy = qy + (r(50 + q * 8 + k) - 0.5) * 4.5;
              c.fillStyle = pal[k === 4 ? 1 : 0]!;
              c.beginPath();
              c.arc(fx, fy, 1.15 + r(60 + k) * 0.45, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = 'rgba(255,250,220,0.85)';
              c.fillRect(fx - 0.6, fy - 0.9, 0.7, 0.7);
            }
          }
        }
        if (r(50) < (inPlaza ? 0.25 : 0.06)) pebbles(c, ox, oy, r);
        if (free && !inPlaza) {
          const roll = r(55);
          if (roll < 0.035)
            boulder(
              c,
              ox + P * (0.35 + r(56) * 0.3),
              oy + P * (0.4 + r(57) * 0.25),
              5 + r(58) * 4,
              r,
            );
          else if (roll < 0.075)
            bush(
              c,
              ox + P * (0.35 + r(56) * 0.3),
              oy + P * (0.4 + r(57) * 0.3),
              4.5 + r(58) * 3,
              r,
            );
          else if (roll < 0.085) log(c, ox + P * 0.5, oy + P * 0.55, r);
        }
        // Forest edge: mushrooms and ferns next to the trees.
        const nearForest =
          tileAt(tx + 1, ty) === Terrain.Forest ||
          tileAt(tx - 1, ty) === Terrain.Forest ||
          tileAt(tx, ty + 1) === Terrain.Forest ||
          tileAt(tx, ty - 1) === Terrain.Forest;
        if (nearForest && free && r(60) < 0.35) {
          if (r(61) < 0.5)
            mushrooms(c, ox + P * (0.3 + r(62) * 0.4), oy + P * (0.35 + r(63) * 0.4), r);
          else fern(c, ox + P * (0.3 + r(62) * 0.4), oy + P * (0.45 + r(63) * 0.3), r);
        }
      } else if (t === Terrain.Forest) {
        // Leaf litter and twigs on the forest floor.
        for (let k = 0; k < 6; k++) {
          c.fillStyle = r(k + 70) > 0.5 ? 'rgba(150,104,48,0.45)' : 'rgba(98,120,46,0.45)';
          c.beginPath();
          c.ellipse(
            ox + 3 + r(k + 80) * (P - 6),
            oy + 3 + r(k + 90) * (P - 6),
            1.6,
            0.9,
            r(k) * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      } else if (t === Terrain.Sand) {
        if (r(60) < 0.4) pebbles(c, ox, oy, r);
        if (r(64) < 0.08) shell(c, ox + 6 + r(65) * (P - 12), oy + 6 + r(66) * (P - 12));
      } else if (t === Terrain.Cliff) {
        if (r(67) < 0.3)
          boulder(c, ox + P * (0.3 + r(68) * 0.4), oy + P * (0.35 + r(69) * 0.3), 3 + r(70) * 3, r);
      } else if (t === Terrain.Water) {
        const shoreN = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([dx, dy]) => tileAt(tx + dx!, ty + dy!) !== Terrain.Water).length;
        if (shoreN > 0 && free && r(73) < 0.4)
          reeds(c, ox + P * (0.25 + r(74) * 0.5), oy + P * (0.3 + r(75) * 0.4), r);
        else if (shoreN > 0 && free && r(73) < 0.55) {
          // A mossy rock in the shallows with a ring of foam.
          const rx = ox + P * (0.3 + r(76) * 0.4);
          const ry = oy + P * (0.35 + r(77) * 0.3);
          const rs = 2.6 + r(78) * 2;
          c.strokeStyle = 'rgba(236,248,250,0.55)';
          c.lineWidth = 1;
          c.beginPath();
          c.ellipse(rx, ry + rs * 0.35, rs * 1.5, rs * 0.75, 0, 0, Math.PI * 2);
          c.stroke();
          boulder(c, rx, ry, rs, r);
        } else if (shoreN === 0 && r(70) < 0.07) {
          // Lily pad with a flower now and then.
          const lx = ox + 6 + r(71) * (P - 12);
          const ly = oy + 6 + r(72) * (P - 12);
          c.fillStyle = 'rgba(70,130,60,0.95)';
          c.beginPath();
          c.arc(lx, ly, 3.2, 0.3, Math.PI * 1.9);
          c.lineTo(lx, ly);
          c.fill();
          if (r(76) < 0.4) {
            c.fillStyle = '#f7c6d8';
            c.beginPath();
            c.arc(lx + 0.5, ly - 0.5, 1.3, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
  }
}

function pebbles(
  c: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  r: (k: number) => number,
): void {
  for (let k = 0; k < 3; k++) {
    const x = ox + 5 + r(100 + k) * (GROUND_PX - 10);
    const y = oy + 5 + r(110 + k) * (GROUND_PX - 10);
    const s = 0.9 + r(120 + k) * 1.2;
    c.fillStyle = 'rgba(50,40,30,0.3)';
    c.beginPath();
    c.ellipse(x + 0.6, y + 0.6, s * 1.3, s * 0.9, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = r(130 + k) > 0.5 ? '#b5aa98' : '#958a7a';
    c.beginPath();
    c.ellipse(x, y, s * 1.3, s * 0.9, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** Rounded boulder with a lit top, dark base and a cast shadow to the south-east. */
function boulder(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  r: (k: number) => number,
): void {
  c.fillStyle = 'rgba(20,28,16,0.35)';
  c.beginPath();
  c.ellipse(x + s * 0.5, y + s * 0.45, s * 1.15, s * 0.55, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - s * 0.35, y - s * 0.5, s * 0.1, x, y, s * 1.1);
  g.addColorStop(0, '#d2c8b6');
  g.addColorStop(0.55, '#9a8f80');
  g.addColorStop(1, '#5e564c');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - s, y + s * 0.3);
  c.quadraticCurveTo(x - s * 1.05, y - s * 0.6, x - s * 0.2, y - s * 0.75);
  c.quadraticCurveTo(x + s * 0.9, y - s * 0.7, x + s, y + s * 0.2);
  c.quadraticCurveTo(x, y + s * 0.6, x - s, y + s * 0.3);
  c.fill();
  c.strokeStyle = 'rgba(40,34,28,0.55)';
  c.lineWidth = 0.8;
  c.stroke();
  if (r(140) < 0.6) {
    c.fillStyle = 'rgba(96,130,60,0.6)';
    c.beginPath();
    c.ellipse(x - s * 0.2, y - s * 0.55, s * 0.45, s * 0.18, -0.2, 0, Math.PI * 2);
    c.fill();
  }
}

function bush(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  r: (k: number) => number,
): void {
  c.fillStyle = 'rgba(16,30,12,0.35)';
  c.beginPath();
  c.ellipse(x + s * 0.4, y + s * 0.5, s * 1.25, s * 0.55, 0, 0, Math.PI * 2);
  c.fill();
  const base = r(150) < 0.5 ? [52, 104, 44] : [70, 116, 46];
  for (let k = 0; k < 5; k++) {
    const bx = x + (r(151 + k) - 0.5) * s * 1.3;
    const by = y + (r(160 + k) - 0.6) * s * 0.8;
    const br = s * (0.5 + r(170 + k) * 0.3);
    // Two flat tones (dark body, lit cap) — cheap to rasterise, reads as a lit blob.
    c.fillStyle = `rgb(${base[0]! - 18},${base[1]! - 26},${base[2]! - 12})`;
    c.beginPath();
    c.arc(bx, by, br, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = `rgb(${base[0]! + 34},${base[1]! + 44},${base[2]! + 20})`;
    c.beginPath();
    c.arc(bx - br * 0.25, by - br * 0.3, br * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  if (r(180) < 0.35) {
    c.fillStyle = '#e8506a';
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.arc(x + (r(181 + k) - 0.5) * s, y + (r(185 + k) - 0.7) * s * 0.7, 0.9, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function log(c: CanvasRenderingContext2D, x: number, y: number, r: (k: number) => number): void {
  const a = (r(190) - 0.5) * 0.8;
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.fillStyle = 'rgba(20,28,14,0.35)';
  c.fillRect(-9, 1, 19, 4);
  const g = c.createLinearGradient(0, -3, 0, 3);
  g.addColorStop(0, '#9a7048');
  g.addColorStop(1, '#4e3420');
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-10, -3, 19, 6, 3);
  c.fill();
  c.fillStyle = '#c9a070';
  c.beginPath();
  c.ellipse(9, 0, 2, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#7a5634';
  c.lineWidth = 0.6;
  c.beginPath();
  c.ellipse(9, 0, 1, 1.6, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(100,140,60,0.7)';
  c.fillRect(-6, -3, 5, 1.6);
  c.restore();
}

function mushrooms(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: (k: number) => number,
): void {
  const red = r(200) < 0.4;
  for (let k = 0; k < 3; k++) {
    const mx = x + (r(201 + k) - 0.5) * 7;
    const my = y + (r(205 + k) - 0.5) * 5;
    c.fillStyle = '#efe6d0';
    c.fillRect(mx - 0.5, my - 1, 1.1, 2.4);
    c.fillStyle = red ? '#d8402e' : '#b8875a';
    c.beginPath();
    c.ellipse(mx, my - 1.2, 2, 1.3, 0, Math.PI, 0);
    c.fill();
    if (red) {
      c.fillStyle = '#fff';
      c.fillRect(mx - 0.6, my - 2, 0.6, 0.6);
    }
  }
}

function fern(c: CanvasRenderingContext2D, x: number, y: number, r: (k: number) => number): void {
  c.strokeStyle = r(210) < 0.5 ? '#3e7a34' : '#4f8a3a';
  c.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.45;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(
      x + Math.cos(a) * 3,
      y + Math.sin(a) * 4,
      x + Math.cos(a) * 6,
      y + Math.sin(a) * 6 + 1.5,
    );
    c.stroke();
  }
}

function reeds(c: CanvasRenderingContext2D, x: number, y: number, r: (k: number) => number): void {
  for (let k = 0; k < 6; k++) {
    const rx = x + (r(220 + k) - 0.5) * 8;
    const ry = y + (r(230 + k) - 0.5) * 4;
    const hgt = 5 + r(240 + k) * 4;
    c.strokeStyle = k % 2 ? '#6f8a3a' : '#8aa04a';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(rx, ry);
    c.lineTo(rx + (r(250 + k) - 0.5) * 2, ry - hgt);
    c.stroke();
    if (k % 3 === 0) {
      c.fillStyle = '#6a4a2a';
      c.fillRect(rx - 0.6, ry - hgt - 1, 1.4, 2.6);
    }
  }
}

function shell(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = '#f4e6d6';
  c.beginPath();
  c.arc(x, y, 1.5, Math.PI, 0);
  c.fill();
  c.strokeStyle = 'rgba(160,120,100,0.6)';
  c.lineWidth = 0.4;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - 1, y - 1);
  c.moveTo(x, y);
  c.lineTo(x + 1, y - 1);
  c.stroke();
}
