import { AIController } from '../ai/AIController';
import { Simulation } from '../sim/simulation';
import type { MatchConfig } from '../sim/world';

/** Create a simulation for a match and attach AI controllers to AI player slots. */
export function createMatch(config: MatchConfig): { sim: Simulation; ais: AIController[] } {
  const sim = new Simulation(config);
  const ais: AIController[] = [];
  config.players.forEach((pc, i) => {
    if (!pc.ai) return;
    const ai = new AIController(i, pc.ai, config.seed);
    AIController.applyHandicap(sim.world.players[i]!, pc.ai);
    sim.controllers.push(ai);
    ais.push(ai);
  });
  return { sim, ais };
}
