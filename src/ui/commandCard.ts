import { buildingDef, loc, powerDef, techDef, unitDef } from '../data';
import { AGES } from '../data/factions';
import { strongAgainst, weakAgainst } from '../data/counters';
import type { ResourceKind } from '../data/balance/economy';
import type { Cost, PowerKind, UnitClass } from '../data/types';
import { getLanguage, t, type TranslationKey } from '../i18n';
import type { Command } from '../sim/commands';
import type { Entity } from '../sim/entity';
import { costOf } from '../sim/player';
import {
  buildOptions,
  canAdvance,
  canCast,
  canPlace,
  canResearch,
  canTrain,
  nextAge,
  powerCooldownLeft,
  techOptions,
  trainOptions,
  type Check,
} from '../sim/rules';
import { statOf, type World } from '../sim/world';
import { ICONS } from './hud/icons';
import type { ButtonSpec, SelectionView } from './hud/types';

export interface CardHost {
  world(): World;
  me: number;
  issue(c: Command): void;
  icon(frame: string): string;
  startPlacement(def: string): void;
  startPowerTarget(power: string): void;
  openAgeChoice(building: Entity): void;
  select(ids: number[]): void;
  deselect(): void;
  hint(text: string): void;
}

const RES_ORDER: ResourceKind[] = ['food', 'wood', 'gold', 'favor'];

export function costText(cost: Cost): string {
  const parts: string[] = [];
  for (const k of RES_ORDER) {
    const v = cost[k];
    if (v) parts.push(`${v}${t(`res.short.${k}` as TranslationKey)}`);
  }
  return parts.join(' ');
}

export function denialText(c: Check): string {
  return c.ok ? '' : t(`deny.${c.reason}` as TranslationKey);
}

export function className(cls: UnitClass): string {
  return t(`cls.${cls}` as TranslationKey);
}

/** Builds HUD data for the current selection. Holds the worker build-menu page state. */
export class CommandCard {
  private page: 'main' | 'build' = 'main';
  private lastSelKey = '';
  private readonly host: CardHost;

  constructor(host: CardHost) {
    this.host = host;
  }

  resetPage(): void {
    this.page = 'main';
  }

  selectionView(sel: Entity[]): SelectionView | null {
    if (sel.length === 0) return null;
    const lang = getLanguage();
    const world = this.host.world();
    const onDeselect = (): void => this.host.deselect();
    if (sel.length > 1) {
      const byDef = new Map<string, Entity[]>();
      for (const e of sel) {
        const k = `${e.def}:${e.owner}`;
        const list = byDef.get(k) ?? [];
        list.push(e);
        byDef.set(k, list);
      }
      const groups = [...byDef.entries()].slice(0, 12).map(([k, list]) => ({
        key: k,
        icon: this.host.icon(frameOf(list[0]!)),
        count: list.length,
        onPress: () => this.host.select(list.map((e) => e.id)),
      }));
      if (groups.length > 1)
        return { title: t('hud.selected', { count: sel.length }), groups, onDeselect };
      const first = sel[0]!;
      const v = this.single(first, world, lang, onDeselect);
      v.title = `${v.title} ×${sel.length}`;
      return v;
    }
    return this.single(sel[0]!, world, lang, onDeselect);
  }

  private single(e: Entity, world: World, lang: string, onDeselect: () => void): SelectionView {
    if (e.kind === 'resource') {
      const key: TranslationKey = e.def === 'gold' ? 'feature.gold' : 'feature.berries';
      return { title: t(key, { amount: Math.floor(e.amount) }), icon: undefined, onDeselect };
    }
    if (e.kind === 'building') {
      const d = buildingDef(e.def);
      let detail = '';
      if (!e.built) detail = t('sel.constructing', { pct: Math.floor(e.progress * 100) });
      else if (e.queue.length > 0) {
        const q = e.queue[0]!;
        const name =
          q.kind === 'unit'
            ? loc(unitDef(q.id).name, lang)
            : q.kind === 'tech'
              ? loc(techDef(q.id).name, lang)
              : t('sel.advancing');
        detail =
          `${name} ${Math.floor((q.progress / Math.max(1, q.total)) * 100)}%` +
          (e.queue.length > 1 ? ` (+${e.queue.length - 1})` : '');
      }
      return {
        title: loc(d.name, lang),
        subtitle: e.owner === this.host.me ? undefined : t('sel.enemy'),
        icon: this.host.icon(frameOf(e)),
        hp: [e.hp, e.maxHp],
        detail,
        onDeselect,
      };
    }
    const u = unitDef(e.def);
    let detail = '';
    if (u.cls === 'worker') {
      if (e.carry > 0 && e.carryKind)
        detail = t('sel.carrying', {
          amount: Math.floor(e.carry),
          res: t(`res.${e.carryKind}` as TranslationKey),
        });
      else detail = t(`order.${e.order.type}` as TranslationKey);
    } else if (u.attack) {
      const dmg = Math.round(statOf(world, e, 'damage', u.attack.damage));
      const armor = Math.round(statOf(world, e, 'armor', u.armor) * 100);
      detail = t('sel.stats', {
        dmg,
        range: u.attack.range < 1 ? t('sel.melee') : u.attack.range.toFixed(0),
        armor,
      });
    }
    const strong = strongAgainst(u.cls)
      .filter((c) => c !== 'worker')
      .map(className)
      .join(', ');
    const weak = weakAgainst(u.cls).map(className).join(', ');
    return {
      title: loc(u.name, lang),
      subtitle: className(u.cls) + (e.owner === this.host.me ? '' : ` · ${t('sel.enemy')}`),
      icon: this.host.icon(frameOf(e)),
      hp: [e.hp, e.maxHp],
      detail,
      strong,
      weak,
      onDeselect,
    };
  }

