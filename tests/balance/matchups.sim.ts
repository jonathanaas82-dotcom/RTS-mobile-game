import { it } from 'vitest';
import { createMatch } from '../../src/game/match';
import type { FactionId } from '../../src/data/types';
import { FACTIONS } from '../../src/data';
/** Normal vs Normal across factions and seeds: prints winners and match lengths. */
it('balance report', () => {
  const res: string[] = [];
  const pairs: Array<[FactionId, FactionId]> = [
    ['hrimfolk', 'aurelian'],
    ['aurelian', 'sahrun'],
    ['sahrun', 'hrimfolk'],
  ];
  for (const seed of [11, 12, 13])
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
      let t = 0;
      while (sim.world.winner < 0 && t < 45 * 60 * 20) {
        sim.step();
        t++;
      }
      const w = sim.world;
      res.push(
        `seed ${seed} ${a} vs ${b}: winner ${w.winner} (${w.winner >= 0 ? w.players[w.winner]!.faction : '-'}) at ${(t / 20 / 60).toFixed(1)} min ages ${w.players.map((p) => p.age).join('/')}`,
      );
    }
  console.log(res.join('\n'));
}, 900000);
