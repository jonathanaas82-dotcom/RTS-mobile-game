import { GAME_NAME, GAME_VERSION } from '../../config/game';
import { FACTIONS, UNITS, factionDef, godDef, loc, powerDef } from '../../data';
import { AI_PROFILES } from '../../data/ai';
import { MAP_SIZES, type MapSizeKey } from '../../data/balance/map';
import type { FactionId } from '../../data/types';
import { getLanguage, setLanguage, t, type Language } from '../../i18n';
import { hashSeed } from '../../sim/core/rng';
import type { Difficulty, MatchConfig } from '../../sim/world';
import { drawUnit } from '../../render/assets/procedural/units';
import { godPortrait } from '../godPortrait';
import { el, onPress } from '../hud/dom';
import { menuBackdrop } from './backdrop';
import { renderCodex, type CodexState } from './codex';
import { saveSettings, type GraphicsQuality, type Settings } from '../settings';
import { loadStats, saveStats } from '../stats';

export interface MenuCallbacks {
  start(config: MatchConfig): void;
  tutorial(): void;
  settingsChanged(s: Settings): void;
  click(): void;
}

interface PreMatch {
  faction: FactionId;
  god: string;
  size: MapSizeKey;
  seed: string;
  difficulty: Exclude<Difficulty, 'passive'>;
}

