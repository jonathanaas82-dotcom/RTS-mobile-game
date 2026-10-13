/**
 * Every change a player (human or AI) makes to the match is expressed as a Command. Commands are
 * queued and applied at the start of a tick, which keeps the simulation deterministic and makes
 * replays / lockstep multiplayer a matter of recording and replaying this stream.
 *
 * M1 has no gameplay commands yet; more variants are added per milestone.
 */
export type Command = { type: 'noop'; player: number };

export interface ScheduledCommand {
  /** Tick on which the command is applied. */
  tick: number;
  command: Command;
}
