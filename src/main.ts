import './ui/styles.css';
import { GAME_NAME } from './config/game';
import { MAP_SIZES } from './data/balance/map';
import { FACTIONS, factionDef } from './data';
import type { FactionId } from './data/types';
import { setLanguage, t, type TranslationKey } from './i18n';
import { registerServiceWorker, suppressBrowserGestures } from './platform/pwa';
import type { AppContext } from './render/context';
import { createGame } from './render/game';
import { hashSeed } from './sim/core/rng';
import { spawnUnit, type MatchConfig, type World } from './sim/world';
import { Hud } from './ui/hud/Hud';
import { loadSettings, maxPixelRatio } from './ui/settings';

suppressBrowserGestures();
registerServiceWorker();

const settings = loadSettings();
setLanguage(settings.language);
document.documentElement.lang = settings.language;
document.title = GAME_NAME;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((n) => {
  n.textContent = t(n.dataset.i18n as TranslationKey, { game: GAME_NAME });
});

// Match parameters can be forced from the URL for testing: ?seed=abc&size=48
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam
  ? /^\d+$/.test(seedParam)
    ? Number(seedParam) >>> 0
    : hashSeed(seedParam)
  : Date.now() >>> 0;
const sizeParam = Number(params.get('size'));
const mapSize = sizeParam >= 32 && sizeParam <= 128 ? sizeParam : MAP_SIZES.medium;

const hud = new Hud(document.getElementById('hud') as HTMLElement);
const ctx: AppContext = {
  settings,
  renderScale: Math.min(window.devicePixelRatio || 1, maxPixelRatio(settings.graphics)),
  hud,
  match: null,
};
hud.attach(ctx);

// Faction / god / difficulty can be forced from the URL until the pre-match screen (M8).
const factionParam = (params.get('faction') ?? 'hrimfolk') as FactionId;
const faction = FACTIONS.some((f) => f.id === factionParam) ? factionParam : 'hrimfolk';
const majorParam = params.get('god');
const majorGod =
  majorParam && factionDef(faction).majorGods.includes(majorParam)
    ? majorParam
    : factionDef(faction).majorGods[0]!;
const aiFaction = FACTIONS.find((f) => f.id !== faction)!;
const match: MatchConfig = {
  seed,
  mapSize,
  players: [
    { faction, majorGod, ai: null },
    {
      faction: aiFaction.id,
      majorGod: aiFaction.majorGods[seed % aiFaction.majorGods.length]!,
      ai: 'normal',
    },
  ],
};
const game = createGame(document.getElementById('game') as HTMLElement, ctx, match);
ctx.restart = () => {
  hud.showModal(null);
  game.scene.stop('World');
  game.scene.start('World', { ...match, seed: (match.seed * 1664525 + 1013904223) >>> 0 });
};
ctx.toMenu = ctx.restart;

// Auto-pause when the app is backgrounded (phone call, app switch).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) ctx.match?.setPaused(true);
});

// Exposed for e2e tests and debugging in the console.
(window as unknown as { __godforge: unknown }).__godforge = {
  game,
  ctx,
  /** Debug/e2e helper: spawn a unit in the running match. */
  spawn: (owner: number, def: string, x: number, y: number) => {
    const scene = game.scene.getScene('World') as unknown as { sim: { world: World } } | null;
    return scene ? spawnUnit(scene.sim.world, owner, def, x, y).id : -1;
  },
};
