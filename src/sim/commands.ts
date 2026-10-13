/**
 * Every change a player (human or AI) makes to the match is a Command. Commands are queued and
 * applied at the start of a tick, which keeps the simulation deterministic and makes replays /
 * lockstep multiplayer a matter of recording and replaying this stream.
 */
export type Command =
  | { type: 'move'; player: number; ids: number[]; x: number; y: number }
  | { type: 'attackMove'; player: number; ids: number[]; x: number; y: number }
  | { type: 'attack'; player: number; ids: number[]; target: number }
  /** Gather from a resource/farm entity (`target`) or a forest tile (`tile`). */
  | { type: 'gather'; player: number; ids: number[]; target: number; tile: number }
  /** Place a foundation and send workers to build it. */
  | { type: 'build'; player: number; ids: number[]; def: string; tileX: number; tileY: number }
  /** Help build or repair an existing building. */
  | { type: 'construct'; player: number; ids: number[]; target: number }
  | { type: 'stop'; player: number; ids: number[] }
  | { type: 'train'; player: number; building: number; unit: string }
  | { type: 'research'; player: number; building: number; tech: string }
  | { type: 'advanceAge'; player: number; building: number; god: string }
  | { type: 'cancel'; player: number; building: number; index: number }
  | { type: 'rally'; player: number; building: number; x: number; y: number }
  | { type: 'castPower'; player: number; power: string; x: number; y: number }
  | { type: 'ability'; player: number; id: number }
  | { type: 'resign'; player: number };

export interface ScheduledCommand {
  /** Tick on which the command is applied. */
  tick: number;
  command: Command;
}
