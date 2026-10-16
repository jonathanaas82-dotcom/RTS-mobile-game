/**
 * Headless AI lab: runs AI-vs-AI matches and records per-player health metrics. Shared by the
 * balance reports (`npm run balance`), the parallel harness (`node scripts/ai-lab.mjs`) and the
 * fast regression test.
 */
import { FACTIONS, buildingDef, unitDef } from '../../src/data';
import type { FactionId } from '../../src/data/types';
import { createMatch } from '../../src/game/match';
import { costOf } from '../../src/sim/player';
import type { Difficulty, World } from '../../src/sim/world';

export const TPS = 20;
export const FACTION_IDS = FACTIONS.map((f) => f.id) as FactionId[];

export interface Seat {
  faction: FactionId;
  ai: Difficulty;
  /** Major god (default: alternates with seed and seat). */
  god?: string;
}

export interface HealthIssue {
  player: number;
  kind: string;
  /** Match minute when the issue started. */
  at: number;
  detail: string;
}

export interface PlayerReport {
  faction: FactionId;
  ai: Difficulty;
  age: number;
  /** Minute each age was reached (index = age; -1 = never). */
  ageAt: number[];
  firstAttackMin: number;
  armyTrained: number;
  maxWorkers: number;
  peakArmyPop: number;
  townHallLost: number;
  townHallRebuilt: number;
  /** Snapshots at minutes 4, 8, 12, 16: [workers, armyPop, gathered]. */
  snap: Array<[number, number, number]>;
  /** Minute the first building of each type was completed. */
  firstBuilt: Record<string, number>;
  /** God powers cast, by id. */
  casts: Record<string, number>;
}

export interface MatchResult {
  seed: number;
  seats: [Seat, Seat];
  winner: number;
  minutes: number;
  players: PlayerReport[];
  issues: HealthIssue[];
  error?: string;
  /** The map generator left the two bases unconnected on foot (a draw is then unavoidable). */
  disconnected: boolean;
}

export interface RunOptions {
  seed: number;
  seats: [Seat, Seat];
  maxMin?: number;
  mapSize?: number;
  /** Collect health metrics (slightly slower). */
  health?: boolean;
}

interface Tracker {
  idleSince: number;
  capSince: number;
  capShortSince: number;
  hoard: Record<string, number>;
  reported: Set<string>;
  firstAttack: number;
  maxWorkers: number;
  peakArmy: number;
  ageAt: number[];
  hadHall: boolean;
  hallLost: number;
  hallRebuilt: number;
  snap: Array<[number, number, number]>;
  firstBuilt: Record<string, number>;
  casts: Record<string, number>;
}

