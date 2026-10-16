import { expect, it } from 'vitest';
import type { Difficulty } from '../../src/sim/world';
import { FACTION_IDS, runMatch, seedList, type HealthIssue, type MatchResult } from './lab';

/**
 * AI health check: every difficulty x faction against a same-difficulty opponent, plus Easy vs
 * the tutorial AI. Flags silly failure modes (idle workers, pop-cap stalls, hoarding, no army,
 * slow ages, exceptions, draws). See tests/balance/lab.ts for the exact criteria.
 *
 *   SEEDS=1,2,3,4 npm run balance -- health
 *
 * Faster in parallel: `node scripts/ai-lab.mjs health 1-8`.
 */
it('AI health', () => {
  const results: MatchResult[] = [];
  const seeds = seedList('1,2,3');
  for (const seed of seeds)
    for (const ai of ['easy', 'normal', 'hard'] as Difficulty[])
      for (const fa of FACTION_IDS) {
        const fb = FACTION_IDS[(FACTION_IDS.indexOf(fa) + seed) % FACTION_IDS.length]!;
        results.push(
          runMatch({
            seed,
            seats: [
              { faction: fa, ai },
              { faction: fb, ai },
            ],
            health: true,
          }),
        );
      }
  for (const seed of seeds)
    results.push(
      runMatch({
        seed,
        seats: [
          { faction: FACTION_IDS[seed % 3]!, ai: 'passive' },
          { faction: FACTION_IDS[(seed + 1) % 3]!, ai: 'passive' },
        ],
        maxMin: 15,
        health: true,
      }),
    );
  const issues: Array<HealthIssue & { m: MatchResult }> = results.flatMap((m) =>
    m.issues.map((i) => ({ ...i, m })),
  );
  const byKind = new Map<string, string[]>();
  for (const i of issues) {
    const who = i.player >= 0 ? `${i.m.seats[i.player]!.ai}/${i.m.seats[i.player]!.faction}` : '-';
    const k = i.kind;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(`seed ${i.m.seed} ${who} @${i.at}m ${i.detail.split('\n')[0]}`);
  }
  const lines = [`${results.length} games, ${issues.length} issues`];
  for (const [k, v] of byKind)
    lines.push(`  ${k}: ${v.length}\n    ${v.slice(0, 5).join('\n    ')}`);
  console.log(lines.join('\n'));

  const count = (k: string): number => byKind.get(k)?.length ?? 0;
  expect(count('exception')).toBe(0);
  // Passive (tutorial) AIs never field an army.
  for (const m of results.filter((r) => r.seats[0].ai === 'passive'))
    expect(m.players.every((p) => p.armyTrained === 0)).toBe(true);
  // Hard failures: these should not happen at all.
  expect(count('popcap-stall')).toBe(0);
  expect(count('idle-workers')).toBe(0);
  expect(count('no-army')).toBe(0);
  // Soft: allow the occasional chaotic game.
  const games = results.length;
  expect(count('draw')).toBeLessThanOrEqual(Math.ceil(games * 0.06));
  expect(count('popcap-no-wood')).toBeLessThanOrEqual(Math.ceil(games * 0.05));
  expect(
    count('hoard-food') + count('hoard-wood') + count('hoard-gold') + count('hoard-favor'),
  ).toBeLessThanOrEqual(Math.ceil(games * 0.1));
}, 3_600_000);
