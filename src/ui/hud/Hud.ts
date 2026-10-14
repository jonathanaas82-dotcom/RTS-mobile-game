import { RESOURCE_KINDS, type ResourceKind } from '../../data/balance/economy';
import { onLanguageChange, t, type TranslationKey } from '../../i18n';
import { fullscreenSupported, toggleFullscreen } from '../../platform/pwa';
import type { AppContext, DebugStats, HudPort } from '../../render/context';
import { ICONS } from './icons';
import { el, onPress } from './dom';
import type { BannerSpec, ButtonSpec, ModalSpec, SelectionView } from './types';

/**
 * DOM heads-up display layered over the canvas. Plain DOM (no framework): it is small, updates
 * rarely, and CSS handles safe areas, scaling, handedness and themes. All game-specific content
 * arrives as data (ButtonSpec, SelectionView…) from the scene, so the HUD has no game logic.
 */
export class Hud implements HudPort {
  private readonly root: HTMLElement;
  private ctx: AppContext | null = null;
  private readonly resEls = new Map<ResourceKind | 'pop', HTMLElement>();
  private readonly ageEl: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly powersEl: HTMLElement;
  private readonly toolsEl: HTMLElement;
  private readonly boxBtn: HTMLButtonElement;
  private readonly idleBtn: HTMLButtonElement;
  private readonly armyBtn: HTMLButtonElement;
  private readonly groupsEl: HTMLElement;
  private readonly groupBtns: HTMLButtonElement[] = [];
  private readonly selEl: HTMLElement;
  private readonly cmdEl: HTMLElement;
  readonly minimapSlot: HTMLElement;
  private readonly alertBtn: HTMLButtonElement;
  private readonly bannerEl: HTMLElement;
  private readonly modalEl: HTMLElement;
  private readonly boxEl: HTMLElement;
  private readonly announceEl: HTMLElement;
  private infoTimer = 0;
  private alertTimer = 0;
  private selKey = '';

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = '';

    // ── top bar ──
    const top = el('div', 'hud-top', root);
    const res = el('div', 'hud-panel hud-resources', top);
    for (const kind of [...RESOURCE_KINDS, 'pop'] as const) {
      const item = el('div', `res res-${kind}`, res);
      item.innerHTML = `<span class="res-icon">${ICONS[kind]}</span><span class="res-val">0</span>`;
      item.dataset.i18nTitle = kind === 'pop' ? 'res.pop' : `res.${kind}`;
      this.resEls.set(kind, item.querySelector('.res-val') as HTMLElement);
    }
    this.ageEl = el('div', 'res-age', res);
    this.powersEl = el('div', 'hud-powers', top);
    const controls = el('div', 'hud-panel hud-controls', top);
    this.pauseBtn = iconButton(controls, 'hud.pause', ICONS.pause, () =>
      this.ctx?.match?.openMenu(),
    );
    this.speedBtn = iconButton(controls, 'hud.speed', '<span class="speed-label">1×</span>', () =>
      this.cycleSpeed(),
    );
    if (fullscreenSupported())
      iconButton(controls, 'hud.fullscreen', ICONS.fullscreen, () => void toggleFullscreen());

    // ── left tools ──
    this.toolsEl = el('div', 'hud-tools', root);
    this.boxBtn = iconButton(this.toolsEl, 'hud.boxSelect', ICONS.box, () =>
      this.ctx?.match?.toggleBoxMode(),
    );
    this.idleBtn = iconButton(this.toolsEl, 'hud.idleWorkers', ICONS.idle, () =>
      this.ctx?.match?.selectIdleWorkers(),
    );
    this.armyBtn = iconButton(this.toolsEl, 'hud.army', ICONS.army, () =>
      this.ctx?.match?.selectArmy(),
    );
    for (const b of [this.boxBtn, this.idleBtn, this.armyBtn]) b.classList.add('hud-panel');

