/**
 * Engine-agnostic touch/mouse gesture recognizer.
 *
 * Feed it raw pointer events (screen pixels + timestamps) and call `update(now)` once per frame;
 * it emits high-level gestures: tap, double tap, long press, one-finger pan (with release
 * velocity for inertia) and two-finger pinch (scale + centre movement).
 *
 * Pure logic with no DOM access so it is fully unit-testable.
 */
export type GestureEvent =
  | { type: 'tap'; x: number; y: number }
  | { type: 'doubletap'; x: number; y: number }
  | { type: 'longpress'; x: number; y: number }
  | { type: 'panstart'; x: number; y: number }
  | { type: 'pan'; x: number; y: number; dx: number; dy: number }
  | { type: 'panend'; x: number; y: number; vx: number; vy: number }
  | { type: 'pinchstart'; cx: number; cy: number }
  | { type: 'pinch'; cx: number; cy: number; scale: number; dx: number; dy: number }
  | { type: 'pinchend' };

export interface GestureOptions {
  /** Movement (px) a finger may drift and still count as a tap / long press. */
  tapSlop: number;
  /** Max press duration (ms) for a tap. */
  tapMaxMs: number;
  /** Max time (ms) between two taps for a double tap. */
  doubleTapMs: number;
  /** Max distance (px) between two taps for a double tap. */
  doubleTapSlop: number;
  /** Hold time (ms) for a long press. */
  longPressMs: number;
  /** Pan release velocity is zeroed if the finger rested this long (ms) before lifting. */
  flingIdleMs: number;
}

export const DEFAULT_GESTURE_OPTIONS: GestureOptions = {
  tapSlop: 12,
  tapMaxMs: 450,
  doubleTapMs: 320,
  doubleTapSlop: 40,
  longPressMs: 500,
  flingIdleMs: 80,
};

interface Ptr {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
}

type Mode = 'idle' | 'pending' | 'pan' | 'pinch' | 'longpressed' | 'ignore';

export class GestureRecognizer {
  private readonly opts: GestureOptions;
  private readonly emit: (e: GestureEvent) => void;
  private readonly ptrs: Ptr[] = [];
  private mode: Mode = 'idle';
  private lastTap: { x: number; y: number; t: number } | null = null;
  private pinchDist = 0;
  private pinchCx = 0;
  private pinchCy = 0;
  // Pan velocity tracking (px/ms), exponentially smoothed.
  private vx = 0;
  private vy = 0;
  private lastMoveT = 0;

  constructor(emit: (e: GestureEvent) => void, opts: Partial<GestureOptions> = {}) {
    this.emit = emit;
    this.opts = { ...DEFAULT_GESTURE_OPTIONS, ...opts };
  }

  /** Number of pointers currently down (tracked ones only, max 2). */
  get activePointers(): number {
    return this.ptrs.length;
  }

  get currentMode(): Mode {
    return this.mode;
  }

  pointerDown(id: number, x: number, y: number, t: number): void {
    if (this.ptrs.length >= 2) return; // third+ finger is ignored
    this.ptrs.push({ id, x, y, startX: x, startY: y, startT: t });
    if (this.ptrs.length === 1) {
      this.mode = 'pending';
      return;
    }
    // Second finger: whatever we were doing becomes a pinch.
    if (this.mode === 'pan') {
      this.emit({ type: 'panend', x: this.ptrs[0]!.x, y: this.ptrs[0]!.y, vx: 0, vy: 0 });
    }
    this.startPinch();
  }

