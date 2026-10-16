import type Phaser from 'phaser';
import type { GameMap } from '../../sim/map/mapgen';
import { Terrain } from '../../sim/map/terrain';
import { tileHash, valueNoise } from '../../sim/map/noise';
import { AtlasBuilder } from '../assets/atlas';
import {
  ART_RES,
  castShadow,
  createCanvas,
  outlined,
  shade,
  softShadow,
  sunlight,
} from '../assets/procedural/draw';
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

function trunk(c: Ctx, x: number, y: number, h: number, w: number, dark = '#4a3220'): void {
  const g = c.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, '#9a7048');
  g.addColorStop(0.45, '#6e4c30');
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - w * 1.6, y);
  c.quadraticCurveTo(x - w * 0.6, y - h * 0.3, x - w * 0.6, y - h);
  c.lineTo(x + w * 0.6, y - h);
  c.quadraticCurveTo(x + w * 0.6, y - h * 0.3, x + w * 1.6, y);
  c.closePath();
  c.fill();
}

type Rnd = () => number;

function rng(seed: number): Rnd {
  let k = 0;
  return () => tileHash(seed, k++, 0xbeef);
}

/**
 * Painterly leaf mass: every clump is a dark ragged body, a mid-tone dome and a few sunlit dabs
 * on its upper-left, painted back to front so the clumps read as separate, lit volumes.
 */
function canopy(c: Ctx, rnd: Rnd, blobs: Array<[number, number, number]>, leaf: string): void {
  const sorted = [...blobs].sort((a, b) => a[1] - b[1]);
  const dark = shade(leaf, 0.5);
  const mid = shade(leaf, 0.8);
  for (const [x, y, r] of sorted) {
    disc(c, x + 1.2, y + 2.5, r, dark);
    // Ragged, leafy outline.
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      disc(c, x + Math.cos(a) * r * 0.9 + 1, y + Math.sin(a) * r * 0.9 + 2, r * 0.3, dark);
    }
    disc(c, x - 0.4, y - 0.8, r * 0.86, mid);
    for (let k = 0; k < 5; k++) {
      const a = -2.3 + (rnd() - 0.5) * 2;
      const d = r * (0.12 + rnd() * 0.42);
      const f = 0.98 + rnd() * 0.2;
      disc(c, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.26 + rnd() * 0.2), shade(leaf, f));
    }
    for (let k = 0; k < 3; k++) {
      disc(
        c,
        x - r * 0.38 + (rnd() - 0.5) * r * 0.5,
        y - r * 0.45 + (rnd() - 0.5) * r * 0.35,
        r * 0.1 + rnd() * 1.2,
        shade(leaf, 1.38),
      );
    }
  }
}

/** Round broadleaf tree (also autumn variants). */
function broadleaf(c: Ctx, seed: number, leaf: string): void {
  const bx = TREE_W / 2;
  const by = TREE_H - 10;
  const rnd = rng(seed);
  trunk(c, bx, by, 44, 5);
  // A couple of branches reaching into the crown.
  c.strokeStyle = '#5a3d26';
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(bx, by - 28);
  c.quadraticCurveTo(bx - 8, by - 38, bx - 14, by - 46);
  c.moveTo(bx + 1, by - 32);
  c.quadraticCurveTo(bx + 9, by - 40, bx + 15, by - 48);
  c.stroke();
  const blobs: Array<[number, number, number]> = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rnd() * 0.5;
    const d = 12 + rnd() * 10;
    blobs.push([bx + Math.cos(a) * d, 44 + Math.sin(a) * d * 0.78, 11 + rnd() * 5]);
  }
  blobs.push([bx - 4, 40, 15], [bx + 3, 50, 14]);
  canopy(c, rnd, blobs, leaf);
}

