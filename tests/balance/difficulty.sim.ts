import { expect, it } from 'vitest';
import type { Difficulty } from '../../src/sim/world';
import { FACTION_IDS, runMatch, seedList, type MatchResult } from './lab';

/**
 * Difficulty ladder: Hard vs Normal, Normal vs Easy and Hard vs Easy for every faction pairing
 * (mirrors included), alternating seats, over several seeds. Reports win rates and match length.
 *
 *   SEEDS=1,2,3,4 npm run balance -- difficulty     (default 4 seeds = 108 games)
 *
 * Faster in parallel: `node scripts/ai-lab.mjs ladder 1-8`.
 * Targets: Normal beats Easy >= 80%, Hard beats Normal >= 70%, Hard beats Easy >= 95%.
 */
const LADDER: Array<[Difficulty, Difficulty, number]> = [
  ['hard', 'normal', 0.7],
  ['normal', 'easy', 0.8],
  ['hard', 'easy', 0.95],
];

it('difficulty ladder', () => {
  const lines: string[] = [];
  const rates: number[] = [];
  for (const [hi, lo, target] of LADDER) {
    let hiWins = 0;
    let draws = 0;
    let minutes = 0;
    let n = 0;
    for (const seed of seedList('1,2,3,4'))
      for (const fa of FACTION_IDS)
        for (const fb of FACTION_IDS) {
          const hiSeat = (seed + FACTION_IDS.indexOf(fa)) % 2;
          const hiS = { faction: fa, ai: hi };
          const loS = { faction: fb, ai: lo };
          const r: MatchResult = runMatch({
            seed,
            seats: hiSeat === 0 ? [hiS, loS] : [loS, hiS],
            maxMin: 45,
          });
          expect(r.error).toBeUndefined();
          n++;
          minutes += r.minutes;
          if (r.winner === hiSeat) hiWins++;
          else if (r.winner < 0) draws++;
        }
    rates.push(hiWins / n);
    lines.push(
      `${hi} vs ${lo}: ${((100 * hiWins) / n).toFixed(0)}% (${hiWins}/${n}, ${draws} draws, ` +
        `target ${target * 100}%), avg ${(minutes / n).toFixed(1)} min`,
    );
  }
  console.log(lines.join('\n'));
  // Generous floors (noise at ~36 games per pairing is about ±8%).
  expect(rates[0]).toBeGreaterThan(0.55);
  expect(rates[1]).toBeGreaterThan(0.65);
  expect(rates[2]).toBeGreaterThan(0.85);
}, 3_600_000);
