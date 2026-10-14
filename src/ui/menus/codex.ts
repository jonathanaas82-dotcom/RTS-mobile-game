import {
  FACTIONS,
  UNITS,
  buildingDef,
  factionDef,
  godDef,
  loc,
  powerDef,
  techDef,
  unitDef,
} from '../../data';
import { AGES } from '../../data/factions';
import { strongAgainst, weakAgainst } from '../../data/counters';
import { TRAITS } from '../../data/traits';
import type { FactionId, GodDef, UnitClass, UnitDef } from '../../data/types';
import { getLanguage, t, type TranslationKey } from '../../i18n';
import { createCanvas } from '../../render/assets/procedural/draw';
import { drawUnit } from '../../render/assets/procedural/units';
import { el, onPress } from '../hud/dom';
import { GLYPH } from '../commandCard';

/** What the codex is showing (kept by the menu between redraws). */
export interface CodexState {
  tab: 'gods' | 'units';
  god: string;
  faction: FactionId;
  unit: string | null;
}

const ROMAN = ['I', 'II', 'III', 'IV'];
const TEAM = '#3b82f6';
const portraits = new Map<string, string>();

function unitPortrait(u: UnitDef): string {
  let url = portraits.get(u.id);
  if (!url) {
    url = drawUnit(u, TEAM).toDataURL();
    portraits.set(u.id, url);
  }
  return url;
}

/**
 * God medallion: a glowing disc in the colour of the god's power with rays, and the god's
 * avatar on it — the mythic creature they grant, or the faction's hero for major gods.
 */
function godPortrait(g: GodDef): string {
  const key = `god:${g.id}`;
  let url = portraits.get(key);
  if (url) return url;
  const S = 180;
  const [cv, c] = createCanvas(S, S);
  const color = powerDef(g.power).color;
  const bg = c.createRadialGradient(S / 2, S * 0.42, 6, S / 2, S / 2, S / 2);
  bg.addColorStop(0, '#fff6dc');
  bg.addColorStop(0.25, color);
  bg.addColorStop(1, '#120e16');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255,240,200,0.08)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(S / 2, S * 0.42);
    c.lineTo(S / 2 + Math.cos(a - 0.09) * S, S * 0.42 + Math.sin(a - 0.09) * S);
    c.lineTo(S / 2 + Math.cos(a + 0.09) * S, S * 0.42 + Math.sin(a + 0.09) * S);
    c.closePath();
    c.fill();
  }
  c.restore();
  // The god's power glyph, large and faint behind the avatar (tells similar gods apart).
  const pk = powerDef(g.power).kind;
  c.save();
  c.translate(S * 0.12, S * 0.1);
  c.scale((S * 0.76) / 24, (S * 0.76) / 24);
  c.globalAlpha = 0.28;
  c.strokeStyle = '#fff6dc';
  c.fillStyle = '#fff6dc';
  c.lineWidth = 1.6;
  const path = new Path2D(GLYPH[pk]);
  if (pk === 'freeze' || pk === 'slow') c.stroke(path);
  else c.fill(path);
  c.restore();
  const avatar = g.mythic
    ? unitDef(g.mythic)
    : (UNITS.find((u) => u.faction === g.faction && u.cls === 'hero') ?? UNITS[0]!);
  const art = drawUnit(avatar, TEAM);
  const k = (S * 0.92) / art.width;
  c.save();
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
  c.clip();
  c.drawImage(
    art,
    S / 2 - (art.width * k) / 2,
    S * 0.9 - art.height * k * 0.86,
    art.width * k,
    art.height * k,
  );
  c.restore();
  c.lineWidth = 6;
  const ring = c.createLinearGradient(0, 0, 0, S);
  ring.addColorStop(0, '#fff1b8');
  ring.addColorStop(0.5, '#c9a24a');
  ring.addColorStop(1, '#7a5418');
  c.strokeStyle = ring;
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  c.stroke();
  // Badge with the power glyph at the lower right.
  const bx = S * 0.82;
  const by = S * 0.82;
  c.fillStyle = color;
  c.strokeStyle = '#2b2116';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(bx, by, S * 0.13, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.save();
  c.translate(bx - S * 0.085, by - S * 0.085);
  c.scale((S * 0.17) / 24, (S * 0.17) / 24);
  c.fillStyle = '#2b2116';
  c.strokeStyle = '#2b2116';
  c.lineWidth = 2.2;
  if (pk === 'freeze' || pk === 'slow') c.stroke(path2(pk));
  else c.fill(path2(pk));
  c.restore();
  url = cv.toDataURL();
  portraits.set(key, url);
  return url;
}

function path2(kind: keyof typeof GLYPH): Path2D {
  return new Path2D(GLYPH[kind]);
}

