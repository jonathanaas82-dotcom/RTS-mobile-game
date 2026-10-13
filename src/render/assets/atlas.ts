import type Phaser from 'phaser';
import { createCanvas } from './procedural/draw';

/**
 * Packs many small canvases into texture pages (shelf packing) so all sprites of a kind share a
 * texture and render in a single batched draw call. Frames are addressed by name.
 */
export class AtlasBuilder {
  private readonly items: Array<{ name: string; canvas: HTMLCanvasElement }> = [];

  add(name: string, canvas: HTMLCanvasElement): void {
    this.items.push({ name, canvas });
  }

  /** Register texture pages `${key}_0`, `${key}_1`… and return frame name -> texture key. */
  build(
    textures: Phaser.Textures.TextureManager,
    key: string,
    pageSize = 2048,
  ): Map<string, string> {
    const lookup = new Map<string, string>();
    const sorted = [...this.items].sort((a, b) => b.canvas.height - a.canvas.height);
    let page = 0;
    let rest = sorted;
    while (rest.length > 0) {
      const placed: Array<{ name: string; canvas: HTMLCanvasElement; x: number; y: number }> = [];
      const overflow: typeof sorted = [];
      let x = 1;
      let y = 1;
      let shelfH = 0;
      for (const it of rest) {
        const w = it.canvas.width;
        const h = it.canvas.height;
        if (x + w + 1 > pageSize) {
          x = 1;
          y += shelfH + 2;
          shelfH = 0;
        }
        if (y + h + 1 > pageSize) {
          overflow.push(it);
          continue;
        }
        placed.push({ ...it, x, y });
        x += w + 2;
        shelfH = Math.max(shelfH, h);
      }
      const height = Math.min(pageSize, nextPow2(y + shelfH + 2));
      const [cv, ctx] = createCanvas(pageSize, height);
      for (const p of placed) ctx.drawImage(p.canvas, p.x, p.y);
      const texKey = `${key}_${page}`;
      if (textures.exists(texKey)) textures.remove(texKey);
      const tex = textures.addCanvas(texKey, cv);
      if (!tex) throw new Error('atlas page failed');
      for (const p of placed) {
        tex.add(p.name, 0, p.x, p.y, p.canvas.width, p.canvas.height);
        lookup.set(p.name, texKey);
      }
      rest = overflow;
      page++;
      if (placed.length === 0) throw new Error('atlas item larger than page');
    }
    return lookup;
  }
}

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p *= 2;
  return p;
}