    // ── bottom row ──
    const bottom = el('div', 'hud-bottom', root);
    this.minimapSlot = el('div', 'hud-panel hud-minimap', bottom);
    this.alertBtn = el('button', 'hud-alert', this.minimapSlot);
    this.alertBtn.type = 'button';
    this.alertBtn.innerHTML = ICONS.alert;
    this.alertBtn.hidden = true;
    this.alertBtn.dataset.i18nTitle = 'hud.jumpAlert';
    onPress(this.alertBtn, () => this.ctx?.match?.jumpToAlert());
    this.groupsEl = el('div', 'hud-groups', bottom);
    for (let i = 0; i < 5; i++) {
      const b = el('button', 'hud-btn hud-panel group-btn', this.groupsEl);
      b.type = 'button';
      b.innerHTML = `<span class="group-num">${i + 1}</span><span class="group-count"></span>`;
      b.dataset.i18nTitle = 'hud.group';
      onPress(
        b,
        () => this.ctx?.match?.groupPress(i),
        () => this.ctx?.match?.groupAssign(i),
      );
      this.groupBtns.push(b);
    }
    this.selEl = el('div', 'hud-panel hud-selection', bottom);
    this.selEl.hidden = true;
    this.cmdEl = el('div', 'hud-commands', bottom);

    // ── overlays ──
    this.debugEl = el('pre', 'hud-panel hud-debug', root);
    this.debugEl.hidden = true;
    this.infoEl = el('div', 'hud-panel hud-info', root);
    this.infoEl.hidden = true;
    this.bannerEl = el('div', 'hud-panel hud-banner', root);
    this.bannerEl.hidden = true;
    this.boxEl = el('div', 'hud-boxsel', root);
    this.boxEl.hidden = true;
    this.announceEl = el('div', 'hud-announce', root);
    this.announceEl.hidden = true;
    this.modalEl = el('div', 'hud-modal', root);
    this.modalEl.hidden = true;

