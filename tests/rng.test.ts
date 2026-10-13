import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/sim/core/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('produces floats in [0,1) and ints in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('can be snapshotted and restored via state', () => {
    const r = new Rng(1);
    r.next();
    const saved = r.state;
    const x = r.next();
    r.state = saved;
    expect(r.next()).toBe(x);
  });

  it('hashes text seeds stably', () => {
    expect(hashSeed('odin')).toBe(hashSeed('odin'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});
