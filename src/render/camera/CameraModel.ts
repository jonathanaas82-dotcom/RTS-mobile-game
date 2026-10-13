/**
 * Camera state and math, independent of Phaser so it can be unit tested.
 * Units: world pixels for positions, "game pixels" (device pixels) for the screen.
 */
export interface CameraLimits {
  worldWidth: number;
  worldHeight: number;
  minZoom: number;
  maxZoom: number;
  /** How far (world px) the view centre may go past the map edge. */
  overscroll: number;
}

export class CameraModel {
  centerX = 0;
  centerY = 0;
  zoom = 1;
  viewWidth = 1;
  viewHeight = 1;
  /** Fling velocity in world px per ms. */
  private flingX = 0;
  private flingY = 0;

  constructor(public limits: CameraLimits) {}

  setViewport(w: number, h: number): void {
    this.viewWidth = Math.max(1, w);
    this.viewHeight = Math.max(1, h);
    this.clamp();
  }

  centerOn(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
    this.stopFling();
    this.clamp();
  }

  /** Drag the world with the finger: content follows the screen delta. */
  panByScreen(dx: number, dy: number): void {
    this.centerX -= dx / this.zoom;
    this.centerY -= dy / this.zoom;
    this.clamp();
  }

  /** Multiply zoom by `factor`, keeping the world point under screen (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clampNum(this.zoom * factor, this.limits.minZoom, this.limits.maxZoom);
    const offX = sx - this.viewWidth / 2;
    const offY = sy - this.viewHeight / 2;
    this.centerX = before.x - offX / this.zoom;
    this.centerY = before.y - offY / this.zoom;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.centerX + (sx - this.viewWidth / 2) / this.zoom,
      y: this.centerY + (sy - this.viewHeight / 2) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.centerX) * this.zoom + this.viewWidth / 2,
      y: (wy - this.centerY) * this.zoom + this.viewHeight / 2,
    };
  }

  /** Start inertial scrolling from a release velocity in screen px/ms. */
  fling(vxScreen: number, vyScreen: number): void {
    this.flingX = -vxScreen / this.zoom;
    this.flingY = -vyScreen / this.zoom;
  }

  stopFling(): void {
    this.flingX = 0;
    this.flingY = 0;
  }

  get isFlinging(): boolean {
    return this.flingX !== 0 || this.flingY !== 0;
  }

  /** Advance inertia. `decayMs` is the time constant of the exponential slowdown. */
  update(dtMs: number, decayMs = 180): void {
    if (!this.isFlinging) return;
    this.centerX += this.flingX * dtMs;
    this.centerY += this.flingY * dtMs;
    const k = Math.exp(-dtMs / decayMs);
    this.flingX *= k;
    this.flingY *= k;
    // Stop once slower than ~0.02 screen px per ms.
    if (Math.hypot(this.flingX, this.flingY) * this.zoom < 0.02) this.stopFling();
    this.clamp();
  }

  clamp(): void {
    const { worldWidth, worldHeight, overscroll } = this.limits;
    const halfW = this.viewWidth / 2 / this.zoom;
    const halfH = this.viewHeight / 2 / this.zoom;
    const cx = clampAxis(this.centerX, halfW, worldWidth, overscroll);
    const cy = clampAxis(this.centerY, halfH, worldHeight, overscroll);
    if (cx !== this.centerX) this.flingX = 0;
    if (cy !== this.centerY) this.flingY = 0;
    this.centerX = cx;
    this.centerY = cy;
  }
}

/** Keep the visible span inside [-overscroll, size + overscroll]; centre it if the view is larger. */
function clampAxis(c: number, half: number, size: number, overscroll: number): number {
  const min = half - overscroll;
  const max = size - half + overscroll;
  if (min > max) return size / 2;
  return clampNum(c, min, max);
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
