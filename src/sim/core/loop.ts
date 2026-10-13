/**
 * Fixed-timestep driver. The renderer calls `advance(frameDt)` once per frame; it runs zero or more
 * simulation steps of exactly `stepMs` and returns the interpolation factor (0..1) between the
 * previous and the current sim state for smooth rendering.
 *
 * Engine-agnostic so it can be unit tested and reused by headless runs (AI tests, replays).
 */
export interface FixedStepOptions {
  stepMs: number;
  maxStepsPerFrame: number;
  onStep: () => void;
}

export class FixedStepLoop {
  /** Game speed multiplier (1 = normal, 2 = double speed). */
  speed = 1;
  paused = false;
  private accumulator = 0;
  private readonly opts: FixedStepOptions;

  constructor(opts: FixedStepOptions) {
    this.opts = opts;
  }

  /**
   * @param frameDtMs real time elapsed since the previous frame.
   * @returns interpolation alpha in [0, 1).
   */
  advance(frameDtMs: number): number {
    if (this.paused) return this.alpha;
    // Clamp huge gaps (tab in background, debugger pause) so we don't fast-forward the match.
    const dt = Math.min(Math.max(frameDtMs, 0), 250) * this.speed;
    this.accumulator += dt;
    const maxSteps = this.opts.maxStepsPerFrame * Math.max(1, Math.ceil(this.speed));
    let steps = 0;
    while (this.accumulator >= this.opts.stepMs && steps < maxSteps) {
      this.opts.onStep();
      this.accumulator -= this.opts.stepMs;
      steps++;
    }
    // Device can't keep up: drop the backlog instead of spiralling.
    if (steps === maxSteps && this.accumulator >= this.opts.stepMs) {
      this.accumulator = 0;
    }
    return this.alpha;
  }

  get alpha(): number {
    return this.accumulator / this.opts.stepMs;
  }
}
