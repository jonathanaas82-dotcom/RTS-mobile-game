import { ECONOMY, RESOURCE_KINDS, type ResourceKind } from '../../data/balance/economy';
import { onLanguageChange, t, type TranslationKey } from '../../i18n';
import { fullscreenSupported, toggleFullscreen } from '../../platform/pwa';
import type { AppContext, DebugStats, HudPort } from '../../render/context';
import { saveSettings } from '../settings';
import { ICONS } from './icons';

/**
 * DOM heads-up display layered over the canvas. Uses plain DOM (no framework): it is small,
 * updates rarely, and CSS handles safe areas, scaling and themes.
 */
export class Hud implements HudPort {
  private readonly root: HTMLElement;
  private ctx: AppContext | null = null;
  private readonly resEls = new Map<ResourceKind | 'pop', HTMLElement>();
  private readonly debugEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly pauseOverlay: HTMLElement;
  private infoTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = '';

    const top = el('div', 'hud-top');
    const res = el('div', 'hud-panel hud-resources');
    for (const kind of [...RESOURCE_KINDS, 'pop'] as const) {
      const item = el('div', `res res-${kind}`);
      item.innerHTML = `<span class="res-icon">${ICONS[kind]}</span><span class="res-val">0</span>`;
      item.dataset.i18nTitle = kind === 'pop' ? 'res.pop' : `res.${kind}`;
      res.append(item);
      this.resEls.set(kind, item.querySelector('.res-val') as HTMLElement);
    }
    top.append(res);

    const controls = el('div', 'hud-panel hud-controls');
    this.pauseBtn = button('hud.pause', ICONS.pause, () => this.togglePause());
    this.speedBtn = button('hud.speed', '<span class="speed-label">1×</span>', () =>
      this.cycleSpeed(),
    );
    const debugBtn = button('hud.debug', ICONS.debug, () => this.toggleDebug());
    controls.append(this.pauseBtn, this.speedBtn, debugBtn);
    if (fullscreenSupported())
      controls.append(button('hud.fullscreen', ICONS.fullscreen, () => void toggleFullscreen()));
    top.append(controls);

    this.debugEl = el('pre', 'hud-panel hud-debug');
    this.debugEl.hidden = true;
    this.infoEl = el('div', 'hud-panel hud-info');
    this.infoEl.hidden = true;

    this.pauseOverlay = el('div', 'hud-pause');
    this.pauseOverlay.hidden = true;
    const pauseCard = el('div', 'hud-panel pause-card');
    const pauseTitle = el('h2', '');
    pauseTitle.dataset.i18n = 'hud.paused';
    const resume = el('button', 'btn-primary') as HTMLButtonElement;
    resume.dataset.i18n = 'hud.resume';
    resume.addEventListener('click', () => this.ctx?.match?.setPaused(false));
    pauseCard.append(pauseTitle, resume);
    this.pauseOverlay.append(pauseCard);

    root.append(top, this.debugEl, this.infoEl, this.pauseOverlay);
    this.setResources(ECONOMY.startingResources, ECONOMY.startingWorkers, ECONOMY.startingPopCap);
    this.applyI18n();
    onLanguageChange(() => this.applyI18n());
  }

  attach(ctx: AppContext): void {
    this.ctx = ctx;
    this.debugEl.hidden = !ctx.settings.showDebug;
    this.applyUiScale(ctx.settings.uiScale);
    document.documentElement.dataset.hand = ctx.settings.handedness;
    this.flashInfo(t('hud.hint'), 4000);
  }

  applyUiScale(scale: number): void {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
  }

  setResources(r: Record<ResourceKind, number>, pop: number, popCap: number): void {
    for (const k of RESOURCE_KINDS) this.resEls.get(k)!.textContent = String(Math.floor(r[k]));
    this.resEls.get('pop')!.textContent = `${pop}/${popCap}`;
  }

  setDebugStats(s: DebugStats): void {
    if (this.debugEl.hidden) return;
    this.debugEl.textContent =
      `fps ${s.fps.toFixed(0)}  tick ${s.tick}\n` +
      `zoom ${s.zoom.toFixed(0)}px/tile\n` +
      `cam ${s.camTileX.toFixed(1)}, ${s.camTileY.toFixed(1)}\n` +
      `seed ${s.seed}`;
  }

  showInfo(text: string): void {
    this.flashInfo(text, 2500);
  }

  onPauseChange(paused: boolean): void {
    this.pauseOverlay.hidden = !paused;
    this.pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
  }

  private flashInfo(text: string, ms: number): void {
    this.infoEl.textContent = text;
    this.infoEl.hidden = false;
    window.clearTimeout(this.infoTimer);
    this.infoTimer = window.setTimeout(() => (this.infoEl.hidden = true), ms);
  }

  private togglePause(): void {
    const m = this.ctx?.match;
    if (m) m.setPaused(!m.isPaused());
  }

  private cycleSpeed(): void {
    const m = this.ctx?.match;
    if (!m) return;
    const next = m.getSpeed() === 1 ? 2 : 1;
    m.setSpeed(next);
    this.speedBtn.querySelector('.speed-label')!.textContent = `${next}×`;
  }

  private toggleDebug(): void {
    if (!this.ctx) return;
    const s = this.ctx.settings;
    s.showDebug = !s.showDebug;
    this.debugEl.hidden = !s.showDebug;
    saveSettings(s);
  }

  private applyI18n(): void {
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

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function button(labelKey: TranslationKey, html: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'hud-btn';
  b.type = 'button';
  b.innerHTML = html;
  b.dataset.i18nTitle = labelKey;
  b.addEventListener('click', onTap);
  return b;
}
