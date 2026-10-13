import { t, type TranslationKey } from '../i18n';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';
import { el, onPress } from './hud/dom';
import { loadStats, saveStats } from './stats';

export interface TutorialHost {
  world(): World;
  me: number;
  selected(): Entity[];
  /** Spawn enemy units for the practice fight; returns their ids. */
  spawnEnemies(count: number): number[];
  grant(res: Partial<Record<'food' | 'wood' | 'gold', number>>): void;
  finish(toMenu: boolean): void;
}

interface Step {
  text: TranslationKey;
  /** Condition that completes the step (omitted = manual "Next"). */
  done?: (h: TutorialHost, s: TutorialState) => boolean;
  highlight?: string;
  enter?: (h: TutorialHost, s: TutorialState) => void;
}

interface TutorialState {
  enemies: number[];
}

const own = (h: TutorialHost, pred: (e: Entity) => boolean): Entity[] =>
  h.world().entities.filter((e) => !e.dead && e.owner === h.me && pred(e));

/** Ensure the player has at least these resources (the tutorial never gets stuck on economy). */
const topUp = (h: TutorialHost, want: Partial<Record<'food' | 'wood' | 'gold', number>>): void => {
  const p = h.world().players[h.me]!;
  const add: Partial<Record<'food' | 'wood' | 'gold', number>> = {};
  for (const k of Object.keys(want) as Array<'food' | 'wood' | 'gold'>) {
    const missing = (want[k] ?? 0) - p.res[k];
    if (missing > 0) add[k] = missing;
  }
  h.grant(add);
};

const STEPS: Step[] = [
  { text: 'tut.welcome' },
  {
    text: 'tut.select',
    done: (h) => h.selected().some((e) => e.owner === h.me && e.cls === 'worker'),
  },
  {
    text: 'tut.house',
    highlight: '.cmd-btn[data-key="buildmenu"], .cmd-btn[data-key="build:house"]',
    enter: (h) => topUp(h, { wood: 60 }),
    done: (h) => own(h, (e) => e.def === 'house').length > 0,
  },
  {
    text: 'tut.houseWait',
    done: (h) => own(h, (e) => e.def === 'house' && e.built).length > 0,
  },
  {
    text: 'tut.wood',
    done: (h) =>
      own(h, (e) => e.cls === 'worker' && (e.order.tile >= 0 || e.carryKind === 'wood')).length > 0,
  },
  {
    text: 'tut.train',
    highlight: '.cmd-btn[data-key^="train:"]',
    enter: (h) => topUp(h, { food: 60 }),
    done: (h) => (h.world().players[h.me]?.stats.unitsTrained ?? 0) > 0,
  },
  {
    text: 'tut.barracks',
    highlight: '.cmd-btn[data-key="buildmenu"], .cmd-btn[data-key="build:barracks"]',
    enter: (h) => topUp(h, { wood: 160 }),
    done: (h) => own(h, (e) => e.def === 'barracks' && e.built).length > 0,
  },
  {
    text: 'tut.army',
    highlight: '.cmd-btn[data-key^="train:"]',
    enter: (h) => topUp(h, { food: 200, gold: 100 }),
    done: (h) => own(h, (e) => e.cls === 'infantry' || e.cls === 'ranged').length >= 3,
  },
  {
    text: 'tut.fight',
    highlight: '.hud-tools .hud-btn:nth-child(3)',
    enter: (h, s) => {
      s.enemies = h.spawnEnemies(3);
    },
    done: (h, s) =>
      s.enemies.length > 0 &&
      s.enemies.every((id) => !h.world().byId.get(id) || h.world().byId.get(id)!.dead),
  },
  {
    text: 'tut.age',
    highlight: '.cmd-btn[data-key="age"]',
    enter: (h) => topUp(h, { food: 420, gold: 60 }),
    done: (h) => (h.world().players[h.me]?.age ?? 0) >= 1,
  },
  { text: 'tut.done' },
];

/** Interactive tutorial: shows a coach card, checks the world, advances step by step. */
export class Tutorial {
  private readonly host: TutorialHost;
  private readonly card: HTMLElement;
  private step = -1;
  private readonly state: TutorialState = { enemies: [] };

  constructor(host: TutorialHost, hudRoot: HTMLElement) {
    this.host = host;
    hudRoot.querySelector('.coach')?.remove();
    this.card = el('div', 'hud-panel coach', hudRoot);
    this.next();
  }

  destroy(): void {
    this.clearHighlight();
    this.card.remove();
  }

  private clearHighlight(): void {
    document.querySelectorAll('.tut-highlight').forEach((n) => n.classList.remove('tut-highlight'));
  }

  private next(): void {
    this.step++;
    const s = STEPS[this.step];
    if (!s) return;
    s.enter?.(this.host, this.state);
    this.render();
  }

  private render(): void {
    const s = STEPS[this.step];
    if (!s) return;
    const c = this.card;
    c.innerHTML = '';
    const txt = el('div', 'coach-text', c);
    el('div', 'coach-step', txt).textContent = `${t('tut.step')} ${this.step + 1}/${STEPS.length}`;
    el('div', '', txt).textContent = t(s.text);
    const actions = el('div', 'coach-actions', c);
    const last = this.step === STEPS.length - 1;
    if (!s.done) {
      const b = el('button', 'btn-primary', actions);
      b.type = 'button';
      b.textContent = last ? t('tut.toMenu') : t('tut.next');
      onPress(b, () => (last ? this.finish(true) : this.next()));
      if (last) {
        const k = el('button', 'btn-secondary', actions);
        k.type = 'button';
        k.textContent = t('tut.keepPlaying');
        onPress(k, () => this.finish(false));
      }
    } else {
      const skip = el('button', 'btn-secondary', actions);
      skip.type = 'button';
      skip.textContent = t('tut.skip');
      onPress(skip, () => this.finish(true));
    }
  }

  private finish(toMenu: boolean): void {
    const st = loadStats();
    st.tutorialDone = true;
    saveStats(st);
    this.destroy();
    this.host.finish(toMenu);
  }

  /** Call regularly (a few times per second). */
  update(): void {
    const s = STEPS[this.step];
    if (!s) return;
    this.clearHighlight();
    if (s.highlight)
      document.querySelectorAll(s.highlight).forEach((n) => n.classList.add('tut-highlight'));
    if (s.done && s.done(this.host, this.state)) this.next();
  }

  get stepIndex(): number {
    return this.step;
  }
}
