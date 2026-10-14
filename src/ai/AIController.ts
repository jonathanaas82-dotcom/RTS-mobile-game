import { buildingDef, factionDef, powerDef, techDef, unitDef } from '../data';
import { AI_ARMY_MIX, AI_GATHER_SPLIT, AI_PROFILES, type AIProfile } from '../data/ai';
import { counterMultiplier } from '../data/counters';
import type { ResourceKind } from '../data/balance/economy';
import { SIM } from '../data/balance/sim';
import type { UnitClass } from '../data/types';
import type { Command } from '../sim/commands';
import { Rng } from '../sim/core/rng';
import type { Entity } from '../sim/entity';
import { canAfford, costOf, type PlayerState } from '../sim/player';
import {
  canAdvance,
  canCast,
  canPlace,
  canResearch,
  canTrain,
  countOwned,
  nextAge,
  techOptions,
  trainOptions,
} from '../sim/rules';
import type { Controller } from '../sim/simulation';
import { visibleFor } from '../sim/systems/combat';
import { gatherKind, nearestDropoff, nearestForest } from '../sim/systems/economy';
import type { Difficulty, World } from '../sim/world';
import { findBuildSpot } from './placement';

const TPS = SIM.ticksPerSecond;

interface Wave {
  launched: number;
  strength: number;
  tx: number;
  ty: number;
}

interface KnownBuilding {
  id: number;
  x: number;
  y: number;
  main: boolean;
}

/**
 * Rule/utility-based AI. Thinks every `profile.thinkTicks`, reads only what its own units can see
 * (plus the publicly known enemy start position) and acts exclusively through Commands — the
 * same interface as the human player.
 */
export class AIController implements Controller {
  readonly me: number;
  readonly profile: AIProfile;
  readonly difficulty: Difficulty;
  private readonly rng: Rng;
  private wave: Wave | null = null;
  private wavesSent = 0;
  private readonly known = new Map<number, KnownBuilding>();
  /** Decaying memory of enemy army composition (by class). */
  private readonly enemyMix: Partial<Record<UnitClass, number>> = {};
  private lastThreat: { x: number; y: number; tick: number } | null = null;
  /** Recent decisions for the debug overlay. */
  readonly log: string[] = [];
  private pending: Command[] = [];
  private world!: World;

  constructor(me: number, difficulty: Difficulty, seed: number) {
    this.me = me;
    this.difficulty = difficulty;
    this.profile = AI_PROFILES[difficulty];
    this.rng = new Rng((seed ^ (0x9e3779b9 * (me + 1))) >>> 0);
  }

  /** Apply the explicit Hard gather bonus (call once at match start). */
  static applyHandicap(p: PlayerState, difficulty: Difficulty): void {
    p.handicapGather = AI_PROFILES[difficulty].gatherBonus;
  }

  update(world: World, issue: (c: Command) => void): void {
    this.world = world;
    const p = world.players[this.me];
    if (!p || p.defeated || world.winner >= 0) return;
    if ((world.tick + this.me * 7) % this.profile.thinkTicks !== 0) return;
    this.pending = [];
    this.observe();
    this.economy(p);
    this.buildOrder(p);
    this.ages(p);
    if (this.profile.techs) this.research(p);
    this.production(p);
    this.army(p);
    this.releaseShelters();
    this.scout();
    this.powers(p);
    if (this.profile.micro) this.heroes();
    for (const c of this.pending) issue(c);
  }

