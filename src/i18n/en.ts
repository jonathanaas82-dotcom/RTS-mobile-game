/** English strings. This file defines the set of valid translation keys. */
export const en = {
  'app.loading': 'Forging the world…',
  'rotate.title': 'Turn your device',
  'rotate.body': '{game} is played in landscape.',
  'res.food': 'Food',
  'res.wood': 'Wood',
  'res.gold': 'Gold',
  'res.favor': 'Favor',
  'res.pop': 'Population',
  'hud.pause': 'Pause',
  'hud.resume': 'Resume',
  'hud.speed': 'Game speed',
  'hud.fullscreen': 'Fullscreen',
  'hud.debug': 'Debug info',
  'hud.paused': 'Paused',
  'hud.hint': 'Drag to move · pinch to zoom · tap to inspect',
  'hud.tapInfo': 'Tile {x}, {y}: {terrain}',
  'terrain.0': 'Grass',
  'terrain.1': 'Sand',
  'terrain.2': 'Forest',
  'terrain.3': 'Water',
  'terrain.4': 'Cliff',
  'feature.gold': 'Gold mine ({amount})',
  'feature.berries': 'Berry bush ({amount})',
} as const;

export type TranslationKey = keyof typeof en;
