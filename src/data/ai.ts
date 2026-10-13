/** AI difficulty parameters. All AI tuning lives here, not in code. */
export interface AIProfile {
  /** Ticks between decisions (lower = more responsive). */
  thinkTicks: number;
  /** Target worker counts per age. */
  workers: [number, number, number, number];
  /** Earliest minute for the first attack wave. */
  firstAttackMin: number;
  /** Army population needed to launch a wave; grows by `waveGrowth` per wave. */
  wavePop: number;
  waveGrowth: number;
  /** Retreat when the wave falls below this fraction of its launch strength. */
  retreatAt: number;
  /** Highest age the AI will advance to (0–3). */
  maxAge: number;
  /** Minimum workers before each age advance (index = target age). */
  ageWorkers: [number, number, number, number];
  /** Number of barracks/stables to build. */
  barracks: number;
  stables: number;
  towers: number;
  /** Probability (0–1) of using a god power when a good opportunity is seen. */
  powerUse: number;
  /** Use hero abilities and focus fire. */
  micro: boolean;
  /** Research economy/military techs. */
  techs: boolean;
  /** Reacts to the enemy's army composition with counter units. */
  counters: boolean;
  /**
   * Explicit gather-rate multiplier (Hard only, shown on the pre-match screen). No other bonuses
   * exist: all difficulties pay the same costs and see only what their units see.
   */
  gatherBonus: number;
  /** Never attacks (tutorial). */
  passive?: boolean;
}

export const AI_PROFILES: Record<'easy' | 'normal' | 'hard' | 'passive', AIProfile> = {
  easy: {
    thinkTicks: 40,
    workers: [10, 14, 16, 16],
    firstAttackMin: 10,
    wavePop: 8,
    waveGrowth: 3,
    retreatAt: 0.25,
    maxAge: 2,
    ageWorkers: [0, 10, 14, 99],
    barracks: 1,
    stables: 0,
    towers: 0,
    powerUse: 0.25,
    micro: false,
    techs: false,
    counters: false,
    gatherBonus: 1,
  },
  normal: {
    thinkTicks: 20,
    workers: [14, 20, 24, 26],
    firstAttackMin: 6.5,
    wavePop: 12,
    waveGrowth: 4,
    retreatAt: 0.3,
    maxAge: 3,
    ageWorkers: [0, 13, 19, 23],
    barracks: 1,
    stables: 1,
    towers: 1,
    powerUse: 0.6,
    micro: true,
    techs: true,
    counters: true,
    gatherBonus: 1,
  },
  hard: {
    thinkTicks: 10,
    workers: [16, 24, 30, 32],
    firstAttackMin: 5,
    wavePop: 14,
    waveGrowth: 5,
    retreatAt: 0.35,
    maxAge: 3,
    ageWorkers: [0, 14, 22, 27],
    barracks: 2,
    stables: 1,
    towers: 2,
    powerUse: 1,
    micro: true,
    techs: true,
    counters: true,
    gatherBonus: 1.15,
  },
  passive: {
    thinkTicks: 40,
    workers: [6, 8, 8, 8],
    firstAttackMin: 999,
    wavePop: 999,
    waveGrowth: 0,
    retreatAt: 0,
    maxAge: 0,
    ageWorkers: [0, 99, 99, 99],
    barracks: 0,
    stables: 0,
    towers: 0,
    powerUse: 0,
    micro: false,
    techs: false,
    counters: false,
    gatherBonus: 1,
    passive: true,
  },
};

/** Desired share of gatherers per resource by age (food, wood, gold). */
export const AI_GATHER_SPLIT: Array<[number, number, number]> = [
  [0.5, 0.35, 0.15],
  [0.45, 0.3, 0.25],
  [0.42, 0.28, 0.3],
  [0.4, 0.25, 0.35],
];

/** Base army mix weights per faction (before countering). */
export const AI_ARMY_MIX: Record<
  string,
  Partial<Record<'infantry' | 'ranged' | 'cavalry' | 'siege', number>>
> = {
  hrimfolk: { infantry: 0.55, ranged: 0.25, cavalry: 0.2, siege: 0.1 },
  aurelian: { infantry: 0.4, ranged: 0.3, cavalry: 0.3, siege: 0.1 },
  sahrun: { infantry: 0.42, ranged: 0.3, cavalry: 0.28, siege: 0.1 },
};
