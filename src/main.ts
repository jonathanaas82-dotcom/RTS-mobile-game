import './ui/styles.css';
import './ui/menus/menus.css';
import { sfx } from './audio/Sfx';
import { GAME_NAME } from './config/game';
import { MAP_SIZES } from './data/balance/map';
import { FACTIONS, factionDef } from './data';
import type { FactionId } from './data/types';
import { onLanguageChange, setLanguage, t, type TranslationKey } from './i18n';
import { registerServiceWorker, suppressBrowserGestures } from './platform/pwa';
import type { AppContext, MatchStartData } from './render/context';
import { createGame } from './render/game';
import { BOOT_READY } from './render/scenes/BootScene';
import { hashSeed } from './sim/core/rng';
import { spawnUnit, type MatchConfig, type World } from './sim/world';
import { Hud } from './ui/hud/Hud';
import { Menus } from './ui/menus/Menus';
import { loadSettings, maxPixelRatio } from './ui/settings';
import { recordResult } from './ui/stats';

suppressBrowserGestures();
registerServiceWorker();

const settings = loadSettings();
setLanguage(settings.language);
document.documentElement.lang = settings.language;
document.title = GAME_NAME;
const translateStatic = (): void => {
  document.querySelectorAll<HTMLElement>('body > [data-i18n], #rotate [data-i18n]').forEach((n) => {
    n.textContent = t(n.dataset.i18n as TranslationKey, { game: GAME_NAME });
  });
};
translateStatic();

const hud = new Hud(document.getElementById('hud') as HTMLElement);
const ctx: AppContext = {
  settings,
  renderScale: Math.min(window.devicePixelRatio || 1, maxPixelRatio(settings.graphics)),
  hud,
  match: null,
  sfx,
};
hud.attach(ctx);
sfx.setVolume(settings.masterVolume, settings.muted);

const game = createGame(document.getElementById('game') as HTMLElement, ctx);
let current: MatchStartData | null = null;

const menus = new Menus(document.getElementById('menu') as HTMLElement, settings, {
  start: (config) => startMatch({ config }),
  tutorial: () => startMatch({ config: tutorialConfig(), tutorial: true }),
  settingsChanged: (s) => {
    hud.applySettings();
    sfx.setVolume(s.masterVolume, s.muted);
  },
  click: () => sfx.play('click'),
});

function tutorialConfig(): MatchConfig {
  return {
    seed: 20251,
    mapSize: MAP_SIZES.small,
    players: [
      { faction: 'hrimfolk', majorGod: 'thunrak', ai: null },
      { faction: 'aurelian', majorGod: 'aetheon', ai: 'passive' },
    ],
  };
}

function startMatch(data: MatchStartData): void {
  current = data;
  menus.hide();
  hud.showModal(null);
  game.scene.stop('World');
  game.scene.start('World', data);
}

function toMenu(): void {
  current = null;
  game.scene.stop('World');
  hud.showModal(null);
  hud.show(false);
  menus.showMain();
  sfx.music('menu');
}

ctx.toMenu = toMenu;
ctx.restart = () => {
  if (!current) return toMenu();
  const c = current.config;
  startMatch({ ...current, config: { ...c, seed: (c.seed * 1664525 + 1013904223) >>> 0 } });
};
ctx.openSettings = (onClose) =>
  menus.showSettings(() => {
    menus.hide();
    onClose();
  });
ctx.onMatchEnd = (won, world) => {
  if (current?.tutorial) return;
  recordResult(won, Math.floor(world.tick / 20));
};
onLanguageChange(() => {
  translateStatic();
  hud.applyI18n();
});

// Unlock audio on the first touch (browser autoplay policy) and click on any button press.
document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
document.addEventListener(
  'pointerdown',
  (e) => {
    if (
      (e.target as HTMLElement | null)?.closest(
        '.hud-btn, .modal-choice, .banner-btn, .btn-primary, .btn-secondary',
      )
    )
      sfx.play('click');
  },
  { capture: true },
);

// Auto-pause when the app is backgrounded (phone call, app switch).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ctx.match && !ctx.match.isPaused()) ctx.match.openMenu();
});

/**
 * Deep links for testing and sharing: ?play=1 starts a skirmish directly, with optional
 * &seed=word &size=48 &faction=aurelian &god=thalassine &ai=hard. ?tutorial=1 starts the tutorial.
 */
function urlMatch(): MatchStartData | null {
  const params = new URLSearchParams(location.search);
  if (params.get('tutorial')) return { config: tutorialConfig(), tutorial: true };
  if (!params.get('play') && !params.get('seed') && !params.get('faction')) return null;
  const seedParam = params.get('seed');
  const seed = seedParam
    ? /^\d+$/.test(seedParam)
      ? Number(seedParam) >>> 0
      : hashSeed(seedParam)
    : Date.now() >>> 0;
  const sizeParam = Number(params.get('size'));
  const mapSize = sizeParam >= 32 && sizeParam <= 128 ? sizeParam : MAP_SIZES.medium;
  const factionParam = (params.get('faction') ?? 'hrimfolk') as FactionId;
  const faction = FACTIONS.some((f) => f.id === factionParam) ? factionParam : 'hrimfolk';
  const majorParam = params.get('god');
  const majorGod =
    majorParam && factionDef(faction).majorGods.includes(majorParam)
      ? majorParam
      : factionDef(faction).majorGods[0]!;
  const aiParam = params.get('ai');
  const ai = aiParam === 'easy' || aiParam === 'hard' || aiParam === 'passive' ? aiParam : 'normal';
  const aiFaction = FACTIONS.find((f) => f.id !== faction)!;
  return {
    config: {
      seed,
      mapSize,
      players: [
        { faction, majorGod, ai: null },
        {
          faction: aiFaction.id,
          majorGod: aiFaction.majorGods[seed % aiFaction.majorGods.length]!,
          ai,
        },
      ],
    },
  };
}

game.events.once(BOOT_READY, () => {
  const direct = urlMatch();
  if (direct) startMatch(direct);
  else toMenu();
});

// Exposed for e2e tests and debugging in the console.
(window as unknown as { __godforge: unknown }).__godforge = {
  game,
  ctx,
  menus,
  /** Debug/e2e helper: spawn a unit in the running match. */
  spawn: (owner: number, def: string, x: number, y: number) => {
    const scene = game.scene.getScene('World') as unknown as { sim?: { world: World } } | null;
    return scene?.sim ? spawnUnit(scene.sim.world, owner, def, x, y).id : -1;
  },
};