const clsName = (c: UnitClass): string => t(`cls.${c}` as TranslationKey);

/** Render the codex body into `body`; `redraw` is called after a selection changes. */
export function renderCodex(
  body: HTMLElement,
  st: CodexState,
  redraw: () => void,
  click: () => void,
): void {
  const tap = (node: HTMLElement, fn: () => void): void =>
    onPress(node, () => {
      click();
      fn();
      redraw();
    });
  if (st.tab === 'gods') gods(body, st, tap);
  else units(body, st, tap);
}

type Tap = (node: HTMLElement, fn: () => void) => void;

function godTile(
  parent: HTMLElement,
  g: GodDef,
  selected: boolean,
  tap: Tap,
  onPick: () => void,
): void {
  const lang = getLanguage();
  const b = el('button', 'codex-god' + (selected ? ' selected' : ''), parent);
  b.type = 'button';
  const img = el('img', '', b);
  img.src = godPortrait(g);
  img.alt = '';
  el('span', 'codex-god-name', b).textContent = loc(g.name, lang);
  tap(b, onPick);
}

function gods(body: HTMLElement, st: CodexState, tap: Tap): void {
  const lang = getLanguage();
  const g = godDef(st.god);
  const grid = el('div', 'codex-gods', body);

  // Left: factions and their major gods.
  const left = el('div', 'codex-panel codex-list', grid);
  for (const f of FACTIONS) {
    el('div', 'codex-faction', left).textContent = loc(f.name, lang);
    const row = el('div', 'codex-god-row', left);
    for (const gid of f.majorGods)
      godTile(row, godDef(gid), gid === st.god, tap, () => {
        st.god = gid;
        st.faction = f.id;
      });
  }

  // Centre: the selected god.
  const mid = el('div', 'codex-panel codex-feature', grid);
  const plate = el('div', 'codex-plate', mid);
  el('div', 'codex-plate-name', plate).textContent = loc(g.name, lang);
  el('div', 'codex-plate-title', plate).textContent = loc(g.title, lang);
  const big = el('img', 'codex-portrait', mid);
  big.src = godPortrait(g);
  big.alt = '';
  const info = el('div', 'codex-info', mid);
  el('div', 'codex-faction-tag', info).textContent =
    `${loc(factionDef(g.faction).name, lang)} · ${loc(AGES[g.age]!.name, lang)}`;
  el('p', '', info).textContent = loc(g.desc, lang);
  const pw = powerDef(g.power);
  const pp = el('p', '', info);
  el('b', '', pp).textContent = `${t('age.power')}: ${loc(pw.name, lang)}. `;
  pp.append(loc(pw.desc, lang));
  if (g.mythic) {
    const mp = el('p', '', info);
    el('b', '', mp).textContent = `${t('codex.mythic')}: `;
    mp.append(loc(unitDef(g.mythic).name, lang));
  }
  if (g.tech) {
    const tp = el('p', '', info);
    el('b', '', tp).textContent = `${t('codex.tech')}: `;
    tp.append(`${loc(techDef(g.tech).name, lang)} — ${loc(techDef(g.tech).desc, lang)}`);
  }

  // Right: the faction's minor gods per age, with what each unlocks.
  const right = el('div', 'codex-panel codex-ages', grid);
  el('div', 'codex-faction', right).textContent = t('codex.minor');
  const fac = factionDef(g.faction);
  for (const age of [1, 2, 3] as const) {
    const row = el('div', 'codex-age-row', right);
    el('div', 'codex-age-num', row).textContent = ROMAN[age]!;
    for (const gid of fac.minorGods[age]) {
      const mg = godDef(gid);
      const cell = el('div', 'codex-age-cell', row);
      godTile(cell, mg, gid === st.god, tap, () => (st.god = gid));
      const unlocks = el('div', 'codex-unlocks', cell);
      el('span', '', unlocks).textContent = loc(mg.title, lang);
      if (mg.mythic) {
        const im = el('img', '', unlocks);
        im.src = unitPortrait(unitDef(mg.mythic));
        im.alt = loc(unitDef(mg.mythic).name, lang);
        im.title = im.alt;
      }
    }
  }
}

