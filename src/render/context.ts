import type { Settings } from '../ui/settings';

/** What the world scene reports to the HUD. Implemented by the DOM HUD (src/ui/hud). */
export interface HudPort {
  setDebugStats(stats: DebugStats): void;
  showInfo(text: string): void;
  onPauseChange(paused: boolean): void;
}

export interface DebugStats {
  fps: number;
  tick: number;
  zoom: number;
  seed: number;
  camTileX: number;
  camTileY: number;
}

/** Controls the HUD can invoke on the running match. */
export interface MatchControls {
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  setSpeed(speed: number): void;
  getSpeed(): number;
}

/** Shared app context, stored in the Phaser registry under CONTEXT_KEY. */
export interface AppContext {
  settings: Settings;
  /** Canvas pixels per CSS pixel. */
  renderScale: number;
  hud: HudPort;
  /** Filled in by WorldScene when a match starts. */
  match: MatchControls | null;
}

export const CONTEXT_KEY = 'appContext';

export interface MatchStartData {
  seed: number;
  mapSize: number;
}
