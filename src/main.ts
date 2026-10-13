import './ui/styles.css';
import { GAME_NAME } from './config/game';
import { MAP_SIZES } from './data/balance/map';
import { setLanguage, t, type TranslationKey } from './i18n';
import { registerServiceWorker, suppressBrowserGestures } from './platform/pwa';
import type { AppContext } from './render/context';
import { createGame } from './render/game';
import { hashSeed } from './sim/core/rng';
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

const game = createGame(document.getElementById('game') as HTMLElement, ctx, { seed, mapSize });

// Auto-pause when the app is backgrounded (phone call, app switch).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) ctx.match?.setPaused(true);
});

// Exposed for e2e tests and debugging in the console.
(window as unknown as { __godforge: unknown }).__godforge = { game, ctx };
