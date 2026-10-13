import type Phaser from 'phaser';
import type { World } from '../../sim/world';
import { TILE_PX } from '../assets/tileset';

/**
 * Fog of war overlay: one canvas pixel per tile, scaled up with linear filtering for soft edges.
 * Only rewritten when the sim recomputes visibility.
 */
export class FogRenderer {
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly img: Phaser.GameObjects.Image;
  private readonly data: ImageData;
  private lastTick = -1;

  constructor(scene: Phaser.Scene, world: World) {
    const w = world.map.width;
    const h = world.map.height;
    if (scene.textures.exists('fog')) scene.textures.remove('fog');
    const tex = scene.textures.createCanvas('fog', w, h);
    if (!tex) throw new Error('fog texture');
    this.tex = tex;
    this.data = tex.context.createImageData(w, h);
    this.img = scene.add.image(0, 0, 'fog').setOrigin(0, 0).setScale(TILE_PX).setDepth(5e5);
  }

  update(world: World, me: number): void {
    // Fog only changes on fog ticks; skip redundant uploads.
    const t = world.tick - (world.tick % 4);
    if (t === this.lastTick) return;
    this.lastTick = t;
    const fog = world.fog[me];
    if (!fog) return;
    const px = this.data.data;
    for (let i = 0; i < fog.length; i++) {
      const v = fog[i];
      const o = i * 4;
      px[o] = 8;
      px[o + 1] = 14;
      px[o + 2] = 11;
      px[o + 3] = v === 2 ? 0 : v === 1 ? 120 : 245;
    }
    this.tex.context.putImageData(this.data, 0, 0);
    this.tex.refresh();
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }
}