/** Broad, heavy oak: wide crown of many clumps over a thick trunk. */
function oak(c: Ctx, seed: number, leaf: string): void {
  const bx = TREE_W / 2;
  const by = TREE_H - 10;
  const rnd = rng(seed);
  trunk(c, bx, by, 40, 7.5);
  const blobs: Array<[number, number, number]> = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + rnd() * 0.4;
    const d = 16 + rnd() * 11;
    blobs.push([bx + Math.cos(a) * d * 1.1, 48 + Math.sin(a) * d * 0.72, 10 + rnd() * 5]);
  }
  blobs.push([bx - 6, 42, 14], [bx + 7, 46, 14], [bx, 54, 13]);
  canopy(c, rnd, blobs, leaf);
}

/** Slender birch: white bark with dark marks under an airy, light crown. */
function birch(c: Ctx, seed: number, leaf: string): void {
  const bx = TREE_W / 2 + 2;
  const by = TREE_H - 10;
  const rnd = rng(seed);
  const stems: Array<[number, number]> = [
    [bx - 3, -0.12],
    [bx + 4, 0.1],
  ];
  for (const [sx, lean] of stems) {
    const top = 30;
    c.strokeStyle = '#3a342c';
    c.lineWidth = 4.6;
    c.beginPath();
    c.moveTo(sx, by);
    c.lineTo(sx + lean * 40, top);
    c.stroke();
    c.strokeStyle = '#ece6da';
    c.lineWidth = 3.2;
    c.stroke();
    for (let k = 0; k < 7; k++) {
      const t = 0.1 + rnd() * 0.85;
      const x = sx + lean * 40 * t;
      const y = by + (top - by) * t;
      c.fillStyle = '#2e2a24';
      c.fillRect(x - 1.6 + rnd(), y, 1.6 + rnd() * 1.4, 1);
    }
  }
  const blobs: Array<[number, number, number]> = [];
  for (let k = 0; k < 11; k++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 16;
    blobs.push([bx + Math.cos(a) * d * 0.9, 34 + Math.sin(a) * d * 1.1, 6.5 + rnd() * 4]);
  }
  canopy(c, rnd, blobs, leaf);
}

/** Conifer: stacked, jagged tiers lit from the left, with needle strokes. */
function conifer(c: Ctx, seed: number, leaf: string, tiers: number, w0: number, w1: number): void {
  const bx = TREE_W / 2;
  const by = TREE_H - 10;
  const rnd = rng(seed);
  trunk(c, bx, by, 24, 3.6);
  const topY = 4;
  const bottomY = by - 12;
  const step = (bottomY - topY) / (tiers + 0.6);
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1);
    const w = w1 + (w0 - w1) * t + (rnd() - 0.5) * 3;
    const top = topY + i * step * 0.92;
    const bottom = top + step * 1.75;
    // Jagged lower edge: teeth of drooping branch tips.
    const teeth = 5 + Math.round(w / 6);
    const path = (dx: number, dy: number, sw: number): void => {
      c.beginPath();
      c.moveTo(bx + dx, top + dy);
      c.quadraticCurveTo(
        bx + sw * 0.45 + dx,
        top + (bottom - top) * 0.55 + dy,
        bx + sw + dx,
        bottom + dy,
      );
      for (let k = teeth; k >= 0; k--) {
        const x = bx - sw + (2 * sw * k) / teeth;
        const y = bottom - 3 - Math.sin((k / teeth) * Math.PI) * 3 + (k % 2 ? -2.2 : 0.6);
        c.lineTo(x + dx, y + dy);
      }
      c.quadraticCurveTo(bx - sw * 0.45 + dx, top + (bottom - top) * 0.55 + dy, bx + dx, top + dy);
    };
    c.fillStyle = shade(leaf, 0.5);
    path(1.2, 2.2, w);
    c.fill();
    const g = c.createLinearGradient(bx - w, 0, bx + w, 0);
    g.addColorStop(0, shade(leaf, 1.32));
    g.addColorStop(0.42, leaf);
    g.addColorStop(1, shade(leaf, 0.62));
    c.fillStyle = g;
    path(0, 0, w);
    c.fill();
    // Needle strokes: light on the sunny side, dark on the shaded side.
    c.lineWidth = 1;
    for (let k = 0; k < 6 + w / 3; k++) {
      const f = rnd();
      const x = bx - w * 0.85 + f * w * 1.7;
      const y = top + (bottom - top) * (0.45 + rnd() * 0.4);
      c.strokeStyle = f < 0.45 ? shade(leaf, 1.55) : shade(leaf, 0.55);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (f - 0.5) * 4, y + 3);
      c.stroke();
    }
  }
}

