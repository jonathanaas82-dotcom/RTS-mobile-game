import type Phaser from 'phaser';
import type { GameMap } from '../../sim/map/mapgen';
import { Terrain } from '../../sim/map/terrain';
import { tileHash, valueNoise } from '../../sim/map/noise';
import { AtlasBuilder } from '../assets/atlas';
import { ART_RES, createCanvas, outlined, shade, softShadow } from '../assets/procedural/draw';
import { TILE_PX } from '../assets/tileset';
import { CHUNK_TILES } from './ground';

type Ctx = CanvasRenderingContext2D;

const TREE_W = 84;
const TREE_H = 112;

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function trunk(c: Ctx, x: number, y: number, h: number, w: number): void {
  const g = c.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, '#8a6440');
  g.addColorStop(1, '#4a3220');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - w * 1.5, y);
  c.quadraticCurveTo(x - w * 0.6, y - h * 0.3, x - w * 0.6, y - h);
  c.lineTo(x + w * 0.6, y - h);
  c.quadraticCurveTo(x + w * 0.6, y - h * 0.3, x + w * 1.5, y);
  c.closePath();
  c.fill();
}

/** Broadleaf tree: clustered leafy blobs, lit from the upper left. */
function broadleaf(c: Ctx, seed: number, leaf: string): void {
  const bx = TREE_W / 2;
  const by = TREE_H - 10;
  trunk(c, bx, by, 42, 5);
  const rnd = (k: number): number => tileHash(seed, k, 0xbeef);
  const blobs: Array<[number, number, number]> = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd(k) * 0.5;
    const d = 12 + rnd(k + 20) * 12;
    blobs.push([bx + Math.cos(a) * d, 46 + Math.sin(a) * d * 0.8, 14 + rnd(k + 40) * 6]);
  }
  blobs.push([bx, 44, 20]);
  // Dark underside layer, mid layer, then highlights.
  for (const [x, y, r] of blobs) disc(c, x + 2, y + 4, r, shade(leaf, 0.55));
  for (const [x, y, r] of blobs) {
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.15, x, y, r);
    g.addColorStop(0, shade(leaf, 1.35));
    g.addColorStop(0.6, leaf);
    g.addColorStop(1, shade(leaf, 0.72));
    disc(c, x, y, r, g);
  }
  for (let k = 0; k < 14; k++) {
    const x = bx - 20 + rnd(k + 60) * 34;
    const y = 26 + rnd(k + 80) * 30;
    disc(c, x, y, 2 + rnd(k + 90) * 2, shade(leaf, 1.5));
  }
}

/** Conifer: stacked tiers, lit from the left. */
function pine(c: Ctx, seed: number, leaf: string): void {
  const bx = TREE_W / 2;
  const by = TREE_H - 10;
  trunk(c, bx, by, 26, 4);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const w = 34 - t * 20 + tileHash(seed, i, 7) * 4;
    const top = 6 + i * 18;
    const bottom = top + 34 - t * 6;
    const g = c.createLinearGradient(bx - w, 0, bx + w, 0);
    g.addColorStop(0, shade(leaf, 1.3));
    g.addColorStop(0.45, leaf);
    g.addColorStop(1, shade(leaf, 0.6));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(bx, top);
    c.quadraticCurveTo(bx + w * 0.4, top + (bottom - top) * 0.6, bx + w, bottom);
    c.quadraticCurveTo(bx, bottom - 6, bx - w, bottom);
    c.quadraticCurveTo(bx - w * 0.4, top + (bottom - top) * 0.6, bx, top);
    c.fill();
  }
}

function treeCanvas(kind: 'broad' | 'pine', seed: number, leaf: string): HTMLCanvasElement {
  const [fig, c] = createCanvas(TREE_W * ART_RES, TREE_H * ART_RES);
  c.scale(ART_RES, ART_RES);
  if (kind === 'broad') broadleaf(c, seed, leaf);
  else pine(c, seed, leaf);
  const [out, oc] = createCanvas(TREE_W * ART_RES, TREE_H * ART_RES);
  oc.scale(ART_RES, ART_RES);
  softShadow(oc, TREE_W / 2 + 10, TREE_H - 9, 26, 8, 0.45);
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.drawImage(outlined(fig, 2.5, 'rgba(20,30,16,0.85)'), 0, 0);
  return out;
}