export function runMatch(o: RunOptions): MatchResult {
  const maxTicks = (o.maxMin ?? 45) * 60 * TPS;
  const players = o.seats.map((s, i) => {
    const f = FACTIONS.find((x) => x.id === s.faction)!;
    return { faction: s.faction, majorGod: s.god ?? f.majorGods[(o.seed + i) % 2]!, ai: s.ai };
  });
  const { sim } = createMatch({ seed: o.seed, mapSize: o.mapSize ?? 64, players });
  const w = sim.world;
  const issues: HealthIssue[] = [];
  const disconnected = !basesConnected(w);
  const tr: Tracker[] = o.seats.map(() => ({
    idleSince: -1,
    capSince: -1,
    capShortSince: -1,
    hoard: {},
    reported: new Set(),
    firstAttack: -1,
    maxWorkers: 0,
    peakArmy: 0,
    ageAt: [0, -1, -1, -1],
    hadHall: true,
    hallLost: 0,
    hallRebuilt: 0,
    snap: [],
    firstBuilt: {},
    casts: {},
  }));
  const report = (pl: number, kind: string, since: number, detail: string): void => {
    const t = tr[pl]!;
    if (t.reported.has(kind)) return;
    t.reported.add(kind);
    issues.push({ player: pl, kind, at: +(since / TPS / 60).toFixed(1), detail });
  };
  let error: string | undefined;
  try {
    while (w.winner < 0 && w.tick < maxTicks) {
      sim.step();
      for (const ev of sim.drainEvents())
        if (ev.type === 'power') {
          const c = tr[ev.owner]!.casts;
          c[ev.power] = (c[ev.power] ?? 0) + 1;
        }
      if (w.tick % TPS !== 0) continue;
      const min = w.tick / TPS / 60;
      for (let pl = 0; pl < w.players.length; pl++) {
        const p = w.players[pl]!;
        const t = tr[pl]!;
        if (t.ageAt[p.age]! < 0) t.ageAt[p.age] = +min.toFixed(1);
        if (p.defeated) continue;
        let workers = 0;
        let idle = 0;
        let armyPop = 0;
        let houseBuilding = false;
        let hall = false;
        let attacking = false;
        const enemyStart = w.map.starts[1 - pl]!;
        for (const e of w.entities) {
          if (e.dead || e.owner !== pl) continue;
          if (e.kind === 'building') {
            if (buildingDef(e.def).main && e.built) hall = true;
            if (!e.built && (buildingDef(e.def).popProvided ?? 0) > 0) houseBuilding = true;
            if (e.built && t.firstBuilt[e.def] === undefined) t.firstBuilt[e.def] = +min.toFixed(1);
            continue;
          }
          if (e.kind !== 'unit') continue;
          if (e.cls === 'worker') {
            workers++;
            if (e.order.type === 'idle' && e.inside < 0) idle++;
          } else {
            armyPop += unitDef(e.def).pop;
            if (
              t.firstAttack < 0 &&
              (e.x - enemyStart.x) ** 2 + (e.y - enemyStart.y) ** 2 < 14 * 14
            )
              attacking = true;
          }
        }
        if (attacking) t.firstAttack = +min.toFixed(1);
        t.maxWorkers = Math.max(t.maxWorkers, workers);
        t.peakArmy = Math.max(t.peakArmy, armyPop);
        if (t.hadHall && !hall) t.hallLost++;
        if (!t.hadHall && hall) t.hallRebuilt++;
        t.hadHall = hall;
        if (w.tick % (4 * 60 * TPS) === 0 && t.snap.length < 4)
          t.snap.push([workers, armyPop, Math.round(p.stats.gathered)]);
        if (!o.health) continue;
        const tick = w.tick;
        // Idle workers: >25% idle for >60 s.
        if (workers >= 4 && idle / workers > 0.25) {
          if (t.idleSince < 0) t.idleSince = tick;
          else if (tick - t.idleSince > 60 * TPS)
            report(pl, 'idle-workers', t.idleSince, `${idle}/${workers} idle`);
        } else t.idleSince = -1;
        // Pop-cap stall with no housing under construction.
        const houseWood = costOf(p, tick, 'house').wood ?? 50;
        const capped = p.popCap < 200 && p.pop >= p.popCap && !houseBuilding;
        if (capped && p.res.wood >= houseWood) {
          if (t.capSince < 0) t.capSince = tick;
          else if (tick - t.capSince > 45 * TPS)
            report(pl, 'popcap-stall', t.capSince, `pop ${p.pop}/${p.popCap} wood ${p.res.wood}`);
        } else t.capSince = -1;
        if (capped && p.res.wood < houseWood) {
          if (t.capShortSince < 0) t.capShortSince = tick;
          else if (tick - t.capShortSince > 90 * TPS)
            report(
              pl,
              'popcap-no-wood',
              t.capShortSince,
              `pop ${p.pop}/${p.popCap} wood ${p.res.wood}`,
            );
        } else t.capShortSince = -1;
        // Hoarding: any resource >1500 for >2 min.
        for (const k of ['food', 'wood', 'gold', 'favor'] as const) {
          if (p.res[k] > 1500) {
            t.hoard[k] ??= tick;
            if (tick - t.hoard[k]! > 120 * TPS)
              report(pl, `hoard-${k}`, t.hoard[k]!, `${k} ${Math.round(p.res[k])}`);
          } else delete t.hoard[k];
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  }
  const minutes = +(w.tick / TPS / 60).toFixed(2);
  const reports: PlayerReport[] = w.players.map((p, pl) => {
    const t = tr[pl]!;
    return {
      faction: p.faction,
      ai: o.seats[pl]!.ai,
      age: p.age,
      ageAt: t.ageAt,
      firstAttackMin: t.firstAttack,
      armyTrained: armyTrained(sim.history, pl),
      maxWorkers: t.maxWorkers,
      peakArmyPop: t.peakArmy,
      townHallLost: t.hallLost,
      townHallRebuilt: t.hallRebuilt,
      snap: t.snap,
      firstBuilt: t.firstBuilt,
      casts: t.casts,
    };
  });
  if (o.health) {
    for (let pl = 0; pl < 2; pl++) {
      const r = reports[pl]!;
      const ai = r.ai;
      if (ai === 'passive') continue;
      if (minutes >= 12 && r.armyTrained === 0)
        issues.push({ player: pl, kind: 'no-army', at: minutes, detail: 'never trained army' });
      const mid = ai === 'easy' ? 14 : 12;
      if (minutes >= mid && (r.ageAt[1]! < 0 || r.ageAt[1]! > mid))
        issues.push({
          player: pl,
          kind: 'slow-age1',
          at: r.ageAt[1]!,
          detail: `age 1 at ${r.ageAt[1]}`,
        });
      if (ai !== 'easy' && minutes >= 20 && (r.ageAt[2]! < 0 || r.ageAt[2]! > 20))
        issues.push({
          player: pl,
          kind: 'slow-age2',
          at: r.ageAt[2]!,
          detail: `age 2 at ${r.ageAt[2]}`,
        });
    }
    if (w.winner < 0 && !error && !disconnected && o.seats.every((s) => s.ai !== 'passive'))
      issues.push({ player: -1, kind: 'draw', at: minutes, detail: 'no winner' });
  }
  if (error) issues.push({ player: -1, kind: 'exception', at: minutes, detail: error });
  return {
    seed: o.seed,
    seats: o.seats,
    winner: w.winner,
    minutes,
    players: reports,
    issues,
    error,
    disconnected,
  };
}

/** Can a unit walk from one start to the other (ignoring buildings placed later)? */
export function basesConnected(w: World): boolean {
  const [a, b] = w.map.starts.map((s) => w.grid.nearestWalkable(s.x + 0.5, s.y + 3)) as [
    number,
    number,
  ];
  const W = w.grid.w;
  return a >= 0 && b >= 0 && w.grid.connected(a % W, Math.floor(a / W), b % W, Math.floor(b / W));
}

function armyTrained(
  history: ReadonlyArray<{ command: { type: string; player: number; unit?: string } }>,
  pl: number,
): number {
  let n = 0;
  for (const h of history) {
    const c = h.command;
    if (c.type === 'train' && c.player === pl && c.unit && unitDef(c.unit).cls !== 'worker') n++;
  }
  return n;
}

/** All ordered faction pairs (both seats), including mirrors when `mirrors` is set. */
export function factionPairs(mirrors = false): Array<[FactionId, FactionId]> {
  const out: Array<[FactionId, FactionId]> = [];
  for (const a of FACTION_IDS)
    for (const b of FACTION_IDS) if (a !== b || mirrors) out.push([a, b]);
  return out;
}

export function seedList(def: string): number[] {
  return (process.env.SEEDS ?? def).split(',').map(Number);
}
