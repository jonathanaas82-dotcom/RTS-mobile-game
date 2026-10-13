import type { GestureRecognizer } from '../../ui/input/gestures';

/**
 * Bridges DOM pointer events on the game canvas to the gesture recognizer, in CSS pixels.
 * We bypass Phaser's input system: all world hit-testing happens in sim coordinates anyway, and
 * pointer capture gives reliable multi-touch tracking even when fingers leave the canvas.
 */
export class PointerInput {
  private readonly el: HTMLElement;
  private readonly g: GestureRecognizer;
  private readonly onWheel: (deltaY: number, x: number, y: number) => void;
  private readonly abort = new AbortController();

  constructor(
    el: HTMLElement,
    g: GestureRecognizer,
    onWheel: (deltaY: number, x: number, y: number) => void,
  ) {
    this.el = el;
    this.g = g;
    this.onWheel = onWheel;
    const opts = { signal: this.abort.signal };
    el.addEventListener('pointerdown', this.down, opts);
    el.addEventListener('pointermove', this.move, opts);
    el.addEventListener('pointerup', this.up, opts);
    el.addEventListener('pointercancel', this.cancel, opts);
    el.addEventListener('wheel', this.wheel, { ...opts, passive: false });
  }

  destroy(): void {
    this.abort.abort();
  }

  private local(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private readonly down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.el.setPointerCapture(e.pointerId);
    const [x, y] = this.local(e);
    this.g.pointerDown(e.pointerId, x, y, e.timeStamp);
  };

  private readonly move = (e: PointerEvent): void => {
    const [x, y] = this.local(e);
    this.g.pointerMove(e.pointerId, x, y, e.timeStamp);
  };

  private readonly up = (e: PointerEvent): void => {
    const [x, y] = this.local(e);
    this.g.pointerUp(e.pointerId, x, y, e.timeStamp);
  };

  private readonly cancel = (e: PointerEvent): void => {
    this.g.pointerCancel(e.pointerId, e.timeStamp);
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const [x, y] = this.local(e);
    this.onWheel(e.deltaY, x, y);
  };
}