function units(body: HTMLElement, st: CodexState, tap: Tap): void {
  const lang = getLanguage();
  const tabs = el('div', 'segmented codex-factions', body);
  for (const f of FACTIONS) {
    const b = el('button', 'seg-btn' + (f.id === st.faction ? ' selected' : ''), tabs);
    b.type = 'button';
    b.textContent = loc(f.name, lang);
    tap(b, () => {
      st.faction = f.id;
      st.unit = null;
    });
  }
  const list = UNITS.filter((u) => u.faction === st.faction).sort(
    (a, b) => a.age - b.age || order(a.cls) - order(b.cls),
  );
  const sel = list.find((u) => u.id === st.unit) ?? list.find((u) => u.cls === 'infantry')!;
  const wrap = el('div', 'codex-units', body);
  const grid = el('div', 'codex-unit-grid', wrap);
  for (const u of list) {
    const b = el('button', 'codex-unit' + (u.id === sel.id ? ' selected' : ''), grid);
    b.type = 'button';
    const img = el('img', '', b);
    img.src = unitPortrait(u);
    img.alt = '';
    el('span', 'codex-unit-name', b).textContent = loc(u.name, lang);
    el('span', 'codex-unit-meta', b).textContent = `${clsName(u.cls)} · ${ROMAN[u.age]}`;
    if (u.traits?.length) {
      const tr = el('span', 'codex-unit-traits', b);
      for (const id of u.traits)
        tr.insertAdjacentHTML(
          'beforeend',
          `<svg viewBox="0 0 24 24"><path d="${TRAITS[id].glyph}"/></svg>`,
        );
    }
    tap(b, () => (st.unit = u.id));
  }
  detail(el('div', 'codex-panel codex-detail', wrap), sel);
}

function order(c: UnitClass): number {
  return ['worker', 'infantry', 'ranged', 'cavalry', 'siege', 'hero', 'mythic'].indexOf(c);
}

/** Stat sheet of one unit: portrait, role, bars, cost, traits, counters. */
function detail(p: HTMLElement, u: UnitDef): void {
  const lang = getLanguage();
  const head = el('div', 'codex-detail-head', p);
  const img = el('img', 'codex-detail-img', head);
  img.src = unitPortrait(u);
  img.alt = '';
  const ht = el('div', '', head);
  el('div', 'codex-plate-name', ht).textContent = loc(u.name, lang);
  el('div', 'codex-faction-tag', ht).textContent =
    `${clsName(u.cls)} · ${t('codex.age', { age: ROMAN[u.age]! })}`;
  if (u.role) el('p', 'codex-role', p).textContent = loc(u.role, lang);
  const stats = el('div', 'codex-stats', p);
  const bar = (label: string, v: number, max: number, text: string): void => {
    const r = el('div', 'codex-stat', stats);
    el('span', 'codex-stat-label', r).textContent = label;
    const track = el('span', 'codex-stat-track', r);
    el('span', 'codex-stat-fill', track).style.width = `${Math.min(100, (v / max) * 100)}%`;
    el('span', 'codex-stat-val', r).textContent = text;
  };
  const a = u.attack;
  bar(t('codex.hp'), u.hp, 600, String(u.hp));
  if (a) {
    const dps = a.damage / a.cooldown;
    bar(t('codex.dmg'), dps, 30, `${a.damage}`);
    bar(t('codex.range'), a.range, 9, a.range < 1 ? t('sel.melee') : a.range.toFixed(1));
  }
  bar(t('codex.speed'), u.speed, 3.2, u.speed.toFixed(1));
  bar(t('codex.armor'), u.armor, 0.5, `${Math.round(u.armor * 100)}%`);
  const cost = el('div', 'codex-cost', p);
  for (const k of ['food', 'wood', 'gold', 'favor'] as const)
    if (u.cost[k])
      cost.insertAdjacentHTML(
        'beforeend',
        `<span class="chip"><i class="dot dot-${k}"></i>${u.cost[k]}</span>`,
      );
  cost.insertAdjacentHTML(
    'beforeend',
    `<span class="codex-at">${t('codex.trainedAt', { building: loc(buildingDef(u.trainedAt).name, lang) })}</span>`,
  );
  for (const id of u.traits ?? []) {
    const tr = el('div', 'codex-trait', p);
    tr.innerHTML = `<svg viewBox="0 0 24 24"><path d="${TRAITS[id].glyph}"/></svg>`;
    const tx = el('div', '', tr);
    el('b', '', tx).textContent = loc(TRAITS[id].name, lang);
    el('span', '', tx).textContent = loc(TRAITS[id].desc, lang);
  }
  if (u.ability) {
    const tr = el('div', 'codex-trait', p);
    tr.innerHTML = `<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-2 8 9-12h-7z"/></svg>`;
    const tx = el('div', '', tr);
    el('b', '', tx).textContent = loc(u.ability.name, lang);
    el('span', '', tx).textContent = loc(u.ability.desc, lang);
  }
  const strong = strongAgainst(u.cls).filter((c) => c !== 'worker');
  const weak = weakAgainst(u.cls);
  const ct = el('div', 'codex-counters', p);
  if (strong.length)
    el('div', '', ct).textContent = `▲ ${t('codex.strong')}: ${strong.map(clsName).join(', ')}`;
  if (weak.length)
    el('div', '', ct).textContent = `▼ ${t('codex.weak')}: ${weak.map(clsName).join(', ')}`;
}
