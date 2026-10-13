/** Economy balance values. */
export type ResourceKind = 'food' | 'wood' | 'gold' | 'favor';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['food', 'wood', 'gold', 'favor'];

export const ECONOMY = {
  startingResources: { food: 300, wood: 200, gold: 100, favor: 0 } satisfies Record<
    ResourceKind,
    number
  >,
  startingWorkers: 3,
  startingPopCap: 10,
  popPerHouse: 10,
  maxPop: 200,
} as const;