export type TreeKind = 'broad' | 'oak' | 'birch' | 'pine' | 'spruce' | 'autumn';

function drawTree(c: Ctx, kind: TreeKind, seed: number, leaf: string): void {
  if (kind === 'broad' || kind === 'autumn') broadleaf(c, seed, leaf);
  else if (kind === 'oak') oak(c, seed, leaf);
  else if (kind === 'birch') birch(c, seed, leaf);
  else if (kind === 'pine') conifer(c, seed, leaf, 4, 32, 12);
  else conifer(c, seed, leaf, 6, 24, 7);
}

/** Bare tree figure (no outline or contact shadow), used for the cast shadow. */
function treeFigure(kind: TreeKind, seed: number, leaf: string): HTMLCanvasElement {
  const [fig, c] = createCanvas(TREE_W * ART_RES, TREE_H * ART_RES);
  c.scale(ART_RES, ART_RES);
  drawTree(c, kind, seed, leaf);
  return fig;
}

/** Base row of the trunk in tree-canvas pixels (matches the 0.91 sprite origin). */
const TREE_BASE = 0.91;

export function treeCanvas(
  kind: TreeKind,
  seed: number,
  leaf: string,
  fig = treeFigure(kind, seed, leaf),
): HTMLCanvasElement {
  sunlight(fig, TREE_BASE * TREE_H * ART_RES, 3, true);
  const [out, oc] = createCanvas(TREE_W * ART_RES, TREE_H * ART_RES);
  oc.scale(ART_RES, ART_RES);
  softShadow(oc, TREE_W / 2 + 8, TREE_H - 9, 24, 8, 0.45);
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.drawImage(outlined(fig, 2.2, 'rgba(18,28,14,0.85)'), 0, 0);
  return out;
}

