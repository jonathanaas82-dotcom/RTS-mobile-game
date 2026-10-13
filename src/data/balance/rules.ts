/** Miscellaneous rule constants (seconds / tiles unless stated). */
export const RULES = {
  /** Favor cap per player. */
  maxFavor: 200,
  /** Hrimfolk: Favor per point of damage dealt by military units. */
  combatFavorPerDamage: 0.012,
  /** Aurelian: extra Favor/s per living hero. */
  heroFavorRate: 0.1,
  /** Units heal this many HP/s when out of combat for `regenDelay` (heroes only). */
  heroRegen: 2,
  regenDelay: 8,
  /** Workers look for more of the same resource within this radius when one runs out. */
  resourceSearchRadius: 10,
  /** Military units auto-acquire enemies within sight; buildings within attack range. */
  autoAcquire: true,
  /** How often (ticks) fog of war is recomputed. */
  fogInterval: 4,
  /** Max A* searches per tick (the rest wait a tick). */
  pathBudgetPerTick: 24,
  /** Repath chasing units every N ticks. */
  chaseRepathTicks: 10,
  /** Seconds a summoned unit lives by default. */
  summonLifetime: 45,
  /** Building under construction starts with this fraction of HP. */
  foundationHp: 0.1,
  /** Max queued items per building. */
  maxQueue: 5,
  /** Seconds after which a player who has no main building and no army is defeated. */
  defeatCheckInterval: 1,
  /** Construction distance tolerance (tiles from footprint edge). */
  workReach: 0.75,
  /** Farm food per gather cycle multiplier (relative to worker food rate). */
  farmRate: 0.85,
} as const;
