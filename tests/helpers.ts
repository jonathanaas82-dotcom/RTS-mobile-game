import { Simulation, type System } from '../src/sim/simulation';
import type { MatchConfig } from '../src/sim/world';

export function testConfig(seed = 77, mapSize = 48): MatchConfig {
  return {
    seed,
    mapSize,
    players: [
      { faction: 'hrimfolk', majorGod: 'thunrak', ai: null },
      { faction: 'aurelian', majorGod: 'aetheon', ai: null },
    ],
  };
}

export function newSim(seed = 77, mapSize = 48, systems?: System[]): Simulation {
  return systems
    ? new Simulation(testConfig(seed, mapSize), systems)
    : new Simulation(testConfig(seed, mapSize));
}

export function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

export function unitsOf(sim: Simulation, owner: number, def?: string) {
  return sim.world.entities.filter(
    (e) => e.kind === 'unit' && e.owner === owner && !e.dead && (!def || e.def === def),
  );
}
