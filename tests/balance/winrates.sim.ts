import { it } from 'vitest';
import { createMatch } from '../../src/game/match';
import type { FactionId } from '../../src/data/types';
import { FACTIONS } from '../../src/data';
/**
 * Win-rate report: Normal AI vs Normal AI for every faction pairing in both seats.
 * Usage: SEEDS=21,22,23 npm run balance -- winrates   (default 8 seeds = 48 games)
 */
it('win rates', () => {
  const pairs: Array<[FactionId, FactionId]> = [
    ['hrimfolk', 'aurelian'],
    ['aurelian', 'hrimfolk'],
    ['hrimfolk', 'sahrun'],
    ['sahrun', 'hrimfolk'],
    ['aurelian', 'sahrun'],
    ['sahrun', 'aurelian'],
  ];
  const wins: Record<string, number> = {};
  const vs: Record<string, number> = {};
  for (const seed of (process.env.SEEDS ?? '21,22,23,24,25,26,27,28').split(',').map(Number))
    for (const [a, b] of pairs) {
      const fa = FACTIONS.find((f) => f.id === a)!;
      const fb = FACTIONS.find((f) => f.id === b)!;
      const { sim } = createMatch({
        seed,
        mapSize: 64,
        players: [
          { faction: a, majorGod: fa.majorGods[seed % 2]!, ai: 'normal' },
          { faction: b, majorGod: fb.majorGods[(seed + 1) % 2]!, ai: 'normal' },
        ],
      });
      const w = sim.world;
      let t = 0;
      while (w.winner < 0 && t < 40 * 60 * 20) {
        sim.step();
        sim.drainEvents();
        t++;
      }
      if (w.winner >= 0) {
        const f = w.players[w.winner]!.faction;
        wins[f] = (wins[f] ?? 0) + 1;
        const l = f === a ? b : a;
        vs[`${f}>${l}`] = (vs[`${f}>${l}`] ?? 0) + 1;
      } else vs.draw = (vs.draw ?? 0) + 1;
    }
  const out: string[] = [JSON.stringify(wins), JSON.stringify(vs)];
  console.log(out.join('\n'));
}, 1800000);