  commands(sel: Entity[]): ButtonSpec[] {
    const world = this.host.world();
    const me = this.host.me;
    const p = world.players[me];
    if (!p) return [];
    const lang = getLanguage();
    const key = sel.map((e) => e.id).join(',');
    if (key !== this.lastSelKey) {
      this.lastSelKey = key;
      this.page = 'main';
    }
    const own = sel.filter((e) => e.owner === me);
    if (own.length === 0) return [];
    const units = own.filter((e) => e.kind === 'unit');
    const out: ButtonSpec[] = [];

    if (units.length > 0) {
      const workers = units.filter((u) => u.cls === 'worker');
      if (workers.length > 0 && this.page === 'build') {
        for (const b of buildOptions(p)) {
          const chk = canPlace(world, p, b.id);
          const cost = costOf(p, world.tick, b.id);
          out.push({
            id: `build:${b.id}`,
            icon: this.host.icon(`b:${b.id}:${me}`),
            label: loc(b.name, lang),
            sub: costText(cost),
            disabled: !chk.ok,
            hint: `${loc(b.name, lang)} — ${costText(cost)}${chk.ok ? '' : ` · ${denialText(chk)}`}${chk.reason === 'age' ? ` (${loc(AGES[b.age]!.name, lang)})` : ''}`,
            onPress: () => {
              this.page = 'main';
              this.host.startPlacement(b.id);
            },
          });
        }
        out.push({
          id: 'back',
          svg: ICONS.back,
          label: t('cmd.back'),
          onPress: () => (this.page = 'main'),
        });
        return out;
      }
      if (workers.length > 0) {
        out.push({
          id: 'buildmenu',
          svg: ICONS.build,
          label: t('cmd.build'),
          hint: t('cmd.build'),
          onPress: () => (this.page = 'build'),
        });
      }
      const heroes = units.filter((u) => u.cls === 'hero');
      for (const h of heroes.slice(0, 1)) {
        const ab = unitDef(h.def).ability;
        if (!ab) continue;
        const left = Math.max(0, h.abilityReadyAt - world.tick);
        const total = ab.cooldown * 20;
        out.push({
          id: `ability:${h.id}`,
          svg: ICONS.ability,
          label: loc(ab.name, lang),
          sub: left > 0 ? `${Math.ceil(left / 20)}s` : '',
          disabled: left > 0,
          progress: left > 0 ? 1 - left / total : 0,
          hint: `${loc(ab.name, lang)}: ${loc(ab.desc, lang)}`,
          onPress: () => this.host.issue({ type: 'ability', player: me, id: h.id }),
        });
      }
      out.push({
        id: 'stop',
        svg: ICONS.stop,
        label: t('cmd.stop'),
        onPress: () => this.host.issue({ type: 'stop', player: me, ids: units.map((u) => u.id) }),
      });
      return out;
    }

    // Buildings: act on the first selected (same-type multi-selection trains in the first).
    const b = own[0]!;
    if (b.kind !== 'building' || !b.built) return out;
    for (const u of trainOptions(p, b.def)) {
      const chk = canTrain(world, p, b, u.id);
      const cost = costOf(p, world.tick, u.id);
      const queued = b.queue.filter((q) => q.kind === 'unit' && q.id === u.id).length;
      const head = b.queue[0];
      out.push({
        id: `train:${u.id}`,
        icon: this.host.icon(`u:${u.id}:${me}`),
        label: loc(u.name, lang),
        sub: costText(cost),
        badge: queued > 0 ? String(queued) : undefined,
        progress:
          head && head.kind === 'unit' && head.id === u.id
            ? head.progress / Math.max(1, head.total)
            : 0,
        disabled: !chk.ok,
        hint: `${loc(u.name, lang)} (${className(u.cls)}) — ${costText(cost)}${chk.ok ? '' : ` · ${denialText(chk)}`}. ${t('hint.cancelHold')}`,
        onPress: () => this.host.issue({ type: 'train', player: me, building: b.id, unit: u.id }),
        onLongPress: () => {
          const idx = b.queue.map((q) => q.id).lastIndexOf(u.id);
          if (idx >= 0) this.host.issue({ type: 'cancel', player: me, building: b.id, index: idx });
        },
      });
    }
    for (const tech of techOptions(p, b.def)) {
      if (tech.age > p.age) continue;
      const chk = canResearch(world, p, b, tech.id);
      if (chk.reason === 'researched') continue;
      const head = b.queue[0];
      out.push({
        id: `tech:${tech.id}`,
        label: loc(tech.name, lang),
        sub: costText(tech.cost),
        disabled: !chk.ok,
        progress:
          head && head.kind === 'tech' && head.id === tech.id
            ? head.progress / Math.max(1, head.total)
            : 0,
        hint: `${loc(tech.name, lang)}: ${loc(tech.desc, lang)} — ${costText(tech.cost)}${chk.ok ? '' : ` · ${denialText(chk)}`}`,
        onPress: () =>
          this.host.issue({ type: 'research', player: me, building: b.id, tech: tech.id }),
      });
    }
    if (b.def === 'town_hall') {
      const info = nextAge(p);
      if (info) {
        const head = b.queue[0];
        const chk = canAdvance(p, b, info.gods[0]);
        const ageName = loc(AGES[info.next]!.name, lang);
        out.push({
          id: 'age',
          svg: ICONS.age,
          label: ageName,
          sub: costText(info.cost),
          disabled: !chk.ok,
          progress: head && head.kind === 'age' ? head.progress / Math.max(1, head.total) : 0,
          hint: `${t('cmd.advance', { age: ageName })} — ${costText(info.cost)}${chk.ok ? '' : ` · ${denialText(chk)}`}`,
          onPress: () => this.host.openAgeChoice(b),
        });
      }
    }
    return out;
  }

