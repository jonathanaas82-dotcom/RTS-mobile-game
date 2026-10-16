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
  /** Minimum standing army (pop per match minute, capped at 40) kept while saving. */
  minArmyPerMin: number;
  /** Number of barracks/stables to build. */
  barracks: number;
  stables: number;
  towers: number;
  /** Builds a siege workshop (and saves for it late in the match). */
  siege: boolean;
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
    minArmyPerMin: 0.6,
    barracks: 1,
    stables: 0,
    towers: 0,
    siege: false,
    powerUse: 0.25,
    micro: false,
    techs: false,
    counters: false,
    gatherBonus: 1,
  },
  normal: {
    thinkTicks: 20,
    workers: [14, 22, 24, 26],
    firstAttackMin: 6.5,
    wavePop: 12,
    waveGrowth: 4,
    retreatAt: 0.3,
    maxAge: 3,
    ageWorkers: [0, 13, 19, 23],
    minArmyPerMin: 1.4,
    barracks: 1,
    stables: 1,
    towers: 1,
    siege: true,
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
    minArmyPerMin: 1.4,
    barracks: 2,
    stables: 1,
    towers: 2,
    siege: true,
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
    minArmyPerMin: 0,
    barracks: 0,
    stables: 0,
    towers: 0,
    siege: false,
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

/**
 * Faction play style on top of the difficulty profile. Hrimfolk earn Favor only by fighting,
 * so their AI raids earlier with smaller waves (applied as offsets/multipliers).
 */
export interface AIStyle {
  attackEarlierMin: number;
  waveScale: number;
  /** Share of the minimum standing army still produced while saving for an age (0–1). */
  saveArmy: number;
}

export const DEFAULT_AI_STYLE: AIStyle = { attackEarlierMin: 0, waveScale: 1, saveArmy: 0.5 };

export const AI_STYLE: Record<string, AIStyle> = {
  hrimfolk: { attackEarlierMin: 1.25, waveScale: 0.8, saveArmy: 1 },
  aurelian: { attackEarlierMin: 0, waveScale: 1, saveArmy: 0.7 },
  sahrun: { attackEarlierMin: 0, waveScale: 1, saveArmy: 1 },
};

/** Base army mix weights per faction (before countering). */
export const AI_ARMY_MIX: Record<
  string,
  Partial<Record<'infantry' | 'ranged' | 'cavalry' | 'siege', number>>
> = {
  hrimfolk: { infantry: 0.5, ranged: 0.2, cavalry: 0.32, siege: 0.1 },
  aurelian: { infantry: 0.4, ranged: 0.3, cavalry: 0.3, siege: 0.1 },
  sahrun: { infantry: 0.42, ranged: 0.3, cavalry: 0.28, siege: 0.1 },
};
