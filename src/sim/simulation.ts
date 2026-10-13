import type { Command, ScheduledCommand } from './commands';
import { generateMap } from './map/mapgen';
import { createWorld, type MatchConfig, type World } from './world';

/** A system advances one aspect of the world by exactly one tick. Systems run in array order. */
export type System = (world: World) => void;

/**
 * Owns the world and advances it in fixed ticks. Rendering, input and AI talk to the match only
 * through `enqueue` (writes) and `world` (reads).
 */
export class Simulation {
  readonly world: World;
  private readonly systems: System[];
  private pending: ScheduledCommand[] = [];
  /** Commands applied so far, in order — enough to replay the match from its config. */
  readonly history: ScheduledCommand[] = [];

  constructor(config: MatchConfig, systems: System[] = []) {
    this.world = createWorld(config, generateMap(config.mapSize, config.seed));
    this.systems = systems;
  }

  /** Queue a command for the next tick (or a later one, e.g. network input delay). */
  enqueue(command: Command, delayTicks = 0): void {
    this.pending.push({ tick: this.world.tick + Math.max(0, delayTicks), command });
  }

  step(): void {
    const w = this.world;
    if (this.pending.length > 0) {
      const due = this.pending.filter((c) => c.tick <= w.tick);
      this.pending = this.pending.filter((c) => c.tick > w.tick);
      for (const sc of due) {
        applyCommand(w, sc.command);
        this.history.push({ tick: w.tick, command: sc.command });
      }
    }
    for (const system of this.systems) system(w);
    w.tick++;
  }
}

function applyCommand(_world: World, command: Command): void {
  switch (command.type) {
    case 'noop':
      break;
  }
}
