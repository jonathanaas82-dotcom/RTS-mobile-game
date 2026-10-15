import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/sim/map/terrain';
import { nearestForest } from '../src/sim/systems/economy';
import { newSim, run, unitsOf } from './helpers';

const hallOf = (sim: ReturnType<typeof newSim>, owner: number) =>
  sim.world.entities.find((e) => e.owner === owner && e.def === 'town_hall')!;

describe('economy', () => {
  it('workers gather berries and deliver food', () => {
    const sim = newSim(11);
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    const berries = w.entities
      .filter((e) => e.def === 'berries')
      .sort(
        (a, b) =>
          (a.x - hall.x) ** 2 + (a.y - hall.y) ** 2 - ((b.x - hall.x) ** 2 + (b.y - hall.y) ** 2),
      )[0]!;
    const workers = unitsOf(sim, 0);
    sim.enqueue({
      type: 'gather',
      player: 0,
      ids: workers.map((u) => u.id),
      target: berries.id,
      tile: -1,
    });
    const food0 = p.res.food;
    run(sim, 20 * 60);
    expect(p.res.food - food0).toBeGreaterThan(40);
    expect(workers.every((u) => u.order.type === 'gather' || u.order.type === 'return')).toBe(true);
  });

  it('workers fish from the shore and deliver food', () => {
    // Find a seed whose map has a fishing spot near player 0.
    let sim = newSim(1);
    for (let seed = 1; seed < 40; seed++) {
      sim = newSim(seed);
      const h = hallOf(sim, 0);
      if (
        sim.world.entities.some(
          (e) => e.def === 'fish' && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < 15 * 15,
        )
      )
        break;
    }
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    const fish = w.entities
      .filter((e) => e.def === 'fish')
      .sort(
        (a, b) =>
          (a.x - hall.x) ** 2 + (a.y - hall.y) ** 2 - ((b.x - hall.x) ** 2 + (b.y - hall.y) ** 2),
      )[0]!;
    expect(fish).toBeDefined();
    const workers = unitsOf(sim, 0).slice(0, 2);
    sim.enqueue({
      type: 'gather',
      player: 0,
      ids: workers.map((u) => u.id),
      target: fish.id,
      tile: -1,
    });
    const food0 = p.res.food;
    const amount0 = fish.amount;
    run(sim, 20 * 90);
    expect(fish.amount).toBeLessThan(amount0);
    expect(p.res.food - food0).toBeGreaterThan(20);
  });

  it('workers chop wood, clearing forest tiles over time', () => {
    const sim = newSim(12);
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    const tile = nearestForest(w, hall.x, hall.y, 14);
    expect(tile).toBeGreaterThanOrEqual(0);
    w.map.wood[tile] = 25; // make it run out quickly
    const workers = unitsOf(sim, 0);
    sim.enqueue({ type: 'gather', player: 0, ids: workers.map((u) => u.id), target: -1, tile });
    const wood0 = p.res.wood;
    run(sim, 20 * 90);
    expect(p.res.wood - wood0).toBeGreaterThan(30);
    expect(w.map.tiles[tile]).toBe(Terrain.Grass);
    expect(w.grid.blocked[tile]).toBe(0);
  });

  it('building a house raises the population cap', () => {
    const sim = newSim(13);
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    // Find a free 2x2 spot near the hall.
    let spot: [number, number] | null = null;
    for (let r = 3; r < 10 && !spot; r++)
      for (let dy = -r; dy <= r && !spot; dy++)
        for (let dx = -r; dx <= r && !spot; dx++)
          if (w.grid.canPlace(hall.tileX + dx, hall.tileY + dy, 2))
            spot = [hall.tileX + dx, hall.tileY + dy];
    expect(spot).not.toBeNull();
    const workers = unitsOf(sim, 0);
    const wood0 = p.res.wood;
    sim.enqueue({
      type: 'build',
      player: 0,
      ids: workers.map((u) => u.id),
      def: 'house',
      tileX: spot![0],
      tileY: spot![1],
    });
    run(sim, 2);
    expect(p.res.wood).toBe(wood0 - 50);
    const house = w.entities.find((e) => e.def === 'house' && e.owner === 0)!;
    expect(house.built).toBe(false);
    run(sim, 20 * 30);
    expect(house.built).toBe(true);
    expect(p.popCap).toBe(20);
  });

  it('trains units, respects the pop cap and refunds on cancel', () => {
    const sim = newSim(14);
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    p.res.food = 1000;
    for (let i = 0; i < 5; i++)
      sim.enqueue({ type: 'train', player: 0, building: hall.id, unit: 'hearthkin' });
    run(sim, 1);
    expect(hall.queue.length).toBe(5);
    expect(p.pop).toBe(8); // 3 alive + 5 reserved
    expect(p.res.food).toBe(1000 - 250);
    sim.enqueue({ type: 'cancel', player: 0, building: hall.id, index: 4 });
    run(sim, 1);
    expect(hall.queue.length).toBe(4);
    expect(p.res.food).toBe(1000 - 200);
    run(sim, 20 * 12 + 5);
    expect(unitsOf(sim, 0).length).toBe(4);
    // Fill to the cap: 3 more queued would exceed 10.
    p.res.food = 5000;
    for (let i = 0; i < 5; i++)
      sim.enqueue({ type: 'train', player: 0, building: hall.id, unit: 'hearthkin' });
    run(sim, 1);
    expect(p.pop).toBeLessThanOrEqual(p.popCap);
  });

  it('new units walk to the rally point', () => {
    const sim = newSim(15);
    const w = sim.world;
    const hall = hallOf(sim, 0);
    const ti = w.grid.nearestWalkable(hall.x + 5, hall.y + 4);
    const rx = (ti % w.map.width) + 0.5;
    const ry = Math.floor(ti / w.map.width) + 0.5;
    sim.enqueue({ type: 'rally', player: 0, building: hall.id, x: rx, y: ry });
    sim.enqueue({ type: 'train', player: 0, building: hall.id, unit: 'hearthkin' });
    run(sim, 20 * 20);
    const fresh = unitsOf(sim, 0).at(-1)!;
    expect(Math.hypot(fresh.x - rx, fresh.y - ry)).toBeLessThan(1.5);
  });

  it('advancing an age grants the god, its power and bonuses', () => {
    const sim = newSim(16);
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    p.res.food = 2000;
    p.res.gold = 2000;
    const worker = unitsOf(sim, 0)[0]!;
    const hp0 = worker.maxHp;
    sim.enqueue({ type: 'advanceAge', player: 0, building: hall.id, god: 'hrodna' });
    run(sim, 2);
    expect(p.advancing).toBe(true);
    run(sim, 20 * 41);
    expect(p.age).toBe(1);
    expect(p.gods).toEqual(['hrodna']);
    expect(p.powers.map((x) => x.id)).toContain('frostbite');
    expect(worker.maxHp).toBe(Math.round(hp0 * 1.2)); // Skaði (hrodna): workers +20% HP
  });

  it('research applies tech effects once', () => {
    const sim = newSim(17);
    const w = sim.world;
    const p = w.players[0]!;
    const hall = hallOf(sim, 0);
    p.res.food = 5000;
    p.res.wood = 5000;
    p.res.gold = 5000;
    p.age = 1;
    sim.enqueue({ type: 'research', player: 0, building: hall.id, tech: 'plows' });
    sim.enqueue({ type: 'research', player: 0, building: hall.id, tech: 'plows' });
    run(sim, 2);
    expect(hall.queue.length).toBe(1);
    run(sim, 20 * 26);
    expect(p.techs).toEqual(['plows']);
  });
});
