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
  private readonly w: number;
  private readonly h: number;
  private lastTick = -1;

  constructor(scene: Phaser.Scene, world: World) {
    this.w = world.map.width;
    this.h = world.map.height;
    if (scene.textures.exists('fog')) scene.textures.remove('fog');
    const tex = scene.textures.createCanvas('fog', this.w * RES, this.h * RES);
    if (!tex) throw new Error('fog texture');
    this.tex = tex;
    tex.setFilter(1); // LINEAR: smooth fog edges when scaled up
    this.data = tex.context.createImageData(this.w * RES, this.h * RES);
    this.tileAlpha = new Float32Array(this.w * this.h);
    this.mist = new Float32Array(this.w * RES * this.h * RES);
    for (let y = 0; y < this.h * RES; y++) {
      for (let x = 0; x < this.w * RES; x++) {
        const n =
          valueNoise(x / (RES * 2.2), y / (RES * 2.2), 4242) * 0.7 +
          valueNoise(x / RES, y / RES, 99) * 0.3;
        this.mist[y * this.w * RES + x] = 0.82 + n * 0.3;
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
    for (let i = 0; i < fog.length; i++) {
      const v = fog[i];
      this.tileAlpha[i] = v === 2 ? 0 : v === 1 ? ALPHA_EXPLORED : ALPHA_UNEXPLORED;
    }
    // Two blur passes + linear sampling: soft gradients without per-tile plateaus.
    blur121(this.tileAlpha, w, h);
    blur121(this.tileAlpha, w, h);
    const px = this.data.data;
    const W = w * RES;
    const H = h * RES;
    const ta = this.tileAlpha;
    for (let y = 0; y < H; y++) {
      const fy = Math.min(h - 1.001, Math.max(0, (y + 0.5) / RES - 0.5));
      const y0 = fy | 0;
      const ty = fy - y0;
      for (let x = 0; x < W; x++) {
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
        const o = p * 4;
        px[o] = 14;
        px[o + 1] = 18;
        px[o + 2] = 26;
        px[o + 3] = alpha;
      }
    }
    this.tex.context.putImageData(this.data, 0, 0);
    this.tex.refresh();
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }
}
