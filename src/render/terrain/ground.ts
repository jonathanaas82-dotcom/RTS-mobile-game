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
  grassA: [78, 132, 54] as RGB,
  grassB: [112, 160, 66] as RGB,
  grassDry: [146, 158, 76] as RGB,
  forestFloor: [54, 86, 40] as RGB,
  sand: [224, 202, 146] as RGB,
  wetSand: [176, 152, 106] as RGB,
  shallow: [70, 156, 172] as RGB,
  deep: [26, 74, 122] as RGB,
  foam: [236, 246, 242] as RGB,
  rockLight: [168, 158, 142] as RGB,
  rockDark: [98, 90, 82] as RGB,
  rockFace: [66, 58, 52] as RGB,
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
  const P = GROUND_PX;
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
          const n = edge.at(u, v) - 0.5;
          const col = color.at(u, v);
          // Pixel grain: cheap integer hash.
          let gh = Math.imul((pxx + cx * P) * 374761393 + (py + cy * P) * 668265263, 1274126177);
          gh = ((gh ^ (gh >>> 13)) >>> 0) / 4294967296 - 0.5;
          // Grass base with large colour variation and dry patches.
          out.r = C.grassA[0] + (C.grassB[0] - C.grassA[0]) * col;
          out.g = C.grassA[1] + (C.grassB[1] - C.grassA[1]) * col;
          out.b = C.grassA[2] + (C.grassB[2] - C.grassA[2]) * col;
          mixInto(C.grassDry, smooth(0.62, 0.85, col) * 0.6);
          // Forest floor.
          const ff = smooth(0.32, 0.62, forest.at(u, v) + n * 0.35);
          if (ff > 0) mixInto(C.forestFloor, ff * 0.9);
          // Beaches: sand tiles plus a band around all water.
          const wv = water.at(u, v) + n * 0.32;
          const sd = Math.max(smooth(0.4, 0.6, sand.at(u, v) + n * 0.4), smooth(0.2, 0.42, wv));
          if (sd > 0) mixInto(C.sand, sd);
          if (wv > 0.36 && wv <= 0.5) mixInto(C.wetSand, smooth(0.36, 0.5, wv) * 0.8);
          // Cliffs: embossed rock with a dark south face and a cast shadow below.
          const cv = cliff.at(u, v);
          const cn = cv + n * 0.3;
          const shadow = cliff.at(u - 0.35, v - 0.55) - cv;
          if (shadow > 0) {
            const k = 1 - Math.min(0.35, shadow * 0.45);
            out.r *= k;
            out.g *= k;
            out.b *= k;
          }
          if (cn > 0.45) {
            const t = smooth(0.45, 0.56, cn);
            const rock = col * 0.6 + (gh + 0.5) * 0.4;
            const r: RGB = [
              C.rockDark[0] + (C.rockLight[0] - C.rockDark[0]) * rock,
              C.rockDark[1] + (C.rockLight[1] - C.rockDark[1]) * rock,
              C.rockDark[2] + (C.rockLight[2] - C.rockDark[2]) * rock,
            ];
            const gx = cliff.at(u + 0.2, v) - cliff.at(u - 0.2, v);
            const gy = cliff.at(u, v + 0.2) - cliff.at(u, v - 0.2);
            const lit = 1 - (gx + gy) * 0.9;
            r[0] *= lit;
            r[1] *= lit;
            r[2] *= lit;
            // South-facing edge = vertical rock face.
            if (gy < -0.15) {
              const f = smooth(0.15, 0.6, -gy);
              r[0] += (C.rockFace[0] - r[0]) * f;
              r[1] += (C.rockFace[1] - r[1]) * f;
              r[2] += (C.rockFace[2] - r[2]) * f;
            }
            mixInto(r, t);
          }
          // Water with depth gradient and a foam line at the shore. The shoreline is blended
          // over a few pixels (coverage, not a hard threshold) so it never stair-steps.
          if (wv > 0.45) {
            const depth = smooth(0.5, 1.05, wv);
            const rip = Math.sin((u * 2.1 + v * 1.3 + col * 6) * 3.1) * 0.5 + 0.5;
            const rk = 1 + (rip - 0.5) * 0.08 * (1 - depth);
            const water: RGB = [
              (C.shallow[0] + (C.deep[0] - C.shallow[0]) * depth) * rk,
              (C.shallow[1] + (C.deep[1] - C.shallow[1]) * depth) * rk,
              (C.shallow[2] + (C.deep[2] - C.shallow[2]) * depth) * rk,
            ];
            mixInto(water, smooth(0.465, 0.535, wv));
            // Foam: a soft band just inside the waterline.
            const foam = smooth(0.475, 0.505, wv) * (1 - smooth(0.515, 0.565, wv));
            if (foam > 0) mixInto(C.foam, foam * 0.6);
          }
          // Grain and darkening towards the map border.
          const g = gh * (wv > 0.52 ? 3 : cn > 0.45 ? 12 : 6);
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
      decorate(ctx, map, cx, cy, tw, th);
      chunks.push({ tx: cx, ty: cy, canvas });
    }
  }
  return chunks;
}