  powers(): ButtonSpec[] {
    const world = this.host.world();
    const me = this.host.me;
    const p = world.players[me];
    if (!p) return [];
    const lang = getLanguage();
    return p.powers.map((ps) => {
      const d = powerDef(ps.id);
      const chk = canCast(world, p, ps.id);
      const left = powerCooldownLeft(world, p, ps.id);
      return {
        id: `power:${ps.id}`,
        icon: powerIcon(d.kind, d.color),
        label: loc(d.name, lang),
        sub: left > 0 ? `${Math.ceil(left)}s` : `${d.favorCost}★`,
        disabled: !chk.ok,
        progress: left > 0 ? 1 - left / d.cooldown : 0,
        hint: `${loc(d.name, lang)} (${d.favorCost}★): ${loc(d.desc, lang)}${chk.ok ? '' : ` · ${denialText(chk)}`}`,
        onPress: () => {
          if (d.radius <= 0)
            this.host.issue({ type: 'castPower', player: me, power: ps.id, x: 0, y: 0 });
          else this.host.startPowerTarget(ps.id);
        },
      };
    });
  }
}

export function frameOf(e: Entity): string {
  if (e.kind === 'unit') return `u:${e.def}:${e.owner}`;
  if (e.kind === 'building') return `b:${e.def}:${e.owner}`;
  return '';
}

const powerIcons = new Map<string, string>();
const GLYPH: Record<PowerKind, string> = {
  strike: 'M13 2L4 14h7l-2 8 9-12h-7z',
  dot: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z',
  heal: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  freeze: 'M12 2v20M3 7l18 10M3 17L21 7',
  slow: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M12 7v5l3 3',
  summon: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-5 4-8 8-8s8 3 8 8z',
  boost: 'M12 3l7 8h-4v9H9v-9H5z',
  reveal: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};

/** Simple generated icon for a god power (coloured disc + glyph by kind). */
export function powerIcon(kind: PowerKind, color: string): string {
  const key = kind + color;
  let url = powerIcons.get(key);
  if (url) return url;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${color}" stroke="#2b2116" stroke-width="1"/>` +
    `<path d="${GLYPH[kind]}" fill="${kind === 'freeze' || kind === 'slow' ? 'none' : '#2b2116'}" stroke="#2b2116" stroke-width="${kind === 'freeze' || kind === 'slow' ? 2 : 0.5}" transform="translate(4.8 4.8) scale(.6)"/></svg>`;
  url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  powerIcons.set(key, url);
  return url;
}