    this.applyI18n();
    onLanguageChange(() => this.applyI18n());
  }

  attach(ctx: AppContext): void {
    this.ctx = ctx;
    this.debugEl.hidden = !ctx.settings.showDebug;
    this.applySettings();
  }

  applySettings(): void {
    if (!this.ctx) return;
    const s = this.ctx.settings;
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    document.documentElement.dataset.hand = s.handedness;
    this.debugEl.hidden = !s.showDebug;
  }

  show(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setResources(r: Record<ResourceKind, number>, pop: number, popCap: number, age: string): void {
    for (const k of RESOURCE_KINDS) setText(this.resEls.get(k)!, String(Math.floor(r[k])));
    const popEl = this.resEls.get('pop')!;
    setText(popEl, `${pop}/${popCap}`);
    popEl.classList.toggle('res-warn', pop >= popCap);
    setText(this.ageEl, age);
  }

  setTools(boxActive: boolean, idleWorkers: number, army: number): void {
    this.boxBtn.classList.toggle('active', boxActive);
    setBadge(this.idleBtn, idleWorkers);
    setBadge(this.armyBtn, army);
  }

  setGroups(counts: number[]): void {
    counts.forEach((n, i) => {
      const b = this.groupBtns[i];
      if (!b) return;
      setText(b.querySelector('.group-count') as HTMLElement, n > 0 ? String(n) : '');
      b.classList.toggle('empty', n === 0);
    });
  }

  setSelection(v: SelectionView | null): void {
    if (!v) {
      this.selEl.hidden = true;
      this.selKey = '';
      return;
    }
    this.selEl.hidden = false;
    const key = `${v.title}|${v.icon}|${v.groups?.map((g) => g.key + g.count).join(',')}`;
    if (key !== this.selKey) {
      this.selKey = key;
      this.selEl.innerHTML = '';
      const close = el('button', 'sel-close', this.selEl);
      close.type = 'button';
      close.textContent = '✕';
      close.setAttribute('aria-label', t('hud.deselect'));
      onPress(close, v.onDeselect);
      if (v.groups && v.groups.length > 1) {
        const row = el('div', 'sel-groups', this.selEl);
        for (const g of v.groups) {
          const b = el('button', 'sel-group', row);
          b.type = 'button';
          b.innerHTML = `<img alt="" src="${g.icon}"><span>${g.count}</span>`;
          onPress(b, g.onPress);
        }
      } else {
        const head = el('div', 'sel-head', this.selEl);
        if (v.icon) {
          const img = el('img', 'sel-icon', head);
          img.src = v.icon;
          img.alt = '';
        }
        const txt = el('div', 'sel-text', head);
        el('div', 'sel-title', txt);
        el('div', 'sel-sub', txt);
        el('div', 'sel-hp', txt).append(el('div', 'sel-hp-fill'));
        el('div', 'sel-detail', txt);
        el('div', 'sel-counters', txt);
      }
    }
    const q = (c: string): HTMLElement | null => this.selEl.querySelector(c);
    const title = q('.sel-title');
    if (title) {
      setText(title, v.title);
      setText(q('.sel-sub')!, v.subtitle ?? '');
      setText(q('.sel-detail')!, v.detail ?? '');
      const counters = q('.sel-counters')!;
      const ctext = [v.strong ? `▲ ${v.strong}` : '', v.weak ? `▼ ${v.weak}` : '']
        .filter(Boolean)
        .join('  ');
      setText(counters, ctext);
      const hp = q('.sel-hp')!;
      hp.hidden = !v.hp;
      if (v.hp)
        (q('.sel-hp-fill') as HTMLElement).style.width =
          `${Math.max(0, Math.min(1, v.hp[0] / v.hp[1])) * 100}%`;
    }
  }

  setCommands(specs: ButtonSpec[]): void {
    renderButtons(this.cmdEl, specs, 'cmd-btn', (s) => this.flashInfo(s, 2600));
  }

  setPowers(specs: ButtonSpec[]): void {
    renderButtons(this.powersEl, specs, 'power-btn', (s) => this.flashInfo(s, 2600));
  }

  showBanner(b: BannerSpec | null): void {
    if (!b) {
      this.bannerEl.hidden = true;
      return;
    }
    this.bannerEl.hidden = false;
    this.bannerEl.innerHTML = '';
    el('span', 'banner-text', this.bannerEl).textContent = b.text;
    if (b.onConfirm) {
      const ok = el('button', 'banner-btn ok', this.bannerEl);
      ok.type = 'button';
      ok.textContent = '✓';
      ok.disabled = !!b.confirmDisabled;
      ok.setAttribute('aria-label', t('hud.confirm'));
      onPress(ok, b.onConfirm);
    }
    const cancel = el('button', 'banner-btn cancel', this.bannerEl);
    cancel.type = 'button';
    cancel.textContent = '✕';
    cancel.setAttribute('aria-label', t('hud.cancel'));
    onPress(cancel, b.onCancel);
  }

  /** Update only the confirm button state of the current banner. */
  setBannerConfirm(enabled: boolean): void {
    const ok = this.bannerEl.querySelector<HTMLButtonElement>('.banner-btn.ok');
    if (ok) ok.disabled = !enabled;
  }

  showModal(m: ModalSpec | null): void {
    if (!m) {
      this.modalEl.hidden = true;
      this.modalEl.innerHTML = '';
      return;
    }
    this.modalEl.hidden = false;
    this.modalEl.innerHTML = '';
    const card = el('div', 'hud-panel modal-card', this.modalEl);
    card.dataset.scroll = '1';
    el('h2', 'modal-title', card).textContent = m.title;
    if (m.body) el('p', 'modal-body', card).textContent = m.body;
    if (m.choices) {
      const list = el('div', 'modal-choices', card);
      for (const c of m.choices) {
        const b = el('button', 'modal-choice', list);
        b.type = 'button';
        b.disabled = !!c.disabled;
        if (c.icon) {
          const img = el('img', '', b);
          img.src = c.icon;
          img.alt = '';
        }
        const tx = el('div', 'choice-text', b);
        el('div', 'choice-title', tx).textContent = c.title;
        if (c.subtitle) el('div', 'choice-sub', tx).textContent = c.subtitle;
        el('div', 'choice-body', tx).textContent = c.body;
        onPress(b, c.onChoose);
      }
    }
    if (m.actions) {
      const row = el('div', 'modal-actions', card);
      for (const a of m.actions) {
        const b = el('button', a.primary ? 'btn-primary' : 'btn-secondary', row);
        b.type = 'button';
        b.textContent = a.label;
        onPress(b, a.onPress);
      }
    }
    if (m.dismissable) {
      const x = el('button', 'modal-close', card);
      x.type = 'button';
      x.textContent = '✕';
      x.setAttribute('aria-label', t('hud.cancel'));
      onPress(x, () => this.showModal(null));
    }
  }

  get modalOpen(): boolean {
    return !this.modalEl.hidden;
  }

  /** Box-selection rectangle in CSS px (null hides it). */
  showBox(r: { x0: number; y0: number; x1: number; y1: number } | null): void {
    if (!r) {
      this.boxEl.hidden = true;
      return;
    }
    this.boxEl.hidden = false;
    const s = this.boxEl.style;
    s.left = `${Math.min(r.x0, r.x1)}px`;
    s.top = `${Math.min(r.y0, r.y1)}px`;
    s.width = `${Math.abs(r.x1 - r.x0)}px`;
    s.height = `${Math.abs(r.y1 - r.y0)}px`;
  }

  /** Big centred announcement (age reached, victory…) that fades out by itself. */
  announce(title: string, subtitle = ''): void {
    const a = this.announceEl;
    a.innerHTML = '';
    el('div', 'announce-title', a).textContent = title;
    if (subtitle) el('div', 'announce-sub', a).textContent = subtitle;
    a.hidden = false;
    a.classList.remove('show');
    void a.offsetWidth;
    a.classList.add('show');
    window.setTimeout(() => (a.hidden = true), 3200);
  }

  /** Flash the "jump to attack" button for a few seconds. */
  alert(): void {
    this.alertBtn.hidden = false;
    this.alertBtn.classList.remove('pulse');
    void this.alertBtn.offsetWidth;
    this.alertBtn.classList.add('pulse');
    window.clearTimeout(this.alertTimer);
    this.alertTimer = window.setTimeout(() => (this.alertBtn.hidden = true), 8000);
  }

  setDebugStats(s: DebugStats): void {
    if (this.debugEl.hidden) return;
    this.debugEl.textContent =
      `fps ${s.fps.toFixed(0)}  tick ${s.tick}  ents ${s.entities}\n` +
      `zoom ${s.zoom.toFixed(0)}px/tile  cam ${s.camTileX.toFixed(1)},${s.camTileY.toFixed(1)}\n` +
      `seed ${s.seed}` +
      (s.extra ? `\n${s.extra}` : '');
  }

  showInfo(text: string): void {
    this.flashInfo(text, 2500);
  }

  onPauseChange(paused: boolean): void {
    this.pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
  }

  onSpeedChange(speed: number): void {
    setText(this.speedBtn.querySelector('.speed-label') as HTMLElement, `${speed}×`);
  }

  private flashInfo(text: string, ms: number): void {
    this.infoEl.textContent = text;
    this.infoEl.hidden = false;
    window.clearTimeout(this.infoTimer);
    this.infoTimer = window.setTimeout(() => (this.infoEl.hidden = true), ms);
  }

  private cycleSpeed(): void {
    const m = this.ctx?.match;
    if (!m) return;
    m.setSpeed(m.getSpeed() === 1 ? 2 : 1);
  }

  applyI18n(): void {
    this.root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((n) => {
      n.textContent = t(n.dataset.i18n as TranslationKey);
    });
    this.root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((n) => {
      const label = t(n.dataset.i18nTitle as TranslationKey);
      n.title = label;
      n.setAttribute('aria-label', label);
    });
  }
}

