/** Core simulation timing. Balance-independent but kept in data so it is tunable in one place. */
export const SIM = {
  /** Fixed simulation rate. All durations in data files are expressed in seconds and converted. */
  ticksPerSecond: 20,
  /** Upper bound of sim steps executed per rendered frame (prevents the "spiral of death"). */
  maxStepsPerFrame: 8,
} as const;

export const TICK_MS = 1000 / SIM.ticksPerSecond;

/** Convert a duration in seconds (as written in data files) to whole ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * SIM.ticksPerSecond));
}
