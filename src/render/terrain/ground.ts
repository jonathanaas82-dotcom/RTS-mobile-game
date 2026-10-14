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
  grassLush: [62, 122, 50] as RGB,
  grassMeadow: [118, 164, 70] as RGB,
  grassDry: [166, 166, 84] as RGB,
  earth: [138, 112, 78] as RGB,
  earthLight: [164, 138, 98] as RGB,
  forestFloor: [46, 78, 36] as RGB,
  leafLitter: [92, 86, 44] as RGB,
  sand: [226, 204, 150] as RGB,
  sandDark: [196, 172, 122] as RGB,
  wetSand: [176, 152, 106] as RGB,
  shallow: [64, 164, 176] as RGB,
  deep: [22, 70, 120] as RGB,
  foam: [236, 246, 242] as RGB,
  rockLight: [186, 176, 158] as RGB,
  rockDark: [104, 96, 86] as RGB,
  rockFace: [92, 80, 70] as RGB,
  moss: [104, 132, 64] as RGB,
};

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
  const P = GROUND_PX;
  const chunks: GroundChunk[] = [];
  const out = { r: 0, g: 0, b: 0 };
  const mixInto = (c: RGB, t: number): void => {
    out.r += (c[0] - out.r) * t;
    out.g += (c[1] - out.g) * t;
    out.b += (c[2] - out.b) * t;
  };
  const lerp3 = (a: RGB, b: RGB, t: number): void => {
    out.r = a[0] + (b[0] - a[0]) * t;
    out.g = a[1] + (b[1] - a[1]) * t;
    out.b = a[2] + (b[2] - a[2]) * t;
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
          // Grass: lush (moist) ↔ meadow ↔ dry, with clumpy fine texture.
          lerp3(C.grassMeadow, C.grassLush, smooth(0.35, 0.7, mo));
          mixInto(C.grassDry, smooth(0.6, 0.85, col) * (1 - smooth(0.4, 0.7, mo)) * 0.75);
          const tex = 1 + dt * 0.22;
          out.r *= tex;
          out.g *= tex;
          out.b *= tex;
          // Bare-earth patches in the dry meadows, and the trampled ground around the bases.
          const dirt = smooth(0.74, 0.84, col + dt * 0.25) * (1 - smooth(0.5, 0.7, mo));
          const pz = nearBase[ti] ? plaza.at(u, v) : 0;
          const earth = Math.max(dirt * 0.8, smooth(0.25, 0.75, pz + dt * 0.5) * 0.85);
          if (earth > 0) {
            const el = smooth(-0.15, 0.25, dt);
            const ec: RGB = [
              C.earth[0] + (C.earthLight[0] - C.earth[0]) * el,
              C.earth[1] + (C.earthLight[1] - C.earth[1]) * el,
              C.earth[2] + (C.earthLight[2] - C.earth[2]) * el,
            ];
            mixInto(ec, earth);
          }
          // Forest floor: dark moss with leaf litter.
          const ff = nearForest[ti] ? smooth(0.32, 0.62, forest.at(u, v) + n * 0.35) : 0;
          if (ff > 0) {
            mixInto(C.forestFloor, ff * 0.92);
            mixInto(C.leafLitter, ff * smooth(0, 0.3, dt) * 0.6);
          }
          // Beaches: sand tiles plus a band around all water.
          const wNear = nearWater[ti] === 1;
          const wv = wNear ? water.at(u, v) + n * 0.32 : 0;
          const sd = wNear
            ? Math.max(smooth(0.4, 0.6, sand.at(u, v) + n * 0.4), smooth(0.2, 0.42, wv))
            : 0;
          if (sd > 0) {
            mixInto(C.sand, sd);
            if (dt > 0.12) mixInto(C.sandDark, sd * 0.35);
          }
          if (wv > 0.36 && wv <= 0.5) mixInto(C.wetSand, smooth(0.36, 0.5, wv) * 0.8);
          // Hill shading on land: warm light on the sunny slopes, cool shade in hollows.
          const sh = shadeGrid.at(u, v);
          const lk = 1 + sh * 0.24;
          out.r *= lk + (sh > 0 ? sh * 0.04 : 0);
          out.g *= lk;
          out.b *= lk + (sh < 0 ? -sh * 0.06 : 0);
          // Cliffs: a lit plateau with moss, a striated rock face below it and a cast shadow.
          const cNear = nearCliff[ti] === 1;
          const cv = cNear ? cliff.at(u, v) : 0;
          const cn = cNear ? cv + n * 0.3 : 0;
          const above = cNear ? Math.max(cliff.at(u, v - 0.45), cliff.at(u, v - 0.9)) + n * 0.3 : 0;
          const shadow = cNear ? cliff.at(u - 0.5, v - 1.35) - cv : 0;
          if (shadow > 0) {
            const k = 1 - Math.min(0.42, shadow * 0.55);
            out.r *= k;
            out.g *= k;
            out.b *= k * 1.02;
          }
          const face = above > 0.45 && cn <= 0.5 ? smooth(0.45, 0.6, above) : 0;
          if (face > 0) {
            // Vertical strata: darker towards the foot, lit edges on the west side.
            const strata = Math.sin(u * 23 + dt * 6) * 0.5 + 0.5;
            const depth = smooth(0.45, 0.75, above) * 0.5;
            const f: RGB = [
              C.rockFace[0] * (0.82 + strata * 0.3 - depth * 0.3),
              C.rockFace[1] * (0.82 + strata * 0.3 - depth * 0.3),
              C.rockFace[2] * (0.85 + strata * 0.28 - depth * 0.25),
            ];
            mixInto(f, face);
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
            if (Math.abs(Math.sin(u * 9 + v * 4 + dt * 9)) < 0.06) {
              r[0] *= 0.7;
              r[1] *= 0.7;
              r[2] *= 0.7;
            }
            // Moss and highland turf over the plateau interior; bare rock stays near the rim.
            const moss = Math.min(
              0.85,
              smooth(0.55, 0.8, mo + dt * 0.4) * 0.5 + smooth(0.68, 0.92, cn + dt * 0.3) * 0.6,
            );
            if (moss > 0) {
              r[0] += (C.moss[0] - r[0]) * moss;
              r[1] += (C.moss[1] - r[1]) * moss;
              r[2] += (C.moss[2] - r[2]) * moss;
            }
            // Bright rim along the north and west edges of the plateau.
            const rim = smooth(0.45, 0.6, cn) * (1 - smooth(0.6, 0.8, cn));
            const lit = 1 + rim * 0.35;
            r[0] *= lit;
            r[1] *= lit;
            r[2] *= lit;
            mixInto(r, t);
          }
          // Water: depth gradient, caustic shimmer, foam line; the shore blends over a few pixels.
          if (wv > 0.45) {
            const depth = smooth(0.5, 1.05, wv);
            const caus = Math.abs(
              Math.sin((u * 3.1 + dt * 2.5) * 2.2) * Math.sin((v * 2.7 - dt * 2) * 2.4),
            );
            const ck = 1 + (caus - 0.35) * 0.12 * (1 - depth * 0.7);
            const water: RGB = [
              (C.shallow[0] + (C.deep[0] - C.shallow[0]) * depth) * ck,
              (C.shallow[1] + (C.deep[1] - C.shallow[1]) * depth) * ck,
              (C.shallow[2] + (C.deep[2] - C.shallow[2]) * depth) * ck,
            ];
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
      const shoreBand = Math.exp(-(((wv - (k ? 0.57 : 0.54)) / 0.018) ** 2));
      const a = Math.min(1, crest * open * 0.55 + shoreBand * 0.7);
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
      const free = !mask[ty * W + tx];
      const inPlaza = plaza.at(tx + 0.5, ty + 0.5) > 0.4;
      if (t === Terrain.Grass) {
        // Grass blades: short strokes, light tips over darker roots (texture, not speckle).
        const blades = inPlaza ? 2 : 7;
        for (let k = 0; k < blades; k++) {
          const x = ox + 3 + r(k) * (P - 6);
          const y = oy + 4 + r(k + 10) * (P - 6);
          const lean = (r(k + 20) - 0.5) * 2.5;
          c.strokeStyle = r(k + 30) > 0.45 ? 'rgba(178,214,110,0.32)' : 'rgba(40,78,30,0.28)';
          c.lineWidth = 0.9;
          c.beginPath();
          c.moveTo(x, y);
          c.quadraticCurveTo(x + lean * 0.3, y - 2, x + lean, y - 3.5 - r(k + 40) * 1.5);
          c.stroke();
        }
        if (!inPlaza && r(30) < 0.09) {
          // Flower cluster.
          const colors = ['#ffe066', '#f6f2ea', '#e86a8a', '#9fb4ff', '#ffa94d'];
          const col = colors[Math.floor(r(31) * colors.length)]!;
          for (let k = 0; k < 5; k++) {
            const fx = ox + 6 + r(32 + k) * (P - 12);
            const fy = oy + 6 + r(40 + k) * (P - 12);
            c.fillStyle = 'rgba(40,80,30,0.5)';
            c.fillRect(fx - 0.3, fy, 0.7, 2.2);
            c.fillStyle = col;
            c.beginPath();
            c.arc(fx, fy, 1.15, 0, Math.PI * 2);
            c.fill();
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
        else if (shoreN === 0 && r(70) < 0.07) {
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
