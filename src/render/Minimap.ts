import { PALETTE } from './assets/palette';
import { Terrain } from '../sim/map/terrain';
import { tileHash } from '../sim/map/noise';
import type { World } from '../sim/world';
import { GROUND_PX, type GroundChunk } from './terrain/ground';

const SIZE = 224;

/** Fallback flat colours (used if no painted ground is supplied, e.g. in tests). */
const TERRAIN_RGB: Record<number, string> = {
  [Terrain.Grass]: '#5e9b47',
  [Terrain.Sand]: '#d8c385',
  [Terrain.Forest]: '#3f7a36',
  [Terrain.Water]: '#2f6fae',
  [Terrain.Cliff]: '#7d7368',
};

/**
 * Minimap: a miniature of the painted battlefield (the same ground textures the world uses,
 * with forests as little canopies), an "uncharted" parchment-dark texture over unexplored land,
 * dimming over remembered areas, outlined markers for buildings, units and resources, and a
 * camera frame. Redrawn a few times per second; tap or drag on it to move the camera.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Painted ground scaled to the minimap (static). */
  private readonly ground: HTMLCanvasElement;
  /** Ground plus forest canopies (redrawn when trees are felled). */
  private readonly base: HTMLCanvasElement;
  /** Texture shown over unexplored land. */
  private readonly unknown: HTMLCanvasElement;
  /** Per-tile fog masks (tile resolution) and the composed fog layer (minimap resolution). */
  private readonly maskU: HTMLCanvasElement;
  private readonly maskE: HTMLCanvasElement;
  private readonly maskUData: ImageData;
  private readonly maskEData: ImageData;
  private readonly fogLayer: HTMLCanvasElement;
  private baseDirty = true;
  private ping: { x: number; y: number; until: number } | null = null;
  private dragging = false;

  constructor(
    slot: HTMLElement,
    world: World,
    private readonly onNavigate: (tx: number, ty: number) => void,
    groundChunks: Array<GroundChunk & { pad: number }> = [],
  ) {
    slot.querySelector('canvas')?.remove();
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    slot.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const w = world.map.width;
    const h = world.map.height;
    this.ground = makeCanvas(SIZE, SIZE);
    this.base = makeCanvas(SIZE, SIZE);
    this.fogLayer = makeCanvas(SIZE, SIZE);
    this.maskU = makeCanvas(w, h);
    this.maskE = makeCanvas(w, h);
    this.maskUData = this.maskU.getContext('2d')!.createImageData(w, h);
    this.maskEData = this.maskE.getContext('2d')!.createImageData(w, h);
    this.unknown = uncharted();
    this.paintGround(world, groundChunks);

    const nav = (e: PointerEvent): void => {
      const r = this.canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      this.onNavigate(fx * w, fy * h);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      nav(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) nav(e);
    });
    const end = (): void => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** Scale the world's painted ground chunks down into the static ground layer. */
  private paintGround(world: World, chunks: Array<GroundChunk & { pad: number }>): void {
    const c = this.ground.getContext('2d')!;
    const w = world.map.width;
    const h = world.map.height;
    const sx = SIZE / w;
    const sy = SIZE / h;
    if (chunks.length === 0) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          c.fillStyle = TERRAIN_RGB[world.map.tiles[y * w + x] as number] ?? '#000';
          c.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
        }
      return;
    }
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    for (const ch of chunks) {
      const cw = ch.canvas.width - ch.pad * 2;
      const chh = ch.canvas.height - ch.pad * 2;
      const tw = cw / GROUND_PX;
      const th = chh / GROUND_PX;
      c.drawImage(ch.canvas, ch.pad, ch.pad, cw, chh, ch.tx * sx, ch.ty * sy, tw * sx, th * sy);
    }
    // A touch of contrast and saturation so it reads at thumbnail size.
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(0, 0, SIZE, SIZE);
    c.globalCompositeOperation = 'source-over';
  }

  /** Ground + forest canopies. */
  private paintBase(world: World): void {
    const c = this.base.getContext('2d')!;
    const w = world.map.width;
    const h = world.map.height;
    const sx = SIZE / w;
    const sy = SIZE / h;
    c.drawImage(this.ground, 0, 0);
    const r = Math.max(1.6, sx * 0.62);
    // Shadow pass, then canopy, then highlight: little round treetops.
    for (const [dx, dy, color] of [
      [0.5, 0.8, 'rgba(10,30,12,0.55)'],
      [0, 0, '#2f6a33'],
      [-0.35, -0.4, '#4f9145'],
    ] as const) {
      c.fillStyle = color;
      c.beginPath();
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (world.map.tiles[y * w + x] !== Terrain.Forest) continue;
          const jx = (tileHash(x, y, 3) - 0.5) * sx * 0.4;
          const jy = (tileHash(x, y, 4) - 0.5) * sy * 0.4;
          const cx = (x + 0.5) * sx + jx + dx * r * 0.6;
          const cy = (y + 0.5) * sy + jy + dy * r * 0.6;
          const rr = color === '#4f9145' ? r * 0.45 : r;
          c.moveTo(cx + rr, cy);
          c.arc(cx, cy, rr, 0, Math.PI * 2);
        }
      c.fill();
    }
  }

  /** Terrain changed (tree cut). */
  markDirty(): void {
    this.baseDirty = true;
  }

  flash(x: number, y: number, now: number): void {
    this.ping = { x, y, until: now + 4000 };
  }

  draw(
    world: World,
    me: number,
    view: { x: number; y: number; w: number; h: number },
    now: number,
  ): void {
    const w = world.map.width;
    const h = world.map.height;
    if (this.baseDirty) {
      this.baseDirty = false;
      this.paintBase(world);
    }
    const c = this.ctx;
    const sx = SIZE / w;
    const sy = SIZE / h;
    c.drawImage(this.base, 0, 0);
    const fog = world.fog[me];

    // Resources and buildings first (they sit under the fog's dimming when only remembered).
    for (const e of world.entities) {
      if (e.dead || e.inside >= 0 || e.kind === 'unit') continue;
      const f = fog ? fog[Math.floor(e.y) * w + Math.floor(e.x)] : 2;
      if (e.owner !== me && f === 0) continue;
      const x = e.tileX * sx;
      const y = e.tileY * sy;
      const s = e.size * sx;
      if (e.kind === 'resource') {
        if (e.def === 'gold') diamond(c, x + s / 2, y + s / 2, s * 0.42, '#ffd84a');
        else if (e.def === 'fish')
          ring(c, x + s / 2, y + s / 2, Math.max(2.4, s * 0.38), '#d8f1ff');
        else dot(c, x + s / 2, y + s / 2, Math.max(1.8, s * 0.32), '#ff5d6e');
      } else {
        const color = PALETTE.players[e.owner] ?? '#fff';
        const hall = e.def === 'town_hall';
        roundRect(c, x + 0.5, y + 0.5, s - 1, s - 1, Math.min(3, s * 0.25), color, hall);
      }
    }

    // Fog: uncharted texture over unexplored land, dimming over remembered land.
    if (fog) {
      const u = this.maskUData.data;
      const ex = this.maskEData.data;
      for (let i = 0; i < fog.length; i++) {
        const v = fog[i];
        u[i * 4 + 3] = v === 0 ? 255 : 0;
        ex[i * 4] = 8;
        ex[i * 4 + 1] = 12;
        ex[i * 4 + 2] = 20;
        ex[i * 4 + 3] = v === 1 ? 120 : 0;
      }
      this.maskU.getContext('2d')!.putImageData(this.maskUData, 0, 0);
      this.maskE.getContext('2d')!.putImageData(this.maskEData, 0, 0);
      const fl = this.fogLayer.getContext('2d')!;
      fl.globalCompositeOperation = 'source-over';
      fl.clearRect(0, 0, SIZE, SIZE);
      fl.imageSmoothingEnabled = true;
      fl.drawImage(this.maskU, 0, 0, SIZE, SIZE);
      fl.globalCompositeOperation = 'source-in';
      fl.drawImage(this.unknown, 0, 0);
      fl.globalCompositeOperation = 'source-over';
      c.imageSmoothingEnabled = true;
      c.drawImage(this.maskE, 0, 0, SIZE, SIZE);
    }

    // Units (only those currently seen) on top of the dimming.
    for (const e of world.entities) {
      if (e.dead || e.inside >= 0 || e.kind !== 'unit') continue;
      if (e.owner !== me && fog && fog[Math.floor(e.y) * w + Math.floor(e.x)] !== 2) continue;
      dot(c, e.x * sx, e.y * sy, e.cls === 'worker' ? 2 : 2.6, PALETTE.players[e.owner] ?? '#fff');
    }
    if (fog) c.drawImage(this.fogLayer, 0, 0);

    // Camera frame: soft fill, dark outline under a bright one, corner brackets.
    const fx = view.x * sx;
    const fy = view.y * sy;
    const fw = view.w * sx;
    const fh = view.h * sy;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(fx, fy, fw, fh);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 3.5;
    c.strokeRect(fx, fy, fw, fh);
    c.strokeStyle = 'rgba(255,248,225,0.9)';
    c.lineWidth = 1.5;
    c.strokeRect(fx, fy, fw, fh);
    const k = Math.min(10, fw * 0.25, fh * 0.25);
    c.strokeStyle = '#ffe9a6';
    c.lineWidth = 3;
    c.beginPath();
    for (const [px, py, dx, dy] of [
      [fx, fy, 1, 1],
      [fx + fw, fy, -1, 1],
      [fx, fy + fh, 1, -1],
      [fx + fw, fy + fh, -1, -1],
    ] as const) {
      c.moveTo(px + dx * k, py);
      c.lineTo(px, py);
      c.lineTo(px, py + dy * k);
    }
    c.stroke();

    // Attack ping: expanding double ring.
    if (this.ping && now < this.ping.until) {
      for (const off of [0, 0.5]) {
        const t = (((now / 900 + off) % 1) + 1) % 1;
        c.strokeStyle = `rgba(255,80,80,${1 - t})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(this.ping.x * sx, this.ping.y * sy, 5 + t * 22, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // Inner vignette so the map sits inside its frame.
    const g = c.createRadialGradient(
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.36,
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE, SIZE);
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/** Dark "uncharted" texture: deep blue-slate with mottling and faint cartographer's hatching. */
function uncharted(): HTMLCanvasElement {
  const cv = makeCanvas(SIZE, SIZE);
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(SIZE / 2, SIZE / 2, 10, SIZE / 2, SIZE / 2, SIZE * 0.75);
  g.addColorStop(0, '#24202e');
  g.addColorStop(1, '#141219');
  c.fillStyle = g;
  c.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 260; i++) {
    const x = tileHash(i, 1, 9) * SIZE;
    const y = tileHash(i, 2, 9) * SIZE;
    c.fillStyle = `rgba(${tileHash(i, 3, 9) < 0.5 ? '60,52,74' : '10,8,14'},0.35)`;
    c.beginPath();
    c.arc(x, y, 2 + tileHash(i, 4, 9) * 7, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(201,162,74,0.08)';
  c.lineWidth = 1;
  c.beginPath();
  for (let d = -SIZE; d < SIZE; d += 7) {
    c.moveTo(d, 0);
    c.lineTo(d + SIZE, SIZE);
  }
  c.stroke();
  return cv;
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.beginPath();
  c.arc(x, y, r + 0.9, 0, Math.PI * 2);
  c.fillStyle = 'rgba(0,0,0,0.75)';
  c.fill();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.lineWidth = 2.6;
  c.strokeStyle = 'rgba(0,30,60,0.6)';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 1.3;
  c.strokeStyle = color;
  c.stroke();
}

function diamond(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.lineWidth = 1.2;
  c.strokeStyle = 'rgba(70,45,0,0.9)';
  c.stroke();
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  gold: boolean,
): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
  // Light top edge for a little relief.
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.25));
  c.lineWidth = gold ? 2 : 1.2;
  c.strokeStyle = gold ? '#ffd86a' : 'rgba(0,0,0,0.85)';
  c.stroke();
}