/** Bake small flat details into the ground: grass strokes, flowers, pebbles, reeds, lilies. */
function decorate(
  c: CanvasRenderingContext2D,
  map: GameMap,
  cx: number,
  cy: number,
  tw: number,
  th: number,
): void {
  const P = GROUND_PX;
  for (let ty = cy; ty < cy + th; ty++) {
    for (let tx = cx; tx < cx + tw; tx++) {
      const t = map.tiles[ty * map.width + tx];
      const r = (k: number): number => tileHash(tx, ty, 0x77 + k);
      const ox = (tx - cx) * P;
      const oy = (ty - cy) * P;
      if (t === Terrain.Grass) {
        // Soft grass tufts.
        for (let k = 0; k < 2; k++) {
          const x = ox + r(k) * P;
          const y = oy + r(k + 10) * P;
          c.strokeStyle = r(k + 20) > 0.5 ? 'rgba(150,196,92,0.35)' : 'rgba(46,88,34,0.3)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 1, y - 3);
          c.moveTo(x + 1.5, y);
          c.lineTo(x + 2.5, y - 3.5);
          c.stroke();
        }
        if (r(30) < 0.06) {
          // Flower cluster.
          const colors = ['#ffe066', '#f2f2f2', '#e86a8a', '#9fb4ff'];
          const col = colors[Math.floor(r(31) * colors.length)]!;
          for (let k = 0; k < 4; k++) {
            c.fillStyle = col;
            c.globalAlpha = 0.75;
            c.beginPath();
            c.arc(ox + r(32 + k) * P, oy + r(40 + k) * P, 1, 0, Math.PI * 2);
            c.fill();
          }
        }
        if (r(50) < 0.07) {
          c.fillStyle = 'rgba(150,145,130,0.9)';
          c.beginPath();
          c.ellipse(ox + r(51) * P, oy + r(52) * P, 2.2, 1.5, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
      } else if (t === Terrain.Sand) {
        if (r(60) < 0.3) {
          c.fillStyle = 'rgba(160,140,100,0.6)';
          c.beginPath();
          c.ellipse(ox + r(61) * P, oy + r(62) * P, 1.6, 1, 0, 0, Math.PI * 2);
          c.fill();
        }
      } else if (t === Terrain.Water) {
        const nearShore = [-1, 1].some(
          (d) =>
            map.tiles[ty * map.width + Math.min(map.width - 1, Math.max(0, tx + d))] !==
              Terrain.Water ||
            map.tiles[Math.min(map.height - 1, Math.max(0, ty + d)) * map.width + tx] !==
              Terrain.Water,
        );
        if (!nearShore && r(70) < 0.07) {
          // Lily pad.
          c.fillStyle = 'rgba(70,130,60,0.9)';
          c.beginPath();
          c.arc(ox + r(71) * P, oy + r(72) * P, 3, 0.3, Math.PI * 1.9);
          c.lineTo(ox + r(71) * P, oy + r(72) * P);
          c.fill();
        }
      }
    }
  }
}
