import type { Settings } from '../ui/settings';

import type { MatchConfig } from '../sim/world';
import type { Hud } from '../ui/hud/Hud';

/** What the world scene reports to the HUD. Implemented by the DOM HUD (src/ui/hud). */
export type HudPort = Hud;

export interface DebugStats {
  fps: number;
  tick: number;
  zoom: number;
  seed: number;
  camTileX: number;
  camTileY: number;
  entities: number;
  extra?: string;
}

/** Controls the HUD can invoke on the running match. */
export interface MatchControls {
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  setSpeed(speed: number): void;
  getSpeed(): number;
  openMenu(): void;
  toggleBoxMode(): void;
  selectIdleWorkers(): void;
  selectArmy(): void;
  groupPress(i: number): void;
  groupAssign(i: number): void;
  jumpToAlert(): void;
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

export type MatchStartData = MatchConfig;
