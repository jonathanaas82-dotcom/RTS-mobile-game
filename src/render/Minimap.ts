import { PALETTE } from './assets/palette';
import { Terrain } from '../sim/map/terrain';
import type { World } from '../sim/world';

const TERRAIN_RGB: Record<number, [number, number, number]> = {
  [Terrain.Grass]: [94, 155, 71],
  [Terrain.Sand]: [216, 195, 133],
  [Terrain.Forest]: [38, 92, 44],
  [Terrain.Water]: [47, 111, 174],
  [Terrain.Cliff]: [125, 115, 104],
};

/**
 * Minimap: terrain + fog + unit dots + camera frame, drawn into a small DOM canvas a few times
 * per second. Tap or drag on it to move the camera; attack pings flash on it.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly baseData: ImageData;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogCtx: CanvasRenderingContext2D;
  private readonly fogData: ImageData;
  private baseDirty = true;
  private ping: { x: number; y: number; until: number } | null = null;
  private dragging = false;

  constructor(
    slot: HTMLElement,
    world: World,
    private readonly onNavigate: (tx: number, ty: number) => void,
  ) {
    slot.querySelector('canvas')?.remove();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 224;
    this.canvas.height = 224;
    slot.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const w = world.map.width;
    const h = world.map.height;
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    this.baseCtx = this.base.getContext('2d')!;
    this.baseData = this.baseCtx.createImageData(w, h);
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = w;
    this.fogCanvas.height = h;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    this.fogData = this.fogCtx.createImageData(w, h);

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
      const px = this.baseData.data;
      for (let i = 0; i < w * h; i++) {
        const c = TERRAIN_RGB[world.map.tiles[i] as number] ?? [0, 0, 0];
        px[i * 4] = c[0];
        px[i * 4 + 1] = c[1];
        px[i * 4 + 2] = c[2];
        px[i * 4 + 3] = 255;
      }
      this.baseCtx.putImageData(this.baseData, 0, 0);
    }
    const fog = world.fog[me];
    if (fog) {
      const px = this.fogData.data;
      for (let i = 0; i < fog.length; i++) {
        px[i * 4] = 6;
        px[i * 4 + 1] = 10;
        px[i * 4 + 2] = 8;
        px[i * 4 + 3] = fog[i] === 2 ? 0 : fog[i] === 1 ? 110 : 255;
      }
      this.fogCtx.putImageData(this.fogData, 0, 0);
    }
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sx = W / w;
    const sy = H / h;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.base, 0, 0, W, H);
    // Entities: resources, buildings (if explored), units (if visible).
    for (const e of world.entities) {
      if (e.dead) continue;
      const i = Math.floor(e.y) * w + Math.floor(e.x);
      const f = fog ? fog[i] : 2;
      if (e.owner !== me) {
        if (e.kind === 'unit' && f !== 2) continue;
        if (e.kind !== 'unit' && f === 0) continue;
      }
      if (e.kind === 'resource') {
        c.fillStyle = e.def === 'gold' ? '#ffd84a' : '#ff6b7a';
        c.fillRect(e.tileX * sx, e.tileY * sy, e.size * sx, e.size * sy);
      } else if (e.kind === 'building') {
        c.fillStyle = PALETTE.players[e.owner] ?? '#fff';
        c.fillRect(e.tileX * sx, e.tileY * sy, e.size * sx, e.size * sy);
        c.strokeStyle = '#000';
        c.lineWidth = 1;
        c.strokeRect(e.tileX * sx, e.tileY * sy, e.size * sx, e.size * sy);
      } else {
        c.fillStyle = PALETTE.players[e.owner] ?? '#fff';
        c.fillRect(e.x * sx - 2, e.y * sy - 2, 4, 4);
      }
    }
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fogCanvas, 0, 0, W, H);
    // Camera frame.
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.strokeRect(view.x * sx, view.y * sy, view.w * sx, view.h * sy);
    // Attack ping.
    if (this.ping && now < this.ping.until) {
      const k = (((now / 250) % 1) + 1) % 1;
      c.strokeStyle = `rgba(229,72,77,${1 - k})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(this.ping.x * sx, this.ping.y * sy, 6 + k * 18, 0, Math.PI * 2);
      c.stroke();
    }
  }
}