const EMBLEM = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset="1" stop-color="#b48a2c"/></linearGradient></defs><path d="M14 40h36c-2 6-8 8-13 9v5h6v5H21v-5h6v-5c-5-1-12-4-13-9z" fill="#6f665c"/><path d="M36 6L22 30h10l-6 16 18-24H34l6-16z" fill="url(#eg)" stroke="#6d4f12" stroke-width="1.5"/></svg>`;

/** Small inline icons for the main menu buttons. */
const MENU_ICONS = {
  skirmish: '<svg viewBox="0 0 24 24"><path d="M5 19L17 4l2 1-11 15zM19 19L7 4 5 5l11 15z"/></svg>',
  tutorial:
    '<svg viewBox="0 0 24 24"><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6v14" stroke="currentColor" stroke-width="2"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.5 4l2-1.5-2-3.5-2.4.8a8 8 0 0 0-1.7-1L16 4h-4l-.4 2.8a8 8 0 0 0-1.7 1L7.5 7 5.5 10.5 7.5 12l-2 1.5 2 3.5 2.4-.8a8 8 0 0 0 1.7 1L12 20h4l.4-2.8a8 8 0 0 0 1.7-1l2.4.8 2-3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  stats:
    '<svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  codex:
    '<svg viewBox="0 0 24 24"><path d="M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 18a3 3 0 0 1 3-3h11M10 7h6M10 10h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  credits:
    '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

const portraits = new Map<string, string>();
/** Data-URL portrait of a faction's hero (for the faction cards). */
function factionPortrait(id: FactionId): string {
  let url = portraits.get(id);
  if (!url) {
    const hero = UNITS.find((u) => u.faction === id && u.cls === 'hero') ?? UNITS[0]!;
    url = drawUnit(hero, '#c9a24a').toDataURL();
    portraits.set(id, url);
  }
  return url;
}

/** Full-screen DOM menus: main menu, pre-match setup, settings, statistics, credits. */
export class Menus {
  private readonly root: HTMLElement;
  private readonly settings: Settings;
  private readonly cb: MenuCallbacks;
  private pre: PreMatch;
  private backFromSettings: (() => void) | null = null;

  constructor(root: HTMLElement, settings: Settings, cb: MenuCallbacks) {
    this.root = root;
    this.settings = settings;
    this.cb = cb;
    this.pre = {
      faction: 'hrimfolk',
      god: 'thunrak',
      size: 'medium',
      seed: '',
      difficulty: 'normal',
    };
  }

  hide(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  private screen(cls: string): HTMLElement {
    this.root.hidden = false;
    this.root.innerHTML = '';
    this.root.style.setProperty('--backdrop', `url(${menuBackdrop()})`);
    // Drifting embers over the backdrop (pure decoration).
    const embers = el('div', 'embers', this.root);
    embers.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 16; i++) {
      const e = el('i', '', embers);
      e.style.left = `${(i * 61) % 100}%`;
      e.style.animationDelay = `${-((i * 1.7) % 9)}s`;
      e.style.animationDuration = `${7 + ((i * 3) % 6)}s`;
    }
    const s = el('div', `menu-screen ${cls}`, this.root);
    s.dataset.scroll = '1';
    return s;
  }

  private button(
    parent: HTMLElement,
    label: string,
    onTap: () => void,
    cls = 'menu-btn',
    icon?: string,
  ): HTMLButtonElement {
    const b = el('button', cls, parent);
    b.type = 'button';
    if (icon) {
      el('span', 'btn-icon', b).innerHTML = icon;
      el('span', 'btn-text', b).textContent = label;
    } else b.textContent = label;
    onPress(b, () => {
      this.cb.click();
      onTap();
    });
    return b;
  }

  private header(s: HTMLElement, title: string, back?: () => void): HTMLElement {
    const h = el('div', 'menu-header', s);
    if (back) {
      const b = this.button(h, '‹', back, 'menu-back');
      b.setAttribute('aria-label', t('menu.back'));
    }
    el('h2', '', h).textContent = title;
    return h;
  }

  // ───────────── main ─────────────

  showMain(): void {
    const s = this.screen('menu-main');
    const hero = el('div', 'main-hero', s);
    const logo = el('div', 'menu-logo', hero);
    logo.innerHTML = EMBLEM;
    el('h1', 'menu-title', hero).textContent = GAME_NAME;
    el('div', 'menu-rule', hero);
    el('p', 'menu-tag', hero).textContent = t('menu.tagline');
    const list = el('div', 'menu-list', s);
    this.button(
      list,
      t('menu.skirmish'),
      () => this.showPreMatch(),
      'menu-btn primary',
      MENU_ICONS.skirmish,
    );
    const row0 = el('div', 'menu-row', list);
    this.button(
      row0,
      t('menu.tutorial'),
      () => this.cb.tutorial(),
      'menu-btn',
      MENU_ICONS.tutorial,
    );
    this.button(row0, t('menu.codex'), () => this.showCodex(), 'menu-btn', MENU_ICONS.codex);
    this.button(
      list,
      t('menu.settings'),
      () => this.showSettings(() => this.showMain()),
      'menu-btn',
      MENU_ICONS.settings,
    );
    const row = el('div', 'menu-row', list);
    this.button(row, t('menu.stats'), () => this.showStats(), 'menu-btn small', MENU_ICONS.stats);
    this.button(
      row,
      t('menu.credits'),
      () => this.showCredits(),
      'menu-btn small',
      MENU_ICONS.credits,
    );
    el('div', 'menu-foot', s).textContent = `v${GAME_VERSION}`;
  }

  // ───────────── pre-match ─────────────

  showPreMatch(): void {
    const lang = getLanguage();
    const s = this.screen('menu-pre');
    const head = this.header(s, t('menu.skirmish'), () => this.showMain());
    this.button(head, t('pre.start'), () => this.cb.start(this.config()), 'menu-btn primary start');
    const body = el('div', 'pre-body', s);

    el('h3', 'pre-label', body).textContent = t('pre.faction');
    const facs = el('div', 'pre-cards', body);
    for (const f of FACTIONS) {
      const c = el('button', 'pre-card' + (f.id === this.pre.faction ? ' selected' : ''), facs);
      c.type = 'button';
      c.style.setProperty('--accent', f.style.roof);
      const img = el('img', 'card-portrait', c);
      img.src = factionPortrait(f.id);
      img.alt = '';
      const tx = el('div', 'card-text', c);
      el('div', 'card-title', tx).textContent = loc(f.name, lang);
      el('div', 'card-body', tx).textContent = loc(f.desc, lang);
      onPress(c, () => {
        this.cb.click();
        this.pre.faction = f.id;
        if (!f.majorGods.includes(this.pre.god)) this.pre.god = f.majorGods[0]!;
        this.showPreMatch();
      });
    }

    el('h3', 'pre-label', body).textContent = t('pre.god');
    const gods = el('div', 'pre-cards two', body);
    for (const gid of factionDef(this.pre.faction).majorGods) {
      const g = godDef(gid);
      const c = el('button', 'pre-card' + (gid === this.pre.god ? ' selected' : ''), gods);
      c.type = 'button';
      const pw = powerDef(g.power);
      const img = el('img', 'card-portrait god', c);
      img.src = godPortrait(g);
      img.alt = '';
      const tx = el('div', 'card-text', c);
      el('div', 'card-title', tx).textContent = `${loc(g.name, lang)} — ${loc(g.title, lang)}`;
      el('div', 'card-body', tx).textContent =
        `${loc(g.desc, lang)} ${t('age.power')}: ${loc(pw.name, lang)}.`;
      onPress(c, () => {
        this.cb.click();
        this.pre.god = gid;
        this.showPreMatch();
      });
    }

    const opts = el('div', 'pre-opts', body);
    const seg = (
      label: string,
      items: Array<[string, string]>,
      cur: string,
      set: (v: string) => void,
    ): void => {
      const g = el('div', 'pre-opt', opts);
      el('div', 'pre-label', g).textContent = label;
      const row = el('div', 'segmented', g);
      for (const [v, text] of items) {
        const b = this.button(
          row,
          text,
          () => {
            set(v);
            this.showPreMatch();
          },
          'seg-btn' + (v === cur ? ' selected' : ''),
        );
        b.setAttribute('aria-pressed', String(v === cur));
      }
    };
    seg(
      t('pre.difficulty'),
      [
        ['easy', t('diff.easy')],
        ['normal', t('diff.normal')],
        ['hard', t('diff.hard')],
      ],
      this.pre.difficulty,
      (v) => (this.pre.difficulty = v as PreMatch['difficulty']),
    );
    seg(
      t('pre.size'),
      [
        ['small', t('size.small')],
        ['medium', t('size.medium')],
        ['large', t('size.large')],
      ],
      this.pre.size,
      (v) => (this.pre.size = v as MapSizeKey),
    );
    const seedBox = el('div', 'pre-opt', opts);
    el('div', 'pre-label', seedBox).textContent = t('pre.seed');
    const seedRow = el('div', 'seed-row', seedBox);
    const input = el('input', 'seed-input', seedRow);
    input.type = 'text';
    input.placeholder = t('pre.random');
    input.value = this.pre.seed;
    input.maxLength = 24;
    input.addEventListener('input', () => (this.pre.seed = input.value.trim()));
    this.button(
      seedRow,
      '🎲',
      () => {
        this.pre.seed = String(Math.floor(Math.random() * 1e6));
        input.value = this.pre.seed;
      },
      'seg-btn',
    );

    const hardNote = AI_PROFILES.hard.gatherBonus;
    el('p', 'pre-note', body).textContent =
      this.pre.difficulty === 'hard'
        ? t('pre.hardNote', { pct: Math.round((hardNote - 1) * 100) })
        : t('pre.fairNote');
  }

  private config(): MatchConfig {
    const seed = this.pre.seed
      ? /^\d+$/.test(this.pre.seed)
        ? Number(this.pre.seed) >>> 0
        : hashSeed(this.pre.seed)
      : (Math.random() * 2 ** 32) >>> 0;
    const ai = FACTIONS.filter((f) => f.id !== this.pre.faction);
    const aiFaction = ai[seed % ai.length]!;
    return {
      seed,
      mapSize: MAP_SIZES[this.pre.size],
      players: [
        { faction: this.pre.faction, majorGod: this.pre.god, ai: null },
        {
          faction: aiFaction.id,
          majorGod: aiFaction.majorGods[(seed >>> 3) % aiFaction.majorGods.length]!,
          ai: this.pre.difficulty,
        },
      ],
    };
  }

  // ───────────── settings ─────────────

  showSettings(back: () => void): void {
    this.backFromSettings = back;
    const st = this.settings;
    const s = this.screen('menu-settings');
    this.header(s, t('menu.settings'), () => {
      saveSettings(st);
      this.backFromSettings?.();
    });
    const body = el('div', 'set-body', s);
    const changed = (): void => {
      saveSettings(st);
      this.cb.settingsChanged(st);
    };
    const row = (label: string): HTMLElement => {
      const r = el('div', 'set-row', body);
      el('div', 'set-label', r).textContent = label;
      return el('div', 'set-ctrl', r);
    };
    const segRow = <T extends string>(
      label: string,
      items: Array<[T, string]>,
      get: () => T,
      set: (v: T) => void,
    ): void => {
      const c = row(label);
      const seg = el('div', 'segmented', c);
      for (const [v, text] of items) {
        this.button(
          seg,
          text,
          () => {
            set(v);
            changed();
            this.showSettings(back);
          },
          'seg-btn' + (get() === v ? ' selected' : ''),
        );
      }
    };
    const slider = (
      label: string,
      min: number,
      max: number,
      step: number,
      get: () => number,
      set: (v: number) => void,
      fmt: (v: number) => string,
    ): void => {
      const c = row(label);
      const input = el('input', 'set-range', c);
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      const out = el('span', 'set-val', c);
      out.textContent = fmt(get());
      input.addEventListener('input', () => {
        set(Number(input.value));
        out.textContent = fmt(Number(input.value));
        changed();
      });
    };
    segRow<Language>(
      'Language / Språk',
      [
        ['en', 'English'],
        ['nb', 'Norsk'],
      ],
      () => st.language,
      (v) => {
        st.language = v;
        setLanguage(v);
        document.documentElement.lang = v;
      },
    );
    slider(
      t('set.volume'),
      0,
      1,
      0.05,
      () => st.masterVolume,
      (v) => (st.masterVolume = v),
      (v) => `${Math.round(v * 100)}%`,
    );
    segRow<'on' | 'off'>(
      t('set.sound'),
      [
        ['on', t('set.on')],
        ['off', t('set.off')],
      ],
      () => (st.muted ? 'off' : 'on'),
      (v) => (st.muted = v === 'off'),
    );
    segRow<'on' | 'off'>(
      t('set.music'),
      [
        ['on', t('set.on')],
        ['off', t('set.off')],
      ],
      () => (st.music ? 'on' : 'off'),
      (v) => (st.music = v === 'on'),
    );
    segRow<GraphicsQuality>(
      t('set.graphics'),
      [
        ['low', t('set.low')],
        ['medium', t('set.medium')],
        ['high', t('set.high')],
      ],
      () => st.graphics,
      (v) => (st.graphics = v),
    );
    slider(
      t('set.uiScale'),
      0.8,
      1.4,
      0.05,
      () => st.uiScale,
      (v) => (st.uiScale = v),
      (v) => `${Math.round(v * 100)}%`,
    );
    segRow<'right' | 'left'>(
      t('set.hand'),
      [
        ['right', t('set.right')],
        ['left', t('set.left')],
      ],
      () => st.handedness,
      (v) => (st.handedness = v),
    );
    segRow<'on' | 'off'>(
      t('set.haptics'),
      [
        ['on', t('set.on')],
        ['off', t('set.off')],
      ],
      () => (st.haptics ? 'on' : 'off'),
      (v) => (st.haptics = v === 'on'),
    );
    segRow<'on' | 'off'>(
      t('set.debug'),
      [
        ['on', t('set.on')],
        ['off', t('set.off')],
      ],
      () => (st.showDebug ? 'on' : 'off'),
      (v) => (st.showDebug = v === 'on'),
    );
    el('p', 'pre-note', body).textContent = t('set.graphicsNote');
  }

  // ───────────── codex ─────────────

  private codex: CodexState = { tab: 'gods', god: 'thunrak', faction: 'hrimfolk', unit: null };

  showCodex(): void {
    const s = this.screen('menu-codex');
    const head = this.header(s, t('menu.codex'), () => this.showMain());
    const tabs = el('div', 'segmented codex-tabs', head);
    for (const tab of ['gods', 'units'] as const) {
      const b = this.button(
        tabs,
        t(`codex.${tab}`),
        () => {
          this.codex.tab = tab;
          this.showCodex();
        },
        'seg-btn' + (this.codex.tab === tab ? ' selected' : ''),
      );
      b.setAttribute('aria-pressed', String(this.codex.tab === tab));
    }
    const body = el('div', 'codex-body', s);
    renderCodex(
      body,
      this.codex,
      () => {
        const y = this.root.scrollTop;
        this.showCodex();
        this.root.scrollTop = y;
      },
      () => this.cb.click(),
    );
  }

  // ───────────── stats & credits ─────────────

  showStats(): void {
    const s = this.screen('menu-stats');
    this.header(s, t('menu.stats'), () => this.showMain());
    const st = loadStats();
    const body = el('div', 'set-body', s);
    const line = (k: string, v: string): void => {
      const r = el('div', 'set-row', body);
      el('div', 'set-label', r).textContent = k;
      el('div', 'set-ctrl', r).textContent = v;
    };
    line(t('stats.played'), String(st.played));
    line(t('stats.won'), String(st.won));
    line(t('stats.lost'), String(st.lost));
    line(
      t('stats.best'),
      st.bestWin
        ? `${Math.floor(st.bestWin / 60)}:${String(st.bestWin % 60).padStart(2, '0')}`
        : '–',
    );
    this.button(
      body,
      t('stats.reset'),
      () => {
        saveStats({ played: 0, won: 0, lost: 0, bestWin: 0, tutorialDone: st.tutorialDone });
        this.showStats();
      },
      'menu-btn small',
    );
  }

  showCredits(): void {
    const s = this.screen('menu-credits');
    this.header(s, t('menu.credits'), () => this.showMain());
    const body = el('div', 'set-body', s);
    el('p', 'credits', body).textContent = t('credits.body', { game: GAME_NAME });
  }
}
