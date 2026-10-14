import { GAME_ID } from '../config/game';
import { detectLanguage, type Language } from '../i18n';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface Settings {
  language: Language;
  /** Multiplier for HUD size (0.8 – 1.4). */
  uiScale: number;
  handedness: 'right' | 'left';
  graphics: GraphicsQuality;
  masterVolume: number;
  muted: boolean;
  /** Generative background music on/off (sound effects are separate). */
  music: boolean;
  haptics: boolean;
  showDebug: boolean;
}

const KEY = `${GAME_ID}.settings.v1`;

export function defaultSettings(): Settings {
  return {
    language: detectLanguage(typeof navigator !== 'undefined' ? (navigator.languages ?? []) : []),
    uiScale: 1,
    handedness: 'right',
    graphics: 'high',
    masterVolume: 0.8,
    muted: false,
    music: true,
    haptics: true,
    showDebug: false,
  };
}

/** Load settings; storage may be unavailable (private mode), so never throw. */
export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return base;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Max canvas pixel ratio per graphics quality (higher = sharper, more GPU fill cost). */
export function maxPixelRatio(q: GraphicsQuality): number {
  return q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
}
