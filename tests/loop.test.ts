import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/sim/core/loop';

function make(stepMs = 50, max = 8) {
  let steps = 0;
  const loop = new FixedStepLoop({ stepMs, maxStepsPerFrame: max, onStep: () => steps++ });
  return { loop, steps: () => steps };
}

describe('FixedStepLoop', () => {
  it('runs steps at a fixed rate independent of frame rate', () => {
    const { loop, steps } = make();
    for (let i = 0; i < 60; i++) loop.advance(1000 / 60); // 1 s at 60 fps
    expect(steps()).toBe(20);
  });

  it('returns interpolation alpha', () => {
    const { loop } = make();
    expect(loop.advance(25)).toBeCloseTo(0.5);
    expect(loop.advance(50)).toBeCloseTo(0.5);
  });

  it('doubles step count at 2x speed', () => {
    const { loop, steps } = make();
    loop.speed = 2;
    for (let i = 0; i < 60; i++) loop.advance(1000 / 60);
    expect(steps()).toBe(40);
  });

  it('does nothing while paused', () => {
    const { loop, steps } = make();
    loop.paused = true;
    loop.advance(1000);
    expect(steps()).toBe(0);
  });

  it('clamps long frames to avoid a spiral of death', () => {
    const { loop, steps } = make(50, 3);
    loop.advance(10_000);
    expect(steps()).toBe(3);
    expect(loop.alpha).toBe(0);
  });
});
