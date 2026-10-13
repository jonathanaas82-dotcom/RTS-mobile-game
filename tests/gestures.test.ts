import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type GestureEvent } from '../src/ui/input/gestures';

function setup() {
  const events: GestureEvent[] = [];
  const g = new GestureRecognizer((e) => events.push(e));
  const types = () => events.map((e) => e.type);
  return { g, events, types };
}

describe('GestureRecognizer', () => {
  it('recognises a tap', () => {
    const { g, types, events } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 104, 102, 50); // within slop
    g.pointerUp(1, 104, 102, 120);
    expect(types()).toEqual(['tap']);
    expect(events[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('a slow press is not a tap', () => {
    const { g, types } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 100, 100, 480);
    expect(types()).toEqual([]);
  });

  it('recognises a double tap', () => {
    const { g, types } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 100, 100, 80);
    g.pointerDown(2, 110, 105, 200);
    g.pointerUp(2, 110, 105, 260);
    expect(types()).toEqual(['tap', 'tap', 'doubletap']);
  });

  it('two far-apart taps are not a double tap', () => {
    const { g, types } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 100, 100, 80);
    g.pointerDown(2, 300, 100, 200);
    g.pointerUp(2, 300, 100, 260);
    expect(types()).toEqual(['tap', 'tap']);
  });

  it('recognises a long press via update()', () => {
    const { g, types } = setup();
    g.pointerDown(1, 50, 50, 0);
    g.update(300);
    expect(types()).toEqual([]);
    g.update(520);
    g.pointerUp(1, 50, 50, 700);
    expect(types()).toEqual(['longpress']);
  });

  it('pans with deltas and reports fling velocity', () => {
    const { g, events, types } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 120, 100, 16);
    g.pointerMove(1, 140, 100, 32);
    g.pointerMove(1, 160, 100, 48);
    g.pointerUp(1, 160, 100, 50);
    expect(types()).toEqual(['panstart', 'pan', 'pan', 'pan', 'panend']);
    const totalDx = events
      .filter((e) => e.type === 'pan')
      .reduce((s, e) => s + (e as { dx: number }).dx, 0);
    expect(totalDx).toBe(60);
    const end = events.at(-1) as { vx: number; vy: number };
    expect(end.vx).toBeGreaterThan(0.5);
    expect(end.vy).toBe(0);
  });

  it('no fling if the finger rested before release', () => {
    const { g, events } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 150, 100, 16);
    g.pointerUp(1, 150, 100, 300);
    expect(events.at(-1)).toMatchObject({ type: 'panend', vx: 0, vy: 0 });
  });

  it('pinches with relative scale and continues as pan when one finger lifts', () => {
    const { g, events, types } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 10);
    g.pointerMove(2, 300, 100, 30); // distance 100 -> 200
    const pinch = events.find((e) => e.type === 'pinch') as { scale: number; dx: number };
    expect(pinch.scale).toBeCloseTo(2);
    expect(pinch.dx).toBeCloseTo(50);
    g.pointerUp(2, 300, 100, 60);
    g.pointerMove(1, 90, 100, 70);
    expect(types()).toEqual(['pinchstart', 'pinch', 'pinchend', 'panstart', 'pan']);
    // The continued pan must not jump: delta is just the 10 px the finger moved.
    expect(events.at(-1)).toMatchObject({ dx: -10 });
  });

  it('a second finger during pan ends the pan and starts a pinch', () => {
    const { g, types } = setup();
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 140, 100, 20);
    g.pointerDown(2, 300, 300, 30);
    expect(types()).toEqual(['panstart', 'pan', 'panend', 'pinchstart']);
  });

  it('ignores a third finger and cancelled touches never tap', () => {
    const { g, types } = setup();
    g.pointerDown(1, 0, 0, 0);
    g.pointerCancel(1, 10);
    g.pointerDown(2, 0, 0, 20);
    g.pointerDown(3, 50, 0, 21);
    g.pointerDown(4, 90, 0, 22);
    expect(g.activePointers).toBe(2);
    expect(types()).toEqual(['pinchstart']);
  });
});
