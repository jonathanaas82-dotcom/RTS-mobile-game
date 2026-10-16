import type Phaser from 'phaser';
import { valueNoise } from '../../sim/map/noise';
import type { World } from '../../sim/world';
import { TILE_PX } from '../assets/tileset';
import { blur121 } from '../terrain/ground';

/** Fog texture pixels per tile (bilinear-smoothed, then linear-filtered on the GPU). */
const RES = 4;
const ALPHA_UNEXPLORED = 236;
const ALPHA_EXPLORED = 115;

/**
 * Fog of war overlay: tile visibility is smoothed into soft gradients and modulated by a static
 * misty noise, so the fog edge looks like drifting mist rather than squares. Only redrawn when
 * the sim recomputes visibility.
 */
export class FogRenderer {
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly img: Phaser.GameObjects.Image;
  private readonly data: ImageData;
  private readonly mist: Float32Array;
  private readonly tileAlpha: Float32Array;
  /** Blurred "still unexplored" field: its soft edge gets a light, cloud-bank fringe. */
  private readonly unexplored: Float32Array;
  /** Per-pixel cloud brightness (puffy light and dark patches in the fog). */
  private readonly puff: Float32Array;
  private readonly w: number;
  private readonly h: number;
  private lastTick = -1;
  /** Fog state at the last redraw: only the area around changed tiles is repainted. */
  private readonly prev: Uint8Array;

  constructor(scene: Phaser.Scene, world: World) {
    this.w = world.map.width;
    this.h = world.map.height;
    if (scene.textures.exists('fog')) scene.textures.remove('fog');
    const tex = scene.textures.createCanvas('fog', this.w * RES, this.h * RES);
    if (!tex) throw new Error('fog texture');
    this.tex = tex;
    tex.setFilter(0); // FilterMode.LINEAR (0): smooth fog edges when scaled up
    this.data = tex.context.createImageData(this.w * RES, this.h * RES);
    this.tileAlpha = new Float32Array(this.w * this.h);
    this.mist = new Float32Array(this.w * RES * this.h * RES);
    this.unexplored = new Float32Array(this.w * this.h);
    this.prev = new Uint8Array(this.w * this.h).fill(255);
    this.puff = new Float32Array(this.w * RES * this.h * RES);
    for (let y = 0; y < this.h * RES; y++) {
      for (let x = 0; x < this.w * RES; x++) {
        const n =
          valueNoise(x / (RES * 2.2), y / (RES * 2.2), 4242) * 0.7 +
          valueNoise(x / (RES * 1.5), y / (RES * 1.5), 99) * 0.3;
        this.mist[y * this.w * RES + x] = 0.82 + n * 0.3;
        this.puff[y * this.w * RES + x] =
          valueNoise(x / (RES * 3.2), y / (RES * 3.2), 777) * 0.65 +
          valueNoise(x / (RES * 1.4), y / (RES * 1.4), 31) * 0.35;
      }
    }
    this.img = scene.add
      .image(0, 0, 'fog')
      .setOrigin(0, 0)
      .setScale(TILE_PX / RES)
      .setDepth(5e5);
  }

  update(world: World, me: number): void {
    // Fog only changes on fog ticks; skip redundant uploads.
    const t = world.tick - (world.tick % 4);
    if (t === this.lastTick) return;
    this.lastTick = t;
    const fog = world.fog[me];
    if (!fog) return;
    const w = this.w;
    const h = this.h;
    // Bounding box of tiles whose visibility changed since the last redraw.
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < fog.length; i++) {
      const v = fog[i] as number;
      if (v === this.prev[i]) continue;
      this.prev[i] = v;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) return;
    // The blurs spread a change two tiles and bilinear sampling reads one tile further.
    const M = 3;
    minX = Math.max(0, minX - M);
    minY = Math.max(0, minY - M);
    maxX = Math.min(w - 1, maxX + M);
    maxY = Math.min(h - 1, maxY + M);
    for (let i = 0; i < fog.length; i++) {
      const v = fog[i];
      this.tileAlpha[i] = v === 2 ? 0 : v === 1 ? ALPHA_EXPLORED : ALPHA_UNEXPLORED;
      this.unexplored[i] = v === 0 ? 1 : 0;
    }
    blur121(this.unexplored, w, h);
    // Two blur passes + linear sampling: soft gradients without per-tile plateaus.
    blur121(this.tileAlpha, w, h);
    blur121(this.tileAlpha, w, h);
    const px = this.data.data;
    const W = w * RES;
    const ta = this.tileAlpha;
    const ue = this.unexplored;
    const x0px = minX * RES;
    const y0px = minY * RES;
    const x1px = (maxX + 1) * RES;
    const y1px = (maxY + 1) * RES;
    for (let y = y0px; y < y1px; y++) {
      const fy = Math.min(h - 1.001, Math.max(0, (y + 0.5) / RES - 0.5));
      const y0 = fy | 0;
      const ty = fy - y0;
      for (let x = x0px; x < x1px; x++) {
        const fx = Math.min(w - 1.001, Math.max(0, (x + 0.5) / RES - 0.5));
        const x0 = fx | 0;
        const tx = fx - x0;
        const i = y0 * w + x0;
        const a = ta[i] as number;
        const b = ta[i + 1] as number;
        const c = ta[i + w] as number;
        const d = ta[i + w + 1] as number;
        let alpha = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
        const p = y * W + x;
        alpha = Math.min(255, alpha * (this.mist[p] as number));
        const ua = ue[i] as number;
        const ub = ue[i + 1] as number;
        const uc = ue[i + w] as number;
        const ud = ue[i + w + 1] as number;
        const un = (ua + (ub - ua) * tx) * (1 - ty) + (uc + (ud - uc) * tx) * ty;
        // Puffy cloud tones inside, and a pale, sunlit fringe where the cloud bank thins out.
        const pf = this.puff[p] as number;
        const fringe = Math.max(0, 4 * un * (1 - un) - 0.25) * (0.5 + pf * 0.9);
        const lift = (pf - 0.5) * 22 * un;
        const o = p * 4;
        px[o] = 16 + lift + fringe * 120;
        px[o + 1] = 22 + lift + fringe * 128;
        px[o + 2] = 34 + lift * 1.2 + fringe * 140;
        px[o + 3] = alpha;
      }
    }
    this.tex.context.putImageData(this.data, 0, 0, x0px, y0px, x1px - x0px, y1px - y0px);
    this.tex.refresh();
    // Re-uploading resets the sampler to the renderer default (NEAREST when antialias is off,
    // e.g. on high-DPI phones), which turns the soft mist into blocks: force LINEAR again.
    this.tex.setFilter(0);
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }
}
