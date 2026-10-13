import { Rng } from './core/rng';
import type { GameMap } from './map/mapgen';

export interface MatchConfig {
  seed: number;
  mapSize: number;
  /** Number of player slots (M1 always 2). */
  players: number;
}

/** The complete, serialisable simulation state. Nothing in here references rendering. */
export interface World {
  readonly config: MatchConfig;
  tick: number;
  readonly rng: Rng;
  readonly map: GameMap;
}

export function createWorld(config: MatchConfig, map: GameMap): World {
  return {
    config,
    tick: 0,
    // Separate stream from map generation so map tweaks don't change in-match randomness.
    rng: new Rng((config.seed ^ 0x5bd1e995) >>> 0),
    map,
  };
}

/** Order-dependent FNV-1a hash of the state. Used by tests (and later desync detection). */
export function hashWorld(world: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  mix(world.tick);
  mix(world.rng.state);
  const { tiles, wood } = world.map;
  for (let i = 0; i < tiles.length; i++) {
    mix((tiles[i] as number) | ((wood[i] as number) << 8));
  }
  return h >>> 0;
}