  pointerMove(id: number, x: number, y: number, t: number): void {
    const p = this.ptrs.find((q) => q.id === id);
    if (!p) return;
    const prevX = p.x;
    const prevY = p.y;
    p.x = x;
    p.y = y;

    switch (this.mode) {
      case 'pending': {
        if (Math.hypot(x - p.startX, y - p.startY) > this.opts.tapSlop) {
          this.mode = 'pan';
          this.vx = 0;
          this.vy = 0;
          this.lastMoveT = t;
          this.emit({ type: 'panstart', x: p.startX, y: p.startY });
          this.emit({ type: 'pan', x, y, dx: x - p.startX, dy: y - p.startY });
        }
        break;
      }
      case 'pan': {
        const dt = Math.max(1, t - this.lastMoveT);
        const dx = x - prevX;
        const dy = y - prevY;
        // Smooth velocity so a single jittery sample doesn't produce a wild fling.
        this.vx = this.vx * 0.4 + (dx / dt) * 0.6;
        this.vy = this.vy * 0.4 + (dy / dt) * 0.6;
        this.lastMoveT = t;
        this.emit({ type: 'pan', x, y, dx, dy });
        break;
      }
      case 'pinch': {
        const [a, b] = this.ptrs as [Ptr, Ptr];
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.emit({
          type: 'pinch',
          cx,
          cy,
          scale: dist / this.pinchDist,
          dx: cx - this.pinchCx,
          dy: cy - this.pinchCy,
        });
        this.pinchDist = dist;
        this.pinchCx = cx;
        this.pinchCy = cy;
        break;
      }
      default:
        break;
    }
  }

  pointerUp(id: number, x: number, y: number, t: number): void {
    const idx = this.ptrs.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const p = this.ptrs[idx]!;
    p.x = x;
    p.y = y;
    this.ptrs.splice(idx, 1);

    switch (this.mode) {
      case 'pending': {
        if (t - p.startT <= this.opts.tapMaxMs) this.emitTap(p.startX, p.startY, t);
        this.mode = 'idle';
        break;
      }
      case 'pan': {
        const idle = t - this.lastMoveT > this.opts.flingIdleMs;
        this.emit({ type: 'panend', x, y, vx: idle ? 0 : this.vx, vy: idle ? 0 : this.vy });
        this.mode = 'idle';
        break;
      }
      case 'pinch': {
        this.emit({ type: 'pinchend' });
        // Continue as a pan with the remaining finger (no jump: re-anchor at its position).
        const rest = this.ptrs[0];
        if (rest) {
          rest.startX = rest.x;
          rest.startY = rest.y;
          this.mode = 'pan';
          this.vx = 0;
          this.vy = 0;
          this.lastMoveT = t;
          this.emit({ type: 'panstart', x: rest.x, y: rest.y });
        } else {
          this.mode = 'idle';
        }
        break;
      }
      default:
        if (this.ptrs.length === 0) this.mode = 'idle';
        break;
    }
  }

  pointerCancel(id: number, t: number): void {
    const p = this.ptrs.find((q) => q.id === id);
    if (!p) return;
    if (this.mode === 'pending') {
      // A cancelled touch must never turn into a tap.
      this.ptrs.splice(this.ptrs.indexOf(p), 1);
      this.mode = this.ptrs.length ? 'ignore' : 'idle';
      return;
    }
    this.pointerUp(id, p.x, p.y, t);
  }

  /** Call every frame: detects long presses (which fire while the finger is still down). */
  update(t: number): void {
    if (this.mode !== 'pending' || this.ptrs.length !== 1) return;
    const p = this.ptrs[0]!;
    if (t - p.startT >= this.opts.longPressMs) {
      this.mode = 'longpressed';
      this.lastTap = null;
      this.emit({ type: 'longpress', x: p.startX, y: p.startY });
    }
  }

  private startPinch(): void {
    const [a, b] = this.ptrs as [Ptr, Ptr];
    this.mode = 'pinch';
    this.pinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.pinchCx = (a.x + b.x) / 2;
    this.pinchCy = (a.y + b.y) / 2;
    this.lastTap = null;
    this.emit({ type: 'pinchstart', cx: this.pinchCx, cy: this.pinchCy });
  }

  private emitTap(x: number, y: number, t: number): void {
    this.emit({ type: 'tap', x, y });
    const lt = this.lastTap;
    if (
      lt &&
      t - lt.t <= this.opts.doubleTapMs &&
      Math.hypot(x - lt.x, y - lt.y) <= this.opts.doubleTapSlop
    ) {
      this.emit({ type: 'doubletap', x, y });
      this.lastTap = null; // a triple tap is a double tap + a fresh tap
    } else {
      this.lastTap = { x, y, t };
    }
  }
}