function setText(e: HTMLElement, s: string): void {
  if (e.textContent !== s) e.textContent = s;
}

function setBadge(b: HTMLElement, n: number): void {
  let badge = b.querySelector<HTMLElement>('.badge');
  if (!badge) badge = el('span', 'badge', b);
  setText(badge, n > 0 ? String(n) : '');
  badge.hidden = n === 0;
}

function iconButton(
  parent: HTMLElement,
  labelKey: TranslationKey,
  html: string,
  onTap: () => void,
): HTMLButtonElement {
  const b = el('button', 'hud-btn', parent);
  b.type = 'button';
  b.innerHTML = html;
  b.dataset.i18nTitle = labelKey;
  onPress(b, onTap);
  return b;
}

const specOf = new WeakMap<HTMLElement, ButtonSpec>();

/** Keyed rendering of a button list: unchanged buttons are kept, only progress is updated. */
function renderButtons(
  container: HTMLElement,
  specs: ButtonSpec[],
  cls: string,
  showHint: (s: string) => void,
): void {
  const existing = new Map<string, HTMLButtonElement>();
  container
    .querySelectorAll<HTMLButtonElement>(`:scope > .${cls}`)
    .forEach((b) => existing.set(b.dataset.key ?? '', b));
  const keep = new Set<HTMLButtonElement>();
  let prev: HTMLElement | null = null;
  for (const s of specs) {
    const cost = s.cost ? costChips(s.cost) : '';
    const sig = [s.label, s.sub, cost, s.disabled, s.active, s.badge, s.icon, s.svg].join('|');
    let b = existing.get(s.id);
    if (!b || b.dataset.sig !== sig) {
      b?.remove();
      b = document.createElement('button');
      b.type = 'button';
      b.className = `hud-btn hud-panel ${cls}`;
      b.dataset.key = s.id;
      b.dataset.sig = sig;
      b.setAttribute('aria-label', s.label);
      b.title = s.hint ?? s.label;
      if (s.disabled) b.classList.add('disabled');
      if (s.active) b.classList.add('active');
      b.innerHTML =
        (s.icon
          ? `<img alt="" src="${s.icon}">`
          : (s.svg ?? `<span class="btn-label">${escapeHtml(s.label)}</span>`)) +
        (cost
          ? `<span class="btn-cost">${cost}</span>`
          : s.sub
            ? `<span class="btn-sub">${escapeHtml(s.sub)}</span>`
            : '') +
        (s.badge ? `<span class="badge">${escapeHtml(s.badge)}</span>` : '') +
        '<span class="btn-progress"></span>';
      const btn = b;
      onPress(
        btn,
        () => {
          const spec = specOf.get(btn);
          if (!spec) return;
          if (spec.disabled) {
            if (spec.hint) showHint(spec.hint);
            return;
          }
          spec.onPress();
        },
        () => {
          const spec = specOf.get(btn);
          if (!spec) return;
          if (spec.onLongPress) spec.onLongPress();
          else showHint(spec.hint ?? spec.label);
        },
      );
    }
    // Specs are rebuilt every refresh: handlers always read the latest one (fresh closures).
    specOf.set(b, s);
    const pr = b.querySelector<HTMLElement>('.btn-progress');
    if (pr) {
      const p = s.progress ?? 0;
      pr.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
      pr.hidden = !(p > 0 && p < 1);
    }
    if (prev ? prev.nextSibling !== b : container.firstChild !== b) {
      if (prev) prev.after(b);
      else container.prepend(b);
    }
    prev = b;
    keep.add(b);
  }
  for (const b of existing.values()) if (!keep.has(b)) b.remove();
}

const COST_ORDER: ResourceKind[] = ['food', 'wood', 'gold', 'favor'];

/** Compact price: a coloured resource dot before each amount. */
function costChips(cost: Partial<Record<ResourceKind, number>>): string {
  return COST_ORDER.filter((k) => cost[k])
    .map((k) => `<span class="chip"><i class="dot dot-${k}"></i>${cost[k]}</span>`)
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
