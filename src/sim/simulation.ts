import { applyMovementCommand } from './actions';
import { applyEconomyCommand } from './economyActions';
import type { Command, ScheduledCommand } from './commands';
import { movementSystem, pathSystem } from './systems/movement';
import { orderSystem } from './systems/orders';
import { productionSystem } from './systems/production';
import { combatSystem } from './systems/combat';
import { fogSystem, updateFog } from './systems/fog';
import { victorySystem } from './systems/victory';
import { favorSystem, powerEffectsSystem } from './systems/powers';
import { cleanupDead, createWorld, type MatchConfig, type SimEvent, type World } from './world';

/** A system advances one aspect of the world by exactly one tick. Systems run in array order. */
export type System = (world: World) => void;

/** Something that issues commands each tick (AI players, tutorial scripts). */
export interface Controller {
  update(world: World, issue: (c: Command) => void): void;
}

/** Fixed order of systems. Changing it changes the simulation (and replays). */
export const DEFAULT_SYSTEMS: System[] = [
  orderSystem,
  combatSystem,
  powerEffectsSystem,
  favorSystem,
  productionSystem,
  pathSystem,
  movementSystem,
  fogSystem,
  victorySystem,
];

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
  readonly controllers: Controller[] = [];
  /** When true, accumulate per-system time in `timings` (debugging only). */
  profile = false;
  readonly timings: Record<string, number> = {};
  /** Events produced since the last drain. */
  private eventBuffer: SimEvent[] = [];

  constructor(config: MatchConfig, systems: System[] = DEFAULT_SYSTEMS) {
    this.world = createWorld(config);
    this.systems = systems;
    updateFog(this.world);
    this.world.spatial.rebuild(this.world.entities);
  }

  /** Queue a command for the next tick (or a later one, e.g. network input delay). */
  enqueue(command: Command, delayTicks = 0): void {
    this.pending.push({ tick: this.world.tick + Math.max(0, delayTicks), command });
  }

  step(): void {
    const w = this.world;
    w.events = [];
    for (const e of w.entities) {
      e.px = e.x;
      e.py = e.y;
    }
    const tc = this.profile ? performance.now() : 0;
    for (const c of this.controllers) c.update(w, (cmd) => this.enqueue(cmd));
    if (this.profile) this.timings.ai = (this.timings.ai ?? 0) + performance.now() - tc;
    if (this.pending.length > 0) {
      const due = this.pending.filter((c) => c.tick <= w.tick);
      this.pending = this.pending.filter((c) => c.tick > w.tick);
      for (const sc of due) {
        applyCommand(w, sc.command);
        this.history.push({ tick: w.tick, command: sc.command });
      }
    }
    if (this.profile) {
      for (const system of this.systems) {
        const t0 = performance.now();
        system(w);
        const k = system.name || 'system';
        this.timings[k] = (this.timings[k] ?? 0) + performance.now() - t0;
      }
    } else {
      for (const system of this.systems) system(w);
    }
    cleanupDead(w);
    w.tick++;
    if (w.events.length) this.eventBuffer.push(...w.events);
  }

  /** Take all events produced since the last call (render/audio/UI). */
  drainEvents(): SimEvent[] {
    const ev = this.eventBuffer;
    this.eventBuffer = [];
    return ev;
  }
}

export function applyCommand(world: World, command: Command): void {
  if (world.winner >= 0) return;
  const p = world.players[command.player];
  if (!p || p.defeated) return;
  if (applyMovementCommand(world, command)) return;
  if (applyEconomyCommand(world, command)) return;
}