function stumpCanvas(): HTMLCanvasElement {
  const [cv, c] = createCanvas(28 * ART_RES, 22 * ART_RES);
  c.scale(ART_RES, ART_RES);
  softShadow(c, 15, 16, 10, 4, 0.35);
  c.fillStyle = '#5a3d24';
  c.fillRect(8, 8, 12, 9);
  c.fillStyle = '#c9a070';
  c.beginPath();
  c.ellipse(14, 8, 6, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#8a6440';
  c.lineWidth = 0.8;
  c.beginPath();
  c.ellipse(14, 8, 3, 1.5, 0, 0, Math.PI * 2);
  c.stroke();
  return cv;
}

const LEAVES = ['#3f7a34', '#4d8a3a', '#356b30', '#5c8f36', '#2f6438'];
const PINES = ['#245a3e', '#2d6644', '#1f4f36'];
const VARIANTS = 4;

interface Tree {
  img: Phaser.GameObjects.Image;
  phase: number;
}

/**
 * Forest tiles become individual, depth-sorted tree sprites (two per tile) from one atlas, so
 * units walk in front of and behind them. Chunk-level culling keeps the per-frame cost low.
 */
export class TreeLayer {
  private readonly scene: Phaser.Scene;
  private readonly byTile = new Map<number, Tree[]>();
  private readonly chunks: Tree[][] = [];
  private readonly chunkVisible: boolean[] = [];
  private readonly cols: number;
  private readonly lookup: Map<string, string>;
  private readonly map: GameMap;
  sway = true;

  constructor(scene: Phaser.Scene, map: GameMap) {
    this.scene = scene;
    this.map = map;
    const atlas = new AtlasBuilder();
    for (let v = 0; v < VARIANTS; v++) {
      atlas.add(`broad${v}`, treeCanvas('broad', v * 31 + 5, LEAVES[v % LEAVES.length]!));
      atlas.add(`pine${v}`, treeCanvas('pine', v * 17 + 3, PINES[v % PINES.length]!));
    }
    atlas.add('stump', stumpCanvas());
    this.lookup = atlas.build(scene.textures, 'trees');
    this.cols = Math.ceil(map.width / CHUNK_TILES);
    const rows = Math.ceil(map.height / CHUNK_TILES);
    for (let i = 0; i < this.cols * rows; i++) {
      this.chunks.push([]);
      this.chunkVisible.push(true);
    }
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.tiles[ty * map.width + tx] !== Terrain.Forest) continue;
        this.plant(tx, ty);
      }
    }
  }

  private frame(name: string): [string, string] {
    return [this.lookup.get(name) ?? 'trees_0', name];
  }

  private chunkOf(tx: number, ty: number): number {
    return Math.floor(ty / CHUNK_TILES) * this.cols + Math.floor(tx / CHUNK_TILES);
  }

  private add(tx: number, ty: number, name: string, x: number, y: number, scale: number): Tree {
    const [key, f] = this.frame(name);
    const img = this.scene.add
      .image(x * TILE_PX, y * TILE_PX, key, f)
      .setOrigin(0.5, 0.91)
      .setScale(scale / ART_RES)
      .setDepth(y * TILE_PX);
    const tree = { img, phase: tileHash(tx, ty, 99) * 6.28 };
    this.chunks[this.chunkOf(tx, ty)]!.push(tree);
    return tree;
  }

  private plant(tx: number, ty: number): void {
    const i = ty * this.map.width + tx;
    // Conifers dominate in some regions, broadleaf in others.
    const pineRegion = valueNoise(tx / 9, ty / 9, this.map.seed ^ 0x55) > 0.55;
    const trees: Tree[] = [];
    for (let k = 0; k < 2; k++) {
      const jx = tileHash(tx, ty, k * 3 + 1) * 0.7 - 0.35;
      const jy = tileHash(tx, ty, k * 3 + 2) * 0.5 + (k === 0 ? -0.15 : 0.25);
      const v = Math.floor(tileHash(tx, ty, k * 3 + 3) * VARIANTS);
      const usePine = pineRegion ? tileHash(tx, ty, k + 40) < 0.8 : tileHash(tx, ty, k + 40) < 0.15;
      const scale = 0.82 + tileHash(tx, ty, k + 50) * 0.28;
      trees.push(
        this.add(tx, ty, `${usePine ? 'pine' : 'broad'}${v}`, tx + 0.5 + jx, ty + jy + 0.35, scale),
      );
    }
    this.byTile.set(i, trees);
  }

  /** A forest tile was cleared: fell its trees and leave stumps. */
  removeTile(i: number): void {
    const trees = this.byTile.get(i);
    if (!trees) return;
    this.byTile.delete(i);
    const tx = i % this.map.width;
    const ty = Math.floor(i / this.map.width);
    const list = this.chunks[this.chunkOf(tx, ty)]!;
    for (const t of trees) {
      const idx = list.indexOf(t);
      if (idx >= 0) list.splice(idx, 1);
      const img = t.img;
      this.scene.tweens.add({
        targets: img,
        angle: 80,
        alpha: 0,
        duration: 600,
        ease: 'Quad.easeIn',
        onComplete: () => img.destroy(),
      });
      const stump = this.add(tx, ty, 'stump', img.x / TILE_PX, img.y / TILE_PX, 1);
      stump.img.setDepth(stump.img.y - 20);
      stump.phase = -1;
    }
  }

  /** Remove trees whose tiles were cleared while events were skipped (fast-forward). */
  sync(): void {
    for (const i of [...this.byTile.keys()])
      if (this.map.tiles[i] !== Terrain.Forest) this.removeTile(i);
  }

  /** Cull chunks outside the view and animate a gentle wind sway on visible trees. */
  update(view: Phaser.Geom.Rectangle, time: number): void {
    const pad = TILE_PX * 2;
    const span = CHUNK_TILES * TILE_PX;
    for (let k = 0; k < this.chunks.length; k++) {
      const cx = (k % this.cols) * span;
      const cy = Math.floor(k / this.cols) * span;
      const vis =
        cx < view.right + pad &&
        cx + span > view.x - pad &&
        cy < view.bottom + pad &&
        cy + span > view.y - pad;
      const list = this.chunks[k]!;
      if (vis !== this.chunkVisible[k]) {
        this.chunkVisible[k] = vis;
        for (const t of list) t.img.setVisible(vis);
      }
      if (vis && this.sway) {
        for (const t of list)
          if (t.phase >= 0) t.img.setAngle(Math.sin(time * 0.0012 + t.phase) * 1.3);
      }
    }
  }
}