  private say(msg: string): void {
    const t = Math.floor(this.world.tick / TPS);
    this.log.push(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} ${msg}`);
    if (this.log.length > 8) this.log.shift();
  }

  private cmd(c: Command): void {
    this.pending.push(c);
  }

  // ───────────── perception ─────────────

  private observe(): void {
    const w = this.world;
    for (const k of Object.keys(this.enemyMix) as UnitClass[])
      this.enemyMix[k] = (this.enemyMix[k] ?? 0) * 0.97;
    for (const e of w.entities) {
      if (e.dead || e.owner < 0 || e.owner === this.me) continue;
      if (!visibleFor(w, this.me, e)) continue;
      if (e.kind === 'building')
        this.known.set(e.id, { id: e.id, x: e.x, y: e.y, main: !!buildingDef(e.def).main });
      else if (e.kind === 'unit' && e.cls !== 'worker') {
        const c = e.cls as UnitClass;
        this.enemyMix[c] = Math.min(30, (this.enemyMix[c] ?? 0) + 0.15);
      }
    }
    // Forget destroyed buildings (we'd see the rubble).
    for (const [id] of this.known) {
      const e = w.byId.get(id);
      if (!e || e.dead) this.known.delete(id);
    }
  }

  // ───────────── helpers ─────────────

  private mine(pred: (e: Entity) => boolean): Entity[] {
    return this.world.entities.filter((e) => !e.dead && e.owner === this.me && pred(e));
  }

  private home(): Entity | null {
    return (
      this.mine((e) => e.def === 'town_hall')[0] ??
      this.mine((e) => e.kind === 'building')[0] ??
      null
    );
  }

  private enemyStart(): { x: number; y: number } {
    const w = this.world;
    const other = w.players.find((q) => q.id !== this.me && !q.defeated);
    const s = w.map.starts[other?.id ?? 1 - this.me] ?? w.map.starts[0]!;
    return { x: s.x + 0.5, y: s.y + 0.5 };
  }

  private rally(): { x: number; y: number } {
    const h = this.home();
    if (!h) return { x: this.world.map.width / 2, y: this.world.map.height / 2 };
    const e = this.enemyStart();
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const x = h.x + (dx / d) * 6;
    const y = h.y + (dy / d) * 6;
    const ti = this.world.grid.nearestWalkable(x, y);
    return ti >= 0
      ? { x: (ti % this.world.map.width) + 0.5, y: Math.floor(ti / this.world.map.width) + 0.5 }
      : { x, y };
  }

  private build(
    p: PlayerState,
    def: string,
    near: { x: number; y: number },
    builders: number,
    minR = 2,
  ): boolean {
    if (!canPlace(this.world, p, def).ok) return false;
    const size = buildingDef(def).size;
    const spot = findBuildSpot(this.world, this.me, size, near.x, near.y, minR);
    if (!spot) return false;
    const workers = this.pickBuilders(builders, spot.x + size / 2, spot.y + size / 2);
    if (workers.length === 0) return false;
    this.cmd({
      type: 'build',
      player: this.me,
      ids: workers.map((u) => u.id),
      def,
      tileX: spot.x,
      tileY: spot.y,
    });
    // Book the cost so later decisions in this same think don't spend it twice.
    this.reserved.push(costOf(p, this.world.tick, def));
    this.say(`build ${def}`);
    return true;
  }

  /** Costs committed this think (commands not applied yet). */
  private reserved: Array<Partial<Record<ResourceKind, number>>> = [];

  private affordable(
    p: PlayerState,
    cost: Partial<Record<ResourceKind, number>>,
    keep: Partial<Record<ResourceKind, number>> = {},
  ): boolean {
    for (const k of ['food', 'wood', 'gold', 'favor'] as ResourceKind[]) {
      let used = 0;
      for (const r of this.reserved) used += r[k] ?? 0;
      if (p.res[k] - used - (keep[k] ?? 0) < (cost[k] ?? 0)) return false;
    }
    return true;
  }

  private pickBuilders(n: number, x: number, y: number): Entity[] {
    const workers = this.mine((e) => e.cls === 'worker' && e.order.type !== 'build');
    // Prefer idle, then wood gatherers, nearest first.
    workers.sort((a, b) => {
      const pa = a.order.type === 'idle' ? 0 : a.carryKind === 'wood' || a.order.tile >= 0 ? 1 : 2;
      const pb = b.order.type === 'idle' ? 0 : b.carryKind === 'wood' || b.order.tile >= 0 ? 1 : 2;
      return (
        pa - pb ||
        (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2) ||
        a.id - b.id
      );
    });
    return workers.slice(0, n);
  }

  private underConstruction(def?: string): number {
    return this.mine((e) => e.kind === 'building' && !e.built && (!def || e.def === def)).length;
  }

  // ───────────── economy ─────────────

  private economy(p: PlayerState): void {
    this.reserved = [];
    const w = this.world;
    const workers = this.mine((e) => e.cls === 'worker');
    const target = this.profile.workers[p.age] ?? 20;
    // Train workers.
    const queuedWorkers = this.mine((e) => e.kind === 'building').reduce(
      (n, b) =>
        n + b.queue.filter((q) => q.kind === 'unit' && unitDef(q.id).cls === 'worker').length,
      0,
    );
    if (workers.length + queuedWorkers < target) {
      const worker = factionDef(p.faction).worker;
      for (const hall of this.mine((e) => e.def === 'town_hall' && e.built)) {
        if (hall.queue.length >= 2) continue;
        if (!canTrain(w, p, hall, worker).ok || !this.affordable(p, costOf(p, w.tick, worker)))
          continue;
        this.cmd({ type: 'train', player: this.me, building: hall.id, unit: worker });
        this.reserved.push(costOf(p, w.tick, worker));
        break;
      }
    }
    // Houses before we get pop-blocked.
    const housing = this.underConstruction('house') + this.underConstruction('town_hall');
    if (p.popCap < 200 && p.popCap - p.pop <= 3 + Math.floor(p.popCap / 25) && housing === 0) {
      const h = this.home();
      if (h && this.affordable(p, costOf(p, w.tick, 'house'))) this.build(p, 'house', h, 1, 3);
    }
    // Assign idle workers by the desired resource split, nudged towards resources we're short of.
    const split = this.dynamicSplit(p);
    const count = { food: 0, wood: 0, gold: 0 } as Record<'food' | 'wood' | 'gold', number>;
    const idle: Entity[] = [];
    for (const u of workers) {
      if (u.order.type === 'idle' && u.inside < 0) idle.push(u);
      else if (u.order.type === 'gather' || u.order.type === 'return') {
        const k = gatherKind(w, u) ?? u.carryKind;
        if (k && k !== 'favor') count[k]++;
      }
    }
    const KINDS = ['food', 'wood', 'gold'] as const;
    for (const u of idle) {
      const total = Math.max(1, workers.length);
      // Most under-staffed resource first.
      const order = KINDS.map((k, i) => ({ k, deficit: split[i]! - count[k] / total })).sort(
        (a, b) => b.deficit - a.deficit,
      );
      let assigned = false;
      for (const { k } of order) {
        if (this.assign(p, u, k)) {
          count[k]++;
          assigned = true;
          break;
        }
      }
      if (!assigned) break;
    }
    this.rebalance(p, workers, count, split);
    this.dropoffs(p, workers);
    this.farms(p, count.food, Math.round(split[0] * workers.length));
    this.favorBuildings(p);
  }

  private dynamicSplit(p: PlayerState): [number, number, number] {
    const base = AI_GATHER_SPLIT[p.age]!;
    const stock = [p.res.food, p.res.wood, p.res.gold];
    const adj = base.map((b, i) => b * Math.min(1.6, Math.max(0.4, 1.5 - stock[i]! / 600)));
    const sum = adj.reduce((a, b) => a + b, 0);
    return adj.map((a) => a / sum) as [number, number, number];
  }

  /**
   * Move one worker per think from the most over-staffed resource to the most under-staffed one,
   * so the economy follows the desired split as sources deplete and ages change.
   */
  private rebalance(
    p: PlayerState,
    workers: Entity[],
    count: Record<'food' | 'wood' | 'gold', number>,
    split: [number, number, number],
  ): void {
    const total = workers.length;
    if (total < 6) return;
    const KINDS = ['food', 'wood', 'gold'] as const;
    const diff = KINDS.map((k, i) => ({ k, d: count[k] - split[i]! * total }));
    diff.sort((a, b) => b.d - a.d);
    const over = diff[0]!;
    const under = diff[2]!;
    if (over.d < 1.5 || under.d > -1.5) return;
    const w = this.world;
    const mover = workers.find(
      (u) =>
        u.order.type === 'gather' && u.carry === 0 && (gatherKind(w, u) ?? u.carryKind) === over.k,
    );
    if (mover && this.assign(p, mover, under.k)) {
      count[over.k]--;
      count[under.k]++;
    }
  }

  /** Send a worker to gather `kind`. Returns false if no source is available. */
  private assign(p: PlayerState, u: Entity, kind: 'food' | 'wood' | 'gold'): boolean {
    const w = this.world;
    const h = this.home();
    const base = h ?? u;
    if (kind === 'wood') {
      const drop = nearestDropoff(w, u, 'wood') ?? base;
      const tile = nearestForest(w, drop.x, drop.y, 16);
      if (tile < 0) return false;
      this.cmd({ type: 'gather', player: this.me, ids: [u.id], target: -1, tile });
      return true;
    }
    let best: Entity | null = null;
    // Food stays close to home; gold may be far away (a storehouse follows the miners).
    let bestD = kind === 'gold' ? Infinity : 18 * 18;
    for (const e of w.entities) {
      if (e.dead) continue;
      let ok = false;
      if (kind === 'gold') ok = e.kind === 'resource' && e.def === 'gold';
      else {
        ok = e.kind === 'resource' && (e.def === 'berries' || e.def === 'fish');
        // A fishing spot fits three workers along its shore.
        if (ok && e.def === 'fish')
          ok = w.entities.filter((o) => !o.dead && o.order.target === e.id).length < 3;
        if (!ok && e.def === 'farm' && e.owner === this.me && e.built) {
          ok = !w.entities.some(
            (o) =>
              !o.dead && o.order.type !== 'idle' && o.order.target === e.id && o.cls === 'worker',
          );
        }
      }
      if (!ok) continue;
      // Only take sources we know about (explored) and that are near one of our drop-offs.
      const fog = w.fog[this.me];
      if (fog && fog[Math.floor(e.y) * w.map.width + Math.floor(e.x)] === 0) continue;
      const d = (e.x - base.x) ** 2 + (e.y - base.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) {
      // No food source left: this worker builds a farm (and then farms it automatically).
      if (
        kind === 'food' &&
        h &&
        this.affordable(p, costOf(p, w.tick, 'farm')) &&
        canPlace(w, p, 'farm').ok
      ) {
        const spot = findBuildSpot(w, this.me, 2, h.x, h.y, 3, 14);
        if (spot) {
          this.cmd({
            type: 'build',
            player: this.me,
            ids: [u.id],
            def: 'farm',
            tileX: spot.x,
            tileY: spot.y,
          });
          this.reserved.push(costOf(p, w.tick, 'farm'));
          return true;
        }
      }
      return false;
    }
    // Don't overcrowd a single berry bush/gold mine.
    const crowd = w.entities.filter((o) => !o.dead && o.order.target === best!.id).length;
    if (best.def === 'berries' && crowd >= 2) {
      // Look for a different bush in the same cluster.
      const alt = w.entities.find(
        (o) =>
          !o.dead &&
          o.def === 'berries' &&
          (o.x - best!.x) ** 2 + (o.y - best!.y) ** 2 < 16 &&
          w.entities.filter((q) => q.order.target === o.id).length < 2,
      );
      if (alt) best = alt;
    }
    this.cmd({ type: 'gather', player: this.me, ids: [u.id], target: best.id, tile: -1 });
    return true;
  }

  private dropoffs(p: PlayerState, workers: Entity[]): void {
    if (this.underConstruction('storehouse') > 0 || p.res.wood < 80) return;
    const w = this.world;
    // A wood or gold cluster far from any drop-off gets a storehouse.
    for (const u of workers) {
      const k = u.carryKind;
      if (!k || k === 'food' || u.order.type !== 'gather') continue;
      const drop = nearestDropoff(w, u, k);
      const d = drop ? Math.sqrt((drop.x - u.x) ** 2 + (drop.y - u.y) ** 2) : 99;
      if (d > 7.5) {
        if (this.build(p, 'storehouse', { x: u.x, y: u.y }, 1, 1)) return;
      }
    }
  }

  private farms(p: PlayerState, foodWorkers: number, wantFood: number): void {
    const w = this.world;
    const h = this.home();
    if (!h || this.underConstruction('farm') > 1) return;
    if (foodWorkers >= wantFood && countOwned(this.world, this.me, 'farm', false) >= foodWorkers)
      return;
    // Start farming before the berries run out so food never stalls.
    let berryFood = 0;
    for (const e of w.entities) {
      if (
        !e.dead &&
        (e.def === 'berries' || e.def === 'fish') &&
        (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < 14 * 14
      )
        berryFood += e.amount;
    }
    if (berryFood > 120 * Math.max(1, foodWorkers)) return;
    const farms = countOwned(w, this.me, 'farm', false);
    if (farms >= wantFood + 1) return;
    if (this.affordable(p, costOf(p, w.tick, 'farm'), { wood: 0 })) this.build(p, 'farm', h, 1, 3);
  }

  private favorBuildings(p: PlayerState): void {
    const mode = factionDef(p.faction).favorMode;
    if (mode === 'combat' || p.res.favor > 150) return;
    const def = mode === 'shrines' ? 'shrine' : 'monument';
    const want = [1, 2, 3, 4][p.age]!;
    if (countOwned(this.world, this.me, def, false) >= want || this.underConstruction(def) > 0)
      return;
    if (this.mine((e) => e.cls === 'worker').length < 8) return;
    const h = this.home();
    if (h && this.affordable(p, costOf(p, this.world.tick, def), { food: 0 }))
      this.build(p, def, h, 1, 3);
  }

  // ───────────── build order ─────────────

  private buildOrder(p: PlayerState): void {
    const w = this.world;
    const prof = this.profile;
    if (prof.passive) return;
    const h = this.home();
    if (!h) return;
    const workers = this.mine((e) => e.cls === 'worker').length;
    const have = (def: string): number => countOwned(w, this.me, def, false);
    const goals: Array<[string, boolean]> = [
      ['barracks', workers >= 8 && have('barracks') < 1],
      ['temple', (workers >= 12 || p.age >= 1) && have('temple') < 1],
      ['barracks', p.age >= 1 && have('barracks') < prof.barracks],
      ['stable', p.age >= 1 && have('stable') < prof.stables],
      ['tower', p.age >= 1 && have('tower') < prof.towers],
      ['workshop', p.age >= 2 && have('workshop') < 1 && this.difficulty !== 'easy'],
      ['town_hall', p.age >= 2 && have('town_hall') < 2 && workers >= 24],
    ];
    for (const [def, want] of goals) {
      if (!want || this.underConstruction(def) > 0) continue;
      if (!this.affordable(p, costOf(p, w.tick, def), this.ageReserve(p))) continue;
      const near = def === 'tower' ? this.rally() : h;
      if (this.build(p, def, near, def === 'town_hall' ? 3 : 2, def === 'tower' ? 0 : 3)) return;
    }
  }

  /** Resources kept aside when an age advance is near. */
  private ageReserve(p: PlayerState): Partial<Record<ResourceKind, number>> {
    const info = nextAge(p);
    if (!info || p.age >= this.profile.maxAge || p.advancing) return {};
    const workers = this.mine((e) => e.cls === 'worker').length;
    if (workers + 3 < this.profile.ageWorkers[info.next]!) return {};
    return info.cost;
  }

  // ───────────── ages & techs ─────────────

  private ages(p: PlayerState): void {
    const info = nextAge(p);
    if (!info || p.advancing || p.age >= this.profile.maxAge) return;
    if (this.mine((e) => e.cls === 'worker').length < this.profile.ageWorkers[info.next]!) return;
    const hall = this.mine((e) => e.def === 'town_hall' && e.built && e.queue.length === 0)[0];
    if (!hall || !canAfford(p, info.cost)) return;
    const god = info.gods[this.rng.int(0, 1)]!;
    if (!canAdvance(p, hall, god).ok) return;
    this.cmd({ type: 'advanceAge', player: this.me, building: hall.id, god });
    this.reserved.push(info.cost);
    this.say(`advance age (${god})`);
  }

  private research(p: PlayerState): void {
    const w = this.world;
    const keep = { food: 250, wood: 150, gold: 250, ...this.ageReserve(p) };
    for (const b of this.mine((e) => e.kind === 'building' && e.built && e.queue.length === 0)) {
      for (const t of techOptions(p, b.def)) {
        if (!canResearch(w, p, b, t.id).ok || !this.affordable(p, t.cost, keep)) continue;
        this.cmd({ type: 'research', player: this.me, building: b.id, tech: t.id });
        this.reserved.push(t.cost);
        this.say(`research ${techDef(t.id).id}`);
        return;
      }
    }
  }

  // ───────────── production ─────────────

  private production(p: PlayerState): void {
    if (this.profile.passive) return;
    const w = this.world;
    const minutes = w.tick / TPS / 60;
    const armyPop = this.armyUnits().reduce((n, u) => n + unitDef(u.def).pop, 0);
    // Keep a minimum standing army even while saving for the next age.
    const minArmy = Math.min(40, minutes * (this.difficulty === 'easy' ? 0.6 : 1.4));
    const keep = armyPop < minArmy ? {} : this.ageReserve(p);
    for (const b of this.mine((e) => e.kind === 'building' && e.built && e.queue.length < 2)) {
      if (b.def === 'town_hall') continue;
      const options = trainOptions(p, b.def).filter((u) => u.cls !== 'worker');
      if (options.length === 0) continue;
      let pick: string | null = null;
      if (b.def === 'temple') {
        const hero = options.find((u) => u.cls === 'hero' && canTrain(w, p, b, u.id).ok);
        const mythic = options.filter((u) => u.cls === 'mythic' && canTrain(w, p, b, u.id).ok);
        if (hero) pick = hero.id;
        else if (mythic.length && p.res.favor >= (mythic[0]!.cost.favor ?? 0) + 25)
          pick = mythic[this.rng.int(0, mythic.length - 1)]!.id;
      } else {
        pick = this.chooseMilitary(
          p,
          options.map((u) => u.id),
        );
      }
      if (!pick || !canTrain(w, p, b, pick).ok) continue;
      const cost = costOf(p, w.tick, pick);
      if (!this.affordable(p, cost, keep)) continue;
      this.cmd({ type: 'train', player: this.me, building: b.id, unit: pick });
      this.reserved.push(cost);
    }
  }

  /** Weighted choice of a unit, biased towards counters of what we've seen the enemy field. */
  private chooseMilitary(p: PlayerState, ids: string[]): string | null {
    const mix = AI_ARMY_MIX[p.faction] ?? {};
    const totalSeen = Object.values(this.enemyMix).reduce((a, b) => a + (b ?? 0), 0);
    const weights = ids.map((id) => {
      const cls = unitDef(id).cls;
      let wgt = mix[cls as 'infantry'] ?? 0.2;
      if (cls === 'siege') {
        // Siege breaks town halls: keep 2–4 around from the Heroic age on.
        const siege = this.armyUnits().filter((u) => u.cls === 'siege').length;
        wgt = p.age >= 2 ? (siege < 2 ? 0.6 : siege < 4 ? 0.15 : 0.02) : 0;
      }
      if (this.profile.counters && totalSeen > 1 && cls !== 'siege') {
        let edge = 0;
        for (const [ec, n] of Object.entries(this.enemyMix) as Array<[UnitClass, number]>) {
          const share = (n ?? 0) / totalSeen;
          edge += share * (counterMultiplier(cls, ec) - counterMultiplier(ec, cls));
        }
        wgt *= Math.max(0.15, 1 + edge * 1.5);
      }
      return wgt;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;
    let r = this.rng.next() * sum;
    for (let i = 0; i < ids.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return ids[i]!;
    }
    return ids[ids.length - 1]!;
  }

  // ───────────── army ─────────────

  private armyUnits(): Entity[] {
    return this.mine((e) => e.kind === 'unit' && e.cls !== 'worker' && e.inside < 0);
  }

  private strength(units: Entity[]): number {
    return units.reduce((s, u) => s + unitDef(u.def).pop * (u.hp / u.maxHp), 0);
  }

  private army(p: PlayerState): void {
    const w = this.world;
    const army = this.armyUnits();
    if (army.length === 0) {
      const t = this.findThreat();
      if (t) {
        this.lastThreat = { ...t, tick: w.tick };
        this.workersDefend(t);
      }
      return;
    }
    // 1. Defend: visible enemies near our buildings.
    const threat = this.findThreat();
    if (threat) {
      this.lastThreat = { ...threat, tick: w.tick };
      const defenders = this.wave
        ? army.filter((u) => (u.x - threat.x) ** 2 + (u.y - threat.y) ** 2 < 30 * 30)
        : army;
      if (defenders.length < 3) this.workersDefend(threat);
      const ids = defenders.filter((u) => u.order.type !== 'attack').map((u) => u.id);
      if (ids.length) {
        this.cmd({ type: 'attackMove', player: this.me, ids, x: threat.x, y: threat.y });
        this.say(`defend (${ids.length})`);
      }
      return;
    }
    if (this.profile.passive) return;
    // 2. Attack waves.
    const minutes = w.tick / TPS / 60;
    const pop = army.reduce((s, u) => s + unitDef(u.def).pop, 0);
    if (!this.wave) {
      const need = Math.min(
        this.profile.wavePop + this.profile.waveGrowth * this.wavesSent,
        this.profile.wavePop * 2.2,
      );
      if (minutes >= this.profile.firstAttackMin && pop >= need) {
        const t = this.attackTarget();
        this.wave = { launched: w.tick, strength: this.strength(army), tx: t.x, ty: t.y };
        this.cmd({
          type: 'attackMove',
          player: this.me,
          ids: army.map((u) => u.id),
          x: t.x,
          y: t.y,
        });
        this.say(`attack wave ${this.wavesSent + 1} (pop ${pop})`);
        return;
      }
      // Gather idle army at the rally point.
      const r = this.rally();
      const loose = army.filter(
        (u) => u.order.type === 'idle' && (u.x - r.x) ** 2 + (u.y - r.y) ** 2 > 25,
      );
      if (loose.length)
        this.cmd({ type: 'move', player: this.me, ids: loose.map((u) => u.id), x: r.x, y: r.y });
      return;
    }
    // Wave in progress.
    const s = this.strength(army);
    // Late in the match, commit harder (fewer retreats) so games reach a conclusion.
    const late = w.tick / TPS / 60 > 18 ? 0.5 : 1;
    if (s < this.wave.strength * this.profile.retreatAt * late) {
      const r = this.rally();
      this.cmd({ type: 'move', player: this.me, ids: army.map((u) => u.id), x: r.x, y: r.y });
      this.say('retreat');
      this.wave = null;
      this.wavesSent++;
      return;
    }
    // Retarget when the objective is gone; send idle/new units to the front.
    const t = this.attackTarget();
    const moved = (t.x - this.wave.tx) ** 2 + (t.y - this.wave.ty) ** 2 > 4;
    if (moved) {
      this.wave.tx = t.x;
      this.wave.ty = t.y;
    }
    const ids = army
      .filter(
        (u) =>
          u.order.type === 'idle' ||
          u.order.type === 'move' ||
          (moved && u.order.type === 'attackMove' && u.order.target < 0),
      )
      .map((u) => u.id);
    if (ids.length)
      this.cmd({ type: 'attackMove', player: this.me, ids, x: this.wave.tx, y: this.wave.ty });
    // A wave that has run for very long without reaching anything restarts.
    if (w.tick - this.wave.launched > TPS * 240) {
      this.wave = null;
      this.wavesSent++;
    }
    void p;
  }

  private lastScout = -10000;

  /** No known gold left: send a unit to explore the nearest unexplored area. */
  private scout(): void {
    const w = this.world;
    if (w.tick - this.lastScout < TPS * 30 || this.profile.passive) return;
    const fog = w.fog[this.me]!;
    const knownGold = w.entities.some(
      (e) =>
        !e.dead && e.def === 'gold' && fog[Math.floor(e.y) * w.map.width + Math.floor(e.x)] !== 0,
    );
    if (knownGold) return;
    this.lastScout = w.tick;
    const h = this.home();
    if (!h) return;
    const scout =
      this.armyUnits().find((u) => u.order.type === 'idle') ??
      this.mine((e) => e.cls === 'worker' && e.order.type === 'idle')[0] ??
      this.armyUnits()[0];
    if (!scout) return;
    // Nearest unexplored walkable tile, sampled on a coarse grid.
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 2; y < w.map.height; y += 4) {
      for (let x = 2; x < w.map.width; x += 4) {
        if (fog[y * w.map.width + x] !== 0 || w.grid.isBlocked(x, y)) continue;
        const d = (x - h.x) ** 2 + (y - h.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    if (!best) return;
    this.cmd({ type: 'move', player: this.me, ids: [scout.id], x: best.x, y: best.y });
    this.say('scout for gold');
  }

  /** With no army at home, nearby workers fight raiders (they all have a weak attack). */
  private workersDefend(t: { x: number; y: number }): void {
    const w = this.world;
    const raiders = w.entities.filter(
      (e) =>
        !e.dead &&
        e.kind === 'unit' &&
        e.owner >= 0 &&
        e.owner !== this.me &&
        (e.x - t.x) ** 2 + (e.y - t.y) ** 2 < 36 &&
        visibleFor(w, this.me, e),
    );
    const near = this.mine((e) => e.cls === 'worker' && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 < 64);
    if (raiders.length === 0) return;
    if (near.length < raiders.length * 2) {
      // Too many raiders: hide the nearby workers in the Town Hall (adds arrows).
      const ids = near.filter((u) => u.inside < 0 && u.order.type !== 'garrison').map((u) => u.id);
      if (ids.length) {
        this.cmd({ type: 'garrison', player: this.me, ids, target: -1 });
        this.say(`workers shelter (${ids.length})`);
      }
      return;
    }
    const target = raiders[0]!;
    this.cmd({ type: 'attack', player: this.me, ids: near.map((u) => u.id), target: target.id });
    this.say(`workers defend (${near.length})`);
  }

  /** Let sheltered workers out once no threat was seen for a while. */
  private releaseShelters(): void {
    if (this.lastThreat && this.world.tick - this.lastThreat.tick < TPS * 15) return;
    for (const b of this.mine((e) => e.kind === 'building')) {
      if (this.world.entities.some((u) => !u.dead && u.inside === b.id)) {
        this.cmd({ type: 'ungarrison', player: this.me, building: b.id });
      }
    }
  }

  private findThreat(): { x: number; y: number } | null {
    const w = this.world;
    const mineB = this.mine((e) => e.kind === 'building');
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const e of w.entities) {
      if (e.dead || e.kind !== 'unit' || e.owner < 0 || e.owner === this.me) continue;
      if (!visibleFor(w, this.me, e)) continue;
      for (const b of mineB) {
        const d = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
        if (d < 12 * 12 && d < bestD) {
          bestD = d;
          best = { x: e.x, y: e.y };
        }
      }
    }
    return best;
  }

  /** Nearest known enemy building (main buildings last), else the enemy start. */
  private attackTarget(): { x: number; y: number } {
    const h = this.home() ?? { x: 0, y: 0 };
    let best: KnownBuilding | null = null;
    let bestD = Infinity;
    for (const k of this.known.values()) {
      // Town Halls are the decisive target: strongly preferred once known.
      const d = ((k.x - h.x) ** 2 + (k.y - h.y) ** 2) * (k.main ? 0.35 : 1);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best ?? this.enemyStart();
  }

  // ───────────── god powers & heroes ─────────────

  private powers(p: PlayerState): void {
    const w = this.world;
    for (const ps of p.powers) {
      if (!canCast(w, p, ps.id).ok) continue;
      if (this.rng.next() > this.profile.powerUse) continue;
      const d = powerDef(ps.id);
      let target: { x: number; y: number } | null = null;
      switch (d.kind) {
        case 'strike':
        case 'dot':
        case 'freeze':
        case 'slow':
          target = this.bestEnemyCluster(d.radius, 3);
          break;
        case 'heal':
          target = this.hurtCluster(d.radius);
          break;
        case 'summon':
          target =
            this.lastThreat && w.tick - this.lastThreat.tick < TPS * 5
              ? this.lastThreat
              : this.wave
                ? this.frontOfArmy()
                : null;
          break;
        case 'boost': {
          const eco = d.boost?.some((m) => m.stat === 'gather');
          const army = d.boost?.some((m) => m.stat === 'speed' || m.stat === 'armor');
          if (eco && this.mine((e) => e.cls === 'worker').length >= 10) target = { x: 0, y: 0 };
          else if (army && (this.wave || this.lastThreat) && this.bestEnemyCluster(6, 4))
            target = { x: 0, y: 0 };
          else if (
            !eco &&
            !army &&
            this.mine((e) => e.kind === 'building' && e.queue.length > 0).length >= 2
          )
            target = { x: 0, y: 0 };
          break;
        }
        case 'reveal':
          if (this.known.size === 0) target = this.enemyStart();
          break;
      }
      if (!target) continue;
      this.cmd({ type: 'castPower', player: this.me, power: ps.id, x: target.x, y: target.y });
      this.say(`power ${ps.id}`);
      return; // one per think
    }
  }

  /** Visible enemy unit with the most enemies around it (weighted for heroes/mythic). */
  private bestEnemyCluster(radius: number, minValue: number): { x: number; y: number } | null {
    const w = this.world;
    const foes = w.entities.filter(
      (e) =>
        !e.dead &&
        e.kind === 'unit' &&
        e.owner >= 0 &&
        e.owner !== this.me &&
        visibleFor(w, this.me, e),
    );
    let best: Entity | null = null;
    let bestV = minValue - 0.01;
    for (const f of foes.slice(0, 80)) {
      let v = 0;
      let friendly = 0;
      for (const o of w.spatial.query(f.x, f.y, radius)) {
        if (o.owner === this.me) friendly++;
        else if (o.owner >= 0)
          v += o.cls === 'hero' || o.cls === 'mythic' ? 3 : o.cls === 'worker' ? 0.5 : 1;
      }
      v -= friendly * 0.5;
      if (v > bestV) {
        bestV = v;
        best = f;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private hurtCluster(radius: number): { x: number; y: number } | null {
    const w = this.world;
    let best: Entity | null = null;
    let bestMissing = 150;
    for (const u of this.armyUnits()) {
      if (w.tick - u.lastHit > TPS * 3) continue;
      let missing = 0;
      for (const o of w.spatial.query(u.x, u.y, radius))
        if (o.owner === this.me) missing += o.maxHp - o.hp;
      if (missing > bestMissing) {
        bestMissing = missing;
        best = u;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private frontOfArmy(): { x: number; y: number } | null {
    if (!this.wave) return null;
    const army = this.armyUnits();
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const u of army) {
      const d = (u.x - this.wave.tx) ** 2 + (u.y - this.wave.ty) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best && this.bestEnemyCluster(8, 2) ? { x: best.x, y: best.y } : null;
  }

  private heroes(): void {
    const w = this.world;
    for (const h of this.mine((e) => e.cls === 'hero')) {
      const ab = unitDef(h.def).ability;
      if (!ab || h.abilityReadyAt > w.tick) continue;
      let enemies = 0;
      let hurt = 0;
      for (const o of w.spatial.query(h.x, h.y, ab.radius)) {
        if (o.owner === this.me) hurt += o.maxHp - o.hp > 40 ? 1 : 0;
        else if (o.owner >= 0) enemies++;
      }
      const use =
        ab.kind === 'thunderclap'
          ? enemies >= 2
          : hurt >= 3 || (ab.kind === 'rally' && enemies >= 3);
      if (use) this.cmd({ type: 'ability', player: this.me, id: h.id });
    }
  }

  /** Text for the AI debug overlay. */
  debugText(): string {
    const w = this.world;
    if (!w) return '';
    const p = w.players[this.me]!;
    const army = this.armyUnits();
    const workers = this.mine((e) => e.cls === 'worker').length;
    const mix = Object.entries(this.enemyMix)
      .filter(([, n]) => (n ?? 0) > 0.5)
      .map(([c, n]) => `${c[0]}${Math.round(n ?? 0)}`)
      .join(' ');
    const g = { food: 0, wood: 0, gold: 0, idle: 0, build: 0, other: 0 };
    for (const u of this.mine((e) => e.cls === 'worker')) {
      if (u.order.type === 'idle') g.idle++;
      else if (u.order.type === 'build') g.build++;
      else {
        const k = gatherKind(w, u) ?? u.carryKind;
        if (k === 'food' || k === 'wood' || k === 'gold') g[k]++;
        else g.other++;
      }
    }
    return [
      `AI ${this.difficulty} p${this.me} age ${p.age} workers ${workers}/${this.profile.workers[p.age]}`,
      `F${g.food} W${g.wood} G${g.gold} idle${g.idle} build${g.build} ?${g.other} farms ${countOwned(w, this.me, 'farm', false)}`,
      `army ${army.length} str ${this.strength(army).toFixed(1)} wave ${this.wave ? 'ON' : 'off'} sent ${this.wavesSent}`,
      `seen ${mix || '-'} known bldg ${this.known.size}`,
      ...this.log.slice(-4),
    ].join('\n');
  }
}