/** Undergrowth shrub for forest edges (optionally with tiny flowers or berries). */
function shrubCanvas(seed: number, leaf: string, dots: string | null): HTMLCanvasElement {
  const W = 40;
  const H = 30;
  const [fig, c] = createCanvas(W * ART_RES, H * ART_RES);
  c.scale(ART_RES, ART_RES);
  const rnd = rng(seed);
  const blobs: Array<[number, number, number]> = [];
  for (let k = 0; k < 6; k++)
    blobs.push([W / 2 + (rnd() - 0.5) * 20, H - 12 + (rnd() - 0.6) * 8, 5 + rnd() * 3.5]);
  canopy(c, rnd, blobs, leaf);
  if (dots) {
    for (let k = 0; k < 7; k++) {
      const [x, y, r] = blobs[k % blobs.length]!;
      disc(c, x + (rnd() - 0.6) * r, y + (rnd() - 0.7) * r, 1.1, dots);
    }
  }
  const [out, oc] = createCanvas(W * ART_RES, H * ART_RES);
  oc.scale(ART_RES, ART_RES);
  softShadow(oc, W / 2 + 3, H - 6, 15, 5, 0.4);
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.drawImage(outlined(fig, 2, 'rgba(18,28,14,0.8)'), 0, 0);
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

/** Leaf colours per species; each colour is one atlas variant. */
const SPECIES: Record<TreeKind, string[]> = {
  broad: ['#4a8a36', '#3f7a34', '#558f38'],
  oak: ['#356b2c', '#3c712e'],
  birch: ['#7fa848', '#8aae50'],
  pine: ['#2a6040', '#326a44', '#245a3e'],
  spruce: ['#1f4f3e', '#1b4636'],
  autumn: ['#d8862a', '#e0b030'],
};
const SHRUBS: Array<[string, string | null]> = [
  ['#3f7a34', null],
  ['#4d8a3a', '#f4f0e0'],
  ['#356b30', '#ffd84a'],
];

interface Tree {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  phase: number;
  /** Undergrowth: fades away with its tile but leaves no stump. */
  shrub?: boolean;
}

/**
 * Forest tiles become individual, depth-sorted tree sprites (three per tile, clumped, mixed
 * species) from one atlas, so units walk in front of and behind them. Trees deep inside a forest
 * are tinted darker (the canopy shades them) while the sunlit edges stay bright; only edge trees
 * get a cast-shadow sprite (inside, the dark forest floor does that job). Chunk-level culling
 * keeps the per-frame cost low.
 */
export class TreeLayer {
  private readonly scene: Phaser.Scene;
  private readonly byTile = new Map<number, Tree[]>();
  private readonly chunks: Tree[][] = [];
  private readonly chunkVisible: boolean[] = [];
  private readonly cols: number;
  private readonly lookup: Map<string, string>;
  private readonly map: GameMap;
  /** Pixel size of each tree variant's shadow texture (to align its origin with the trunk). */
  private readonly shadowSize = new Map<string, [number, number]>();
  sway = true;
  private frameNo = 0;

  constructor(scene: Phaser.Scene, map: GameMap) {
    this.scene = scene;
    this.map = map;
    const atlas = new AtlasBuilder();
    for (const kind of Object.keys(SPECIES) as TreeKind[]) {
      SPECIES[kind].forEach((leaf, v) => {
        const seed = v * 31 + kind.length * 7 + 5;
        // One figure serves both: the shadow only needs its silhouette.
        const fig = treeFigure(kind, seed, leaf);
        const sh = castShadow(fig, TREE_BASE * TREE_H * ART_RES, 0.3);
        atlas.add(`${kind}${v}`, treeCanvas(kind, seed, leaf, fig));
        atlas.add(`${kind}${v}_s`, sh);
        this.shadowSize.set(`${kind}${v}`, [sh.width, sh.height]);
      });
    }
    SHRUBS.forEach(([leaf, dots], v) =>
      atlas.add(`shrub${v}`, shrubCanvas(v * 13 + 2, leaf, dots)),
    );
    atlas.add('stump', stumpCanvas());
    this.lookup = atlas.build(scene.textures, 'trees');
    // Smooth (bilinear) sampling: the 2× art is minified at most zoom levels, and the renderer's
    // default without antialiasing (high-DPI phones) is NEAREST, which makes foliage crunchy.
    for (const key of new Set(this.lookup.values())) scene.textures.get(key).setFilter(0);
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

  private add(
    tx: number,
    ty: number,
    name: string,
    x: number,
    y: number,
    scale: number,
    withShadow = true,
  ): Tree {
    const [key, f] = this.frame(name);
    const img = this.scene.add
      .image(x * TILE_PX, y * TILE_PX, key, f)
      .setOrigin(0.5, TREE_BASE)
      .setScale(scale / ART_RES)
      .setDepth(y * TILE_PX);
    let shadow: Phaser.GameObjects.Image | null = null;
    const size = withShadow ? this.shadowSize.get(name) : undefined;
    if (size) {
      const [sk, sf] = this.frame(`${name}_s`);
      shadow = this.scene.add
        .image(x * TILE_PX, y * TILE_PX, sk, sf)
        .setOrigin((TREE_W * ART_RES) / 2 / size[0], (TREE_BASE * TREE_H * ART_RES) / size[1])
        .setScale(scale / ART_RES)
        .setDepth(-0.95);
    }
    const tree = { img, shadow, phase: tileHash(tx, ty, 99) * 6.28 };
    this.chunks[this.chunkOf(tx, ty)]!.push(tree);
    return tree;
  }

  private isForest(x: number, y: number): boolean {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return true;
    return m.tiles[y * m.width + x] === Terrain.Forest;
  }

  private plant(tx: number, ty: number): void {
    const i = ty * this.map.width + tx;
    const seed = this.map.seed;
    const h = (k: number): number => tileHash(tx, ty, k);
    // How deep inside the forest this tile is (0 = edge, 1 = surrounded).
    let n = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && this.isForest(tx + dx, ty + dy)) n++;
    const depth = Math.max(0, (n - 12) / 12);
    // Shadows fall to the lower right: only cast them where open ground can receive them.
    const castsOut =
      !this.isForest(tx + 1, ty) || !this.isForest(tx, ty + 1) || !this.isForest(tx + 1, ty + 1);
    // Species regions: conifer stands, broadleaf groves, birch clumps and rare autumn colour.
    const conif = valueNoise(tx / 9, ty / 9, seed ^ 0x55);
    const birchy = valueNoise(tx / 4, ty / 4, seed ^ 0x77) > 0.72;
    const autumn = valueNoise(tx / 3, ty / 3, seed ^ 0x99) > 0.86;
    const pick = (k: number): TreeKind => {
      const r = h(40 + k);
      if (conif > 0.55) return r < 0.55 ? 'pine' : r < 0.9 ? 'spruce' : 'broad';
      if (birchy && r < 0.6) return 'birch';
      if (autumn && r < 0.35) return 'autumn';
      if (conif > 0.45 && r < 0.4) return 'pine';
      return r < 0.55 ? 'broad' : r < 0.9 ? 'oak' : 'birch';
    };
    // Three trees on a jittered triangle.
    const slots: Array<[number, number]> = [
      [0.28, 0.12],
      [0.74, 0.32],
      [0.42, 0.7],
    ];
    const trees: Tree[] = [];
    // Deep inside a forest the canopy closes over: two larger trees cover the tile just as well.
    const deep = depth >= 0.75;
    slots.forEach(([sx, sy], k) => {
      if (deep && k === 1) return;
      const kind = pick(k);
      const v = Math.floor(h(k * 3 + 3) * SPECIES[kind].length);
      const x = tx + sx + (h(k * 3 + 1) - 0.5) * 0.3;
      const y = ty + sy + (h(k * 3 + 2) - 0.5) * 0.24 + 0.2;
      const scale = (0.76 + h(k + 50) * 0.32) * (kind === 'birch' ? 0.92 : 1) * (deep ? 1.12 : 1);
      const t = this.add(tx, ty, `${kind}${v}`, x, y, scale, castsOut && k > 0);
      // Canopy shade inside the forest, with a little per-tree variation.
      const lum = 1 - depth * 0.24 - h(k + 60) * 0.08;
      const c = Math.round(255 * lum);
      t.img.setTint((c << 16) | (Math.min(255, Math.round(c * 1.01)) << 8) | Math.round(c * 0.96));
      trees.push(t);
    });
    // Undergrowth along open edges, mostly on the sunny south side.
    if (!this.isForest(tx, ty + 1) && h(70) < 0.6) {
      const t = this.add(
        tx,
        ty,
        `shrub${Math.floor(h(71) * SHRUBS.length)}`,
        tx + 0.2 + h(72) * 0.6,
        ty + 0.98,
        0.8 + h(73) * 0.35,
        false,
      );
      t.shrub = true;
      t.phase = -1;
      trees.push(t);
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
      const sh = t.shadow;
      if (sh)
        this.scene.tweens.add({
          targets: sh,
          alpha: 0,
          duration: 500,
          onComplete: () => sh.destroy(),
        });
      if (t.shrub) continue;
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
    // The sway is too subtle to see when zoomed far out; closer in, half of the trees are updated
    // on alternate frames (30 Hz is plenty for a gentle breeze).
    const sway = this.sway && view.width < 30 * TILE_PX;
    const parity = (this.frameNo = (this.frameNo + 1) & 1);
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
        for (const t of list) {
          t.img.setVisible(vis);
          t.shadow?.setVisible(vis);
        }
      }
      if (vis && sway) {
        for (let j = parity; j < list.length; j += 2) {
          const t = list[j]!;
          if (t.phase >= 0) t.img.setAngle(Math.sin(time * 0.0012 + t.phase) * 1.3);
        }
      }
    }
  }
}
