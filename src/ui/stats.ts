import { GAME_ID } from '../config/game';

export interface Stats {
  played: number;
  won: number;
  lost: number;
  /** Fastest victory in seconds (0 = none). */
  bestWin: number;
  tutorialDone: boolean;
}

const KEY = `${GAME_ID}.stats.v1`;

export function loadStats(): Stats {
  const base: Stats = { played: 0, won: 0, lost: 0, bestWin: 0, tutorialDone: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Stats>) };
  } catch {
    /* storage unavailable */
  }
  return base;
}

export function saveStats(s: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function recordResult(won: boolean, seconds: number): Stats {
  const s = loadStats();
  s.played++;
  if (won) {
    s.won++;
    if (s.bestWin === 0 || seconds < s.bestWin) s.bestWin = seconds;
  } else s.lost++;
  saveStats(s);
  return s;
}
