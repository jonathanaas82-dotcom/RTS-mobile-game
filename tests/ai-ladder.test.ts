import { describe, expect, it } from 'vitest';
import { runMatch } from './balance/lab';

/**
 * Fast deterministic guard for the difficulty ladder (the full report is `npm run balance --
 * difficulty` or `node scripts/ai-lab.mjs ladder`). Fixed seeds, so a failure means the AI or the
 * balance changed in a way that lets a lower difficulty beat a higher one — re-run the full
 * ladder before re-picking seeds.
 */
describe('AI difficulty ladder (regression)', () => {
  it('Hard beats Easy across factions and seats', () => {
    const games = [
      {
        seed: 2,
        seats: [
          { faction: 'sahrun', ai: 'hard' },
          { faction: 'hrimfolk', ai: 'easy' },
        ],
      },
      {
        seed: 3,
        seats: [
          { faction: 'aurelian', ai: 'easy' },
          { faction: 'hrimfolk', ai: 'hard' },
        ],
      },
      {
        seed: 4,
        seats: [
          { faction: 'hrimfolk', ai: 'hard' },
          { faction: 'aurelian', ai: 'easy' },
        ],
      },
    ] as const;
    for (const g of games) {
      const r = runMatch({
        seed: g.seed,
        seats: [{ ...g.seats[0] }, { ...g.seats[1] }],
        maxMin: 35,
      });
      expect(r.error).toBeUndefined();
      expect(r.seats[r.winner]?.ai, `seed ${g.seed}`).toBe('hard');
    }
  }, 120_000);

  it('Easy plays like Easy: advances an age, attacks late, and loses to Normal', () => {
    // Any single match can swing either way: Normal must win at least two of three.
    let normalWins = 0;
    for (const seed of [7, 11, 23]) {
      const r = runMatch({
        seed,
        seats: [
          { faction: 'aurelian', ai: 'normal' },
          { faction: 'sahrun', ai: 'easy' },
        ],
        maxMin: 40,
      });
      expect(r.error).toBeUndefined();
      if (r.winner === 0) normalWins++;
      const easy = r.players[1]!;
      expect(easy.ageAt[1], `seed ${seed}`).toBeGreaterThan(0);
      if (easy.firstAttackMin >= 0) expect(easy.firstAttackMin).toBeGreaterThanOrEqual(8);
    }
    expect(normalWins).toBeGreaterThanOrEqual(2);
  }, 240_000);
});
