/**
 * Deterministic 2D value noise using only integer hashing and polynomial interpolation
 * (no sin/cos), so it is bit-identical across JS engines.
 */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Single octave of value noise in [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** Fractal (multi-octave) value noise normalised to [0, 1). */
export function fractalNoise(
  x: number,
  y: number,
  seed: number,
  scale: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1 / scale;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, (seed + o * 0x9e3779b1) | 0) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Cheap per-tile hash in [0, 1), handy for visual variants. */
export function tileHash(x: number, y: number, seed = 0): number {
  return hash2(x, y, seed);
}
