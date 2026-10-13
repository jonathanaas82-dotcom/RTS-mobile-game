import { describe, expect, it } from 'vitest';
import { CameraModel } from '../src/render/camera/CameraModel';

function cam() {
  const c = new CameraModel({
    worldWidth: 4000,
    worldHeight: 4000,
    minZoom: 0.25,
    maxZoom: 4,
    overscroll: 100,
  });
  c.setViewport(800, 400);
  c.centerOn(2000, 2000);
  return c;
}

describe('CameraModel', () => {
  it('pans opposite to finger movement scaled by zoom', () => {
    const c = cam();
    c.zoom = 2;
    c.panByScreen(100, -50);
    expect(c.centerX).toBe(1950);
    expect(c.centerY).toBe(2025);
  });

  it('round-trips screen/world coordinates', () => {
    const c = cam();
    c.zoom = 1.5;
    const w = c.screenToWorld(123, 321);
    const s = c.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(321);
  });

  it('keeps the world point under the pinch centre fixed while zooming', () => {
    const c = cam();
    const before = c.screenToWorld(600, 100);
    c.zoomAt(1.7, 600, 100);
    const after = c.screenToWorld(600, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom and position', () => {
    const c = cam();
    c.zoomAt(100, 400, 200);
    expect(c.zoom).toBe(4);
    c.zoomAt(0.0001, 400, 200);
    expect(c.zoom).toBe(0.25);
    c.zoom = 1;
    c.centerOn(-5000, 99999);
    expect(c.centerX).toBe(400 - 100);
    expect(c.centerY).toBe(4000 - 200 + 100);
  });

  it('fling decays and stops', () => {
    const c = cam();
    c.fling(1, 0);
    const x0 = c.centerX;
    for (let i = 0; i < 200; i++) c.update(16);
    expect(c.centerX).toBeLessThan(x0);
    expect(c.isFlinging).toBe(false);
  });
});
