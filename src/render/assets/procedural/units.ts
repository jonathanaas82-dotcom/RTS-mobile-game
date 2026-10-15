import type { FactionId, UnitDef } from '../../../data/types';
import { TILE_PX } from '../tileset';
import {
  ART_RES,
  castShadow,
  createCanvas,
  dgrad,
  mix,
  outlined,
  rgrad,
  shade,
  softShadow,
  sunlight,
  vgrad,
} from './draw';

type Ctx = CanvasRenderingContext2D;

/** Base canvas size (texture px) for a scale-1 unit (a worker is roughly 0.6 tiles tall). */
const BASE = TILE_PX * 1.0 * ART_RES;

const SKIN: Record<FactionId, string> = {
  hrimfolk: '#ecc6a2',
  aurelian: '#d9a87e',
  sahrun: '#b47a4c',
};
const HAIR: Record<FactionId, string> = {
  hrimfolk: '#c99a4e',
  aurelian: '#3b2a1e',
  sahrun: '#1f1712',
};
const STEEL = '#b9c0ca';
const BRONZE = '#c8893a';
const GOLD = '#e8b830';
const LEATHER = '#6b4a2e';
const WOOD = '#7a5634';

function line(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string | CanvasGradient,
): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

function rr(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function oval(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
  rot = 0,
): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

/** Work activities a worker can be drawn doing (two key frames each: 0 = wind-up, 1 = strike). */
export type WorkAct = 'chop' | 'mine' | 'build' | 'farm' | 'pick' | 'fish';
/** What a walking worker carries home. */
export type CarryArt = 'wood' | 'gold' | 'berries' | 'fish' | 'grain';

/** Animation pose for a humanoid. Omitted = the standing idle pose. */
export interface Pose {
  act?: WorkAct;
  frame?: 0 | 1;
  carry?: CarryArt;
  /** Mid-stride legs (alternated with the standing pose while walking). */
  stride?: boolean;
}

export const WORK_ACTS: readonly WorkAct[] = ['chop', 'mine', 'build', 'farm', 'pick', 'fish'];
export const CARRY_ARTS: readonly CarryArt[] = ['wood', 'gold', 'berries', 'fish', 'grain'];

/** Frame-name suffix of a pose (empty for idle). */
export function poseName(p: Pose): string {
  if (p.act) return `${p.act}${p.frame ?? 0}`;
  if (p.carry) return `carry_${p.carry}${p.stride ? '_w' : ''}`;
  return p.stride ? 'walk' : '';
}

/**
 * Draw a unit facing right on a transparent canvas: shaded figure with a dark outline and a soft
 * contact shadow. Anchor convention: feet at (0.5, 0.86) of the canvas.
 */
export function drawUnit(def: UnitDef, team: string, pose: Pose = {}): HTMLCanvasElement {
  const scale = def.art.scale ?? 1;
  const S = Math.round(BASE * scale);
  const [fig, c] = createCanvas(S, S);
  c.save();
  c.scale(S / 100, S / 100); // draw in a 100×100 design box
  const wide = ['rider', 'beast', 'serpent', 'flyer'].includes(def.art.shape);
  if (wide) {
    // Snouts, beaks and tails reach the box edge: inset slightly so the outline isn't clipped.
    c.translate(50, 86);
    c.scale(0.94, 0.94);
    c.translate(-50, -86);
  }
  switch (def.art.shape) {
    case 'humanoid':
      humanoid(c, def, team, 50, 86, 1, pose);
      break;
    case 'rider':
      rider(c, def, team);
      break;
    case 'engine':
      engine(c, def, team);
      break;
    case 'giant':
      giant(c, def, team);
      break;
    case 'serpent':
      serpent(c, def, team);
      break;
    case 'beast':
      beast(c, def, team);
      break;
    case 'flyer':
      flyer(c, def, team);
      break;
    case 'construct':
      construct(c, def, team);
      break;
  }
  c.restore();
  sunlight(fig, S * 0.86, Math.max(1.6, S / 64));
  const [out, oc] = createCanvas(S, S);
  const flying = def.art.shape === 'flyer';
  // Small contact shadow under the feet; the long cast shadow is a separate sprite.
  softShadow(oc, S * 0.5, S * 0.87, S * (flying ? 0.2 : 0.22), S * 0.06, flying ? 0.25 : 0.3);
  oc.drawImage(outlined(fig, Math.max(2, S / 48)), 0, 0);
  figures.set(out, fig);
  return out;
}

const figures = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** Fraction of the unit canvas height where the feet stand (sprite origin y). */
export const UNIT_FEET = 0.86;

/**
 * Long cast shadow for a unit canvas from `drawUnit` (same top-left origin, feet at
 * (0.5, UNIT_FEET) of the source size), or null for flyers, which keep a soft ground blob.
 */
export function unitShadow(def: UnitDef, unit: HTMLCanvasElement): HTMLCanvasElement | null {
  const fig = figures.get(unit);
  if (!fig || def.art.shape === 'flyer') return null;
  return castShadow(fig, fig.height * UNIT_FEET, 0.3);
}

// ───────────────────────── humanoids ─────────────────────────

type Helm = NonNullable<UnitDef['art']['helm']>;
type Armor = NonNullable<UnitDef['art']['armor']>;
type ShieldKind = NonNullable<UnitDef['art']['shield']>;

/** Resolved look of a humanoid: explicit art fields, else faction/class defaults. */
interface Look {
  helm: Helm;
  armor: Armor;
  shield: ShieldKind;
  cape: boolean;
}

const DEFAULT_LOOK: Record<
  FactionId,
  { worker: [Helm, Armor]; soldier: [Helm, Armor, ShieldKind] }
> = {
  hrimfolk: { worker: ['cap', 'fur'], soldier: ['nasal', 'mail', 'round'] },
  aurelian: { worker: ['none', 'cloth'], soldier: ['crested', 'plate', 'hoplon'] },
  sahrun: { worker: ['nemes', 'linen'], soldier: ['nemes', 'linen', 'oval'] },
};

function lookOf(def: UnitDef): Look {
  const a = def.art;
  const d = DEFAULT_LOOK[def.faction];
  const worker = def.cls === 'worker';
  const shielded = def.cls === 'infantry' || (def.cls === 'hero' && a.weapon !== 'staff');
  return {
    helm: a.helm ?? (worker ? d.worker[0] : d.soldier[0]),
    armor: a.armor ?? (worker ? d.worker[1] : d.soldier[1]),
    shield: a.shield ?? (shielded ? d.soldier[2] : 'none'),
    cape: a.cape ?? def.cls === 'hero',
  };
}

type Beard = 'none' | 'stubble' | 'short' | 'full' | 'braid' | 'forked';
type Emblem = 'plain' | 'quarter' | 'spiral' | 'cross' | 'halves' | 'sun' | 'gorgon';
type Hat = 'hood' | 'pilos' | 'khat';

/** Per-unit cosmetic details the data file doesn't carry (hair, beard, shield blazon...). */
interface Detail {
  hair: string;
  beard: Beard;
  emblem: Emblem;
  /** Norse travelling cloak pinned with a round brooch (capes come from the look). */
  cloak: boolean;
  /** Peasant headgear that replaces the helm. */
  hat?: Hat;
  /** Aurelian quilted linen corselet instead of a bronze cuirass. */
  linothorax?: boolean;
}

const NORSE_HAIR = ['#c99a4e', '#b5652f', '#8a5a32', '#dcbc78', '#6b4a30'];

const DETAILS: Record<string, Partial<Detail>> = {
  hearthkin: { hat: 'hood', beard: 'full', hair: '#9a6a3a' },
  shieldbrother: { beard: 'braid', emblem: 'quarter', hair: '#c99a4e' },
  ravenbow: { beard: 'short', hair: '#4a3424' },
  spearwarden: { beard: 'forked', emblem: 'spiral', cloak: true, hair: '#b5652f' },
  wildheart: { beard: 'full', hair: '#9a4a22' },
  hornblower: { beard: 'braid', hair: '#d6c7a6' },
  wolfrider: { beard: 'braid', hair: '#6b4a30' },
  stormsworn: { beard: 'forked', emblem: 'cross', hair: '#e6c470' },
  citizen: { hat: 'pilos', beard: 'short' },
  bronzeguard: { emblem: 'sun', linothorax: true },
  slinger: { beard: 'stubble' },
  javelineer: { beard: 'none' },
  lionheart: { emblem: 'gorgon', beard: 'full' },
  toiler: { hat: 'khat' },
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function detailOf(def: UnitDef): Detail {
  const f = def.faction;
  const worker = def.cls === 'worker';
  const base: Detail = {
    hair: f === 'hrimfolk' ? NORSE_HAIR[hashId(def.id) % NORSE_HAIR.length]! : HAIR[f],
    beard:
      f === 'hrimfolk'
        ? worker
          ? 'full'
          : 'braid'
        : f === 'aurelian' && !worker
          ? 'short'
          : 'none',
    emblem: f === 'aurelian' ? 'sun' : 'plain',
    cloak: false,
  };
  return { ...base, ...DETAILS[def.id] };
}

/** Clothing colours and arm dressing resolved once per figure. */
interface Garb {
  tunic: string;
  pants: string;
  /** Sleeve cloth and how far down the arm it reaches (0 = shoulder, 1 = hand). */
  sleeve: string | null;
  sleeveTo: number;
  bracer: string | null;
  glove: string | null;
  armlet: string | null;
}

function garbOf(def: UnitDef, look: Look, team: string, d: Detail): Garb {
  const f = def.faction;
  const worker = def.cls === 'worker';
  const body = def.art.body;
  if (f === 'hrimfolk') {
    const berserk = look.armor === 'fur' && !worker;
    const tunic = worker ? body : mix(body, team, 0.18);
    return {
      tunic,
      pants: shade(mix(body, '#4a4038', 0.45), 0.8),
      sleeve: berserk ? null : look.armor === 'mail' ? STEEL : tunic,
      sleeveTo: look.armor === 'mail' ? 0.5 : 0.86,
      bracer: worker ? null : LEATHER,
      glove: worker || berserk ? null : '#5e4430',
      armlet: berserk ? BRONZE : null,
    };
  }
  if (f === 'aurelian') {
    const chiton = look.armor === 'cloth' ? mix(body, team, 0.55) : mix(team, '#efe2c8', 0.25);
    const armored = look.armor === 'plate' || look.armor === 'scale' || !!d.linothorax;
    return {
      tunic: chiton,
      pants: chiton,
      sleeve: chiton,
      sleeveTo: 0.3,
      bracer: armored ? BRONZE : look.armor === 'leather' ? LEATHER : null,
      glove: null,
      armlet: null,
    };
  }
  const robe = def.cls === 'hero';
  return {
    tunic: '#f2ead6',
    pants: '#f2ead6',
    sleeve: robe ? '#f2ead6' : null,
    sleeveTo: 0.4,
    bracer: def.art.weapon === 'bow' ? LEATHER : null,
    glove: null,
    armlet: worker ? null : GOLD,
  };
}

const INK = 'rgba(30,20,12,0.5)';

/** A stroke over a thin dark edge, so overlapping limbs and hafts stay separate. */
function inked(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string | CanvasGradient,
): void {
  line(c, x0, y0, x1, y1, w + Math.max(0.9, w * 0.3), INK);
  line(c, x0, y0, x1, y1, w, color);
}

/** Woven trim band (horizontal): tablet-weave diamonds, or a Greek key of light squares. */
function trimBand(
  c: Ctx,
  x0: number,
  y: number,
  x1: number,
  h: number,
  color: string,
  pattern: 'diamond' | 'key' = 'diamond',
  dot = '#f3e6c4',
): void {
  c.fillStyle = color;
  c.fillRect(x0, y, x1 - x0, h);
  c.fillStyle = dot;
  c.beginPath();
  const step = h * 1.7;
  for (let x = x0 + step / 2; x < x1; x += step) {
    if (pattern === 'diamond') {
      c.moveTo(x, y + h * 0.15);
      c.lineTo(x + h * 0.35, y + h / 2);
      c.lineTo(x, y + h * 0.85);
      c.lineTo(x - h * 0.35, y + h / 2);
      c.closePath();
    } else c.rect(x - h * 0.28, y + h * 0.22, h * 0.56, h * 0.56);
  }
  c.fill();
}

/** Mail texture: staggered rows of small ring arcs (one path, one stroke). */
function rings(c: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, w: number): void {
  c.strokeStyle = shade(STEEL, 0.55);
  c.lineWidth = w;
  c.beginPath();
  let row = 0;
  for (let y = y0; y < y1; y += r * 2.1, row++)
    for (let x = x0 + (row % 2) * r * 1.15; x < x1; x += r * 2.3) {
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI);
    }
  c.stroke();
}

/** Overlapping metal scales (rows of half discs with dark edges and a glint each). */
function scales(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  metal: string,
): void {
  let row = 0;
  for (let y = y0; y < y1; y += r * 1.25, row++) {
    c.beginPath();
    for (let x = x0 + (row % 2) * r; x < x1 + r; x += r * 2) {
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI);
    }
    c.fillStyle = shade(metal, row % 2 ? 0.92 : 1.05);
    c.fill();
    c.strokeStyle = shade(metal, 0.55);
    c.lineWidth = r * 0.28;
    c.stroke();
  }
}

/** Wrapped grip: short dark bands across the segment (x0,y0)→(x1,y1). */
function wraps(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  w: number,
  color: string,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * w;
  const py = (dx / len) * w;
  c.strokeStyle = color;
  c.lineWidth = w * 0.45;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    c.moveTo(x - px, y - py + w * 0.3);
    c.lineTo(x + px, y + py - w * 0.3);
  }
  c.stroke();
}

/** Wooden haft with a dark edge and a lit grain line along its upper-left side. */
function haft(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  wood = WOOD,
): void {
  inked(c, x0, y0, x1, y1, w, wood);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (dy / len) * w * 0.22;
  const oy = (-dx / len) * w * 0.22;
  line(c, x0 + ox, y0 + oy, x1 + ox, y1 + oy, w * 0.28, shade(wood, 1.4));
  line(c, x0 - ox, y0 - oy, x1 - ox, y1 - oy, w * 0.2, shade(wood, 0.7));
}

/** Run `draw` in a frame at (x, y) rotated `deg` clockwise from straight up. */
function framed(c: Ctx, x: number, y: number, deg: number, draw: () => void): void {
  c.save();
  c.translate(x, y);
  c.rotate((deg * Math.PI) / 180);
  draw();
  c.restore();
}

/** Back hair, face, beard and headgear. */
function head(
  c: Ctx,
  def: UnitDef,
  look: Look,
  d: Detail,
  team: string,
  fx: number,
  hy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const skin = SKIN[f];
  const hero = def.cls === 'hero';
  const worker = def.cls === 'worker';
  const hair = d.hair;
  const helm: Helm | Hat = d.hat ?? look.helm;
  const corinthian = helm === 'crested' || helm === 'plumed';
  const fierce = !worker && def.cls !== 'hero';
  if (def.id === 'jackal_sentinel') {
    jackalHead(c, def, team, fx, hy, s);
    return;
  }
  // Long hair and a braid falling behind the neck (Norse, unless hooded).
  if (f === 'hrimfolk' && helm !== 'wolfhood' && helm !== 'hood') {
    c.fillStyle = vgrad(c, hy - s(6), hy + s(12), hair);
    c.beginPath();
    c.moveTo(fx - s(8), hy - s(7));
    c.quadraticCurveTo(fx - s(13), hy + s(2), fx - s(11.5), hy + s(10));
    c.lineTo(fx - s(5.5), hy + s(9));
    c.quadraticCurveTo(fx - s(4), hy + s(1), fx - s(2), hy - s(4));
    c.closePath();
    c.fill();
    for (let i = 0; i < 3; i++)
      oval(c, fx - s(9.5), hy + s(10.5) + i * s(2.6), s(1.7), s(1.6), shade(hair, 0.9 - i * 0.06));
    disc(c, fx - s(9.5), hy + s(18.2), s(1), hero ? GOLD : BRONZE);
  }
  // Face, ear, eye, brow, nose, cheek and mouth (facing right).
  disc(c, fx, hy, s(10), rgrad(c, fx, hy, s(10), skin));
  c.fillStyle = 'rgba(90,40,20,0.14)';
  c.beginPath();
  c.arc(fx, hy, s(10), Math.PI * 0.35, Math.PI * 0.95);
  c.closePath();
  c.fill();
  oval(c, fx - s(3.5), hy + s(1), s(2), s(2.8), shade(skin, 0.86));
  line(c, fx - s(3.3), hy - s(0.3), fx - s(3.6), hy + s(2.2), s(0.7), shade(skin, 0.62));
  oval(c, fx + s(5.3), hy - s(0.8), s(2.1), s(1.6), '#f7f1e6');
  disc(c, fx + s(5.9), hy - s(0.7), s(1.25), f === 'hrimfolk' ? '#2f4a63' : '#2a1d14');
  disc(c, fx + s(6.3), hy - s(1.2), s(0.45), '#ffffff');
  line(c, fx + s(3.4), hy - s(2.2), fx + s(7.2), hy - s(1.9), s(0.75), 'rgba(40,22,12,0.75)');
  if (f === 'sahrun') {
    // Kohl-lined eye.
    line(c, fx + s(3.3), hy - s(1), fx + s(0.8), hy - s(0.4), s(0.9), '#16100c');
    line(c, fx + s(3.6), hy + s(0.5), fx + s(7), hy + s(0.6), s(0.55), '#16100c');
  }
  line(
    c,
    fx + s(2.8),
    hy - s(4.4),
    fx + s(7.8),
    hy - s(fierce ? 2.9 : 3.9),
    s(1.4),
    shade(f === 'hrimfolk' ? hair : HAIR[f], 0.75),
  );
  c.fillStyle = shade(skin, 0.94);
  c.beginPath();
  c.moveTo(fx + s(8.4), hy - s(2.4));
  c.quadraticCurveTo(fx + s(11.6), hy + s(1.6), fx + s(10.4), hy + s(2.8));
  c.lineTo(fx + s(8.4), hy + s(2.8));
  c.closePath();
  c.fill();
  disc(c, fx + s(9.2), hy + s(2.2), s(0.5), shade(skin, 0.6));
  disc(c, fx + s(4), hy + s(3.2), s(2.2), 'rgba(214,100,80,0.22)');
  if (def.id === 'wildheart') {
    // War cry: open mouth.
    oval(c, fx + s(7.2), hy + s(5.6), s(1.6), s(1.3), '#4a1612');
  } else
    line(
      c,
      fx + s(5.2),
      hy + s(5.8),
      fx + s(8.4),
      hy + s(fierce ? 5.8 : 5.3),
      s(0.9),
      shade(skin, 0.55),
    );
  // Peasant hood sits under the beard.
  if (helm === 'hood') {
    const wool = mix(team, '#7a6a52', 0.45);
    c.fillStyle = vgrad(c, hy - s(15), hy + s(14), wool);
    c.beginPath();
    c.moveTo(fx + s(8.5), hy - s(5.5));
    c.quadraticCurveTo(fx + s(6), hy - s(15), fx - s(3), hy - s(14.5));
    c.quadraticCurveTo(fx - s(13.5), hy - s(12.5), fx - s(12.5), hy + s(3));
    c.lineTo(fx - s(15.5), hy + s(13));
    c.quadraticCurveTo(fx - s(2), hy + s(16), fx + s(9.5), hy + s(12.5));
    c.lineTo(fx + s(8), hy + s(9));
    c.quadraticCurveTo(fx + s(0.5), hy + s(8.5), fx - s(1), hy + s(2));
    c.quadraticCurveTo(fx - s(1), hy - s(4), fx + s(8.5), hy - s(5.5));
    c.closePath();
    c.fill();
    // Liripipe tail, rolled face edge and a seam.
    c.fillStyle = shade(wool, 0.82);
    c.beginPath();
    c.moveTo(fx - s(8), hy - s(13));
    c.quadraticCurveTo(fx - s(16), hy - s(14), fx - s(18), hy - s(6));
    c.quadraticCurveTo(fx - s(14), hy - s(9), fx - s(11), hy - s(7));
    c.closePath();
    c.fill();
    c.strokeStyle = shade(wool, 1.3);
    c.lineWidth = s(1.4);
    c.beginPath();
    c.moveTo(fx + s(8.5), hy - s(5.5));
    c.quadraticCurveTo(fx - s(1), hy - s(4), fx - s(1), hy + s(2));
    c.quadraticCurveTo(fx + s(0.5), hy + s(8.5), fx + s(8), hy + s(9));
    c.stroke();
    line(c, fx - s(6), hy - s(13), fx - s(8), hy + s(4), s(0.6), shade(wool, 0.7));
  }
  beard(c, d.beard, f === 'hrimfolk' ? hair : HAIR[f], fx, hy, s, hero, corinthian);
  // Bare heads: hair on top (Greek curls, a fillet in team colour for soldiers).
  if (helm === 'none' || helm === 'pilos') {
    const hc = f === 'hrimfolk' ? hair : HAIR[f];
    c.fillStyle = vgrad(c, hy - s(12), hy + s(3), hc);
    c.beginPath();
    c.moveTo(fx + s(8.5), hy - s(5));
    c.quadraticCurveTo(fx + s(5), hy - s(12.5), fx - s(3), hy - s(11.5));
    c.quadraticCurveTo(fx - s(11.5), hy - s(9), fx - s(10.5), hy + s(3));
    c.lineTo(fx - s(5.5), hy + s(3));
    c.quadraticCurveTo(fx - s(6), hy - s(3.5), fx - s(1), hy - s(4.5));
    c.quadraticCurveTo(fx + s(4), hy - s(6.5), fx + s(8.5), hy - s(5));
    c.closePath();
    c.fill();
    if (f === 'aurelian')
      for (const [x, y] of [
        [6, -6.5],
        [2, -8.5],
        [-3, -9.5],
        [-7.5, -7],
        [-9.5, -2],
        [-8, 2],
      ] as const)
        disc(c, fx + s(x), hy + s(y), s(2), shade(hc, 1.18));
    if (helm === 'none' && !worker) {
      c.strokeStyle = team;
      c.lineWidth = s(1.8);
      c.beginPath();
      c.arc(fx, hy - s(1), s(9.8), Math.PI * 1.05, Math.PI * 1.85);
      c.stroke();
    }
  }
  helmet(c, def, helm, team, fx, hy, s);
}

/** Black jackal head with tall gilded ears over a striped headcloth (the jackal sentinel). */
function jackalHead(
  c: Ctx,
  def: UnitDef,
  team: string,
  fx: number,
  hy: number,
  s: (v: number) => number,
): void {
  const fur = '#2b2b30';
  helmet(c, def, 'nemes', team, fx, hy, s);
  for (const [x, col] of [
    [-5, shade(fur, 0.8)],
    [0, fur],
  ] as const) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(fx + s(x - 2.5), hy - s(6));
    c.lineTo(fx + s(x + 1), hy - s(22));
    c.lineTo(fx + s(x + 4.5), hy - s(6));
    c.closePath();
    c.fill();
    line(c, fx + s(x + 1), hy - s(18), fx + s(x + 1.2), hy - s(9), s(1.2), GOLD);
  }
  disc(c, fx, hy - s(1), s(9), rgrad(c, fx, hy - s(1), s(9), fur));
  c.fillStyle = vgrad(c, hy - s(5), hy + s(6), fur);
  c.beginPath();
  c.moveTo(fx + s(3), hy - s(5));
  c.quadraticCurveTo(fx + s(12), hy - s(4), fx + s(18), hy);
  c.lineTo(fx + s(17.5), hy + s(2.5));
  c.quadraticCurveTo(fx + s(10), hy + s(4.5), fx + s(3), hy + s(6));
  c.closePath();
  c.fill();
  line(c, fx + s(5), hy - s(4.2), fx + s(15), hy - s(1.8), s(0.9), shade(fur, 1.8));
  disc(c, fx + s(17.6), hy + s(0.6), s(1.3), '#0c0c10');
  line(c, fx + s(8), hy + s(3.4), fx + s(16.5), hy + s(2.4), s(0.8), '#0c0c10');
  oval(c, fx + s(5.5), hy - s(2.5), s(2), s(1.2), GOLD, -0.2);
  disc(c, fx + s(6), hy - s(2.5), s(0.7), '#1a1008');
  line(c, fx + s(3.5), hy - s(2.2), fx + s(0.5), hy - s(1.6), s(0.9), GOLD);
}

/** Beards and moustaches by style. */
function beard(
  c: Ctx,
  style: Beard,
  hair: string,
  fx: number,
  hy: number,
  s: (v: number) => number,
  hero: boolean,
  corinthian: boolean,
): void {
  if (style === 'none') return;
  if (style === 'stubble') {
    c.fillStyle = 'rgba(40,26,16,0.25)';
    c.beginPath();
    c.moveTo(fx - s(2), hy - s(1));
    c.quadraticCurveTo(fx, hy + s(9.5), fx + s(9.5), hy + s(5));
    c.lineTo(fx + s(9), hy + s(3.5));
    c.quadraticCurveTo(fx + s(3), hy + s(4), fx, hy - s(1));
    c.closePath();
    c.fill();
    return;
  }
  const long = style === 'full' || style === 'forked' || style === 'braid';
  const bottom = style === 'short' ? 10.5 : style === 'braid' ? 12.5 : 15;
  c.fillStyle = vgrad(c, hy, hy + s(bottom), hair);
  c.beginPath();
  c.moveTo(fx - s(2.5), hy - s(3.5));
  c.lineTo(fx - s(0.5), hy - s(3.5));
  c.quadraticCurveTo(fx + s(1), hy + s(3), fx + s(5), hy + s(4.2));
  c.lineTo(fx + s(10.2), hy + s(4.2));
  c.quadraticCurveTo(fx + s(11.5), hy + s(bottom - 4), fx + s(6), hy + s(bottom));
  c.quadraticCurveTo(fx - s(1), hy + s(bottom + 1), fx - s(3.5), hy + s(long ? 8 : 5));
  c.closePath();
  c.fill();
  // Strands and a moustache.
  c.strokeStyle = shade(hair, 0.7);
  c.lineWidth = s(0.6);
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    c.moveTo(fx + s(1 + i * 2.2), hy + s(5.5));
    c.lineTo(fx + s(i * 2.2), hy + s(bottom - 2));
  }
  c.stroke();
  c.fillStyle = shade(hair, 1.12);
  c.beginPath();
  c.moveTo(fx + s(4.8), hy + s(4.8));
  c.quadraticCurveTo(fx + s(8), hy + s(3), fx + s(10.8), hy + s(4.8));
  c.quadraticCurveTo(fx + s(9.5), hy + s(6.8), fx + s(5.5), hy + s(6.4));
  c.closePath();
  c.fill();
  if (!corinthian) line(c, fx + s(6.5), hy + s(7), fx + s(9), hy + s(7), s(0.8), '#3a1a10');
  if (style === 'braid' || style === 'forked') {
    // Braided tail(s) with metal beads.
    const tails = style === 'forked' ? [2, 6.5] : [4.5];
    for (const tx of tails) {
      for (let i = 0; i < 3; i++)
        oval(c, fx + s(tx), hy + s(bottom + 0.5 + i * 2.3), s(1.6), s(1.5), shade(hair, 0.95));
      disc(c, fx + s(tx), hy + s(bottom + 7.2), s(1.1), hero ? GOLD : BRONZE);
    }
  }
}

/** Helmets, hoods and crowns. */
function helmet(
  c: Ctx,
  def: UnitDef,
  helm: Helm | Hat,
  team: string,
  fx: number,
  hy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const hero = def.cls === 'hero';
  const metal = hero ? GOLD : f === 'aurelian' ? BRONZE : STEEL;
  const rivets = (pts: ReadonlyArray<readonly [number, number]>, col: string): void => {
    c.fillStyle = col;
    c.beginPath();
    for (const [x, y] of pts) {
      c.moveTo(fx + s(x) + s(0.7), hy + s(y));
      c.arc(fx + s(x), hy + s(y), s(0.7), 0, Math.PI * 2);
    }
    c.fill();
  };
  switch (helm) {
    case 'none':
    case 'hood':
      break;
    case 'pilos': {
      // Conical felt cap of a Greek labourer.
      const felt = '#a8844e';
      c.fillStyle = dgrad(c, fx - s(10), hy - s(19), fx + s(10), hy - s(4), felt);
      c.beginPath();
      c.moveTo(fx - s(10.5), hy - s(3.5));
      c.quadraticCurveTo(fx - s(9), hy - s(15), fx + s(0.5), hy - s(19.5));
      c.quadraticCurveTo(fx + s(9), hy - s(14), fx + s(10.5), hy - s(4));
      c.closePath();
      c.fill();
      rr(c, fx - s(11), hy - s(5.2), s(22), s(2.4), s(1.2), shade(felt, 0.75));
      line(c, fx - s(4), hy - s(13), fx - s(1), hy - s(17), s(1), shade(felt, 1.3));
      break;
    }
    case 'khat': {
      // Egyptian bag headcloth, gathered into a tail at the nape, with a team band.
      const cloth = mix('#f2ead6', team, 0.15);
      c.fillStyle = vgrad(c, hy - s(13), hy + s(10), cloth);
      c.beginPath();
      c.moveTo(fx + s(8.5), hy - s(5));
      c.quadraticCurveTo(fx + s(4), hy - s(13.5), fx - s(4), hy - s(12));
      c.quadraticCurveTo(fx - s(12.5), hy - s(9), fx - s(12), hy + s(2));
      c.quadraticCurveTo(fx - s(16), hy + s(8), fx - s(12), hy + s(11));
      c.lineTo(fx - s(5.5), hy + s(4));
      c.quadraticCurveTo(fx - s(4), hy - s(3), fx + s(1), hy - s(4.5));
      c.closePath();
      c.fill();
      line(c, fx - s(4), hy - s(5), fx + s(8.5), hy - s(5), s(2), team);
      line(c, fx - s(10), hy - s(6), fx - s(11), hy + s(4), s(0.7), shade(cloth, 0.7));
      break;
    }
    case 'cap':
      if (f === 'aurelian') {
        // Bronze pilos helmet.
        c.fillStyle = dgrad(c, fx - s(10), hy - s(19), fx + s(10), hy - s(3), BRONZE);
        c.beginPath();
        c.moveTo(fx - s(11), hy - s(3));
        c.quadraticCurveTo(fx - s(9.5), hy - s(15), fx, hy - s(18.5));
        c.quadraticCurveTo(fx + s(9.5), hy - s(15), fx + s(11), hy - s(3));
        c.closePath();
        c.fill();
        rr(c, fx - s(12), hy - s(4.5), s(24), s(2.6), s(1.3), shade(BRONZE, 0.75));
        line(c, fx - s(4), hy - s(12), fx, hy - s(16), s(1.3), shade(BRONZE, 1.5));
      } else if (f === 'sahrun') {
        // Leather war cap with a bronze band and team tassel.
        const lea = '#7a5230';
        c.fillStyle = dgrad(c, fx - s(10), hy - s(14), fx + s(10), hy - s(2), lea);
        c.beginPath();
        c.arc(fx, hy - s(2), s(11), Math.PI * 1.0, Math.PI * 2.0);
        c.closePath();
        c.fill();
        rr(c, fx - s(11.5), hy - s(4), s(23), s(2.6), s(1.2), BRONZE);
        line(c, fx - s(10), hy - s(3), fx - s(13), hy + s(6), s(2), team);
        line(c, fx - s(4), hy - s(11), fx + s(3), hy - s(12), s(1.2), shade(lea, 1.4));
      } else {
        // Fur-trimmed wool cap.
        c.fillStyle = vgrad(c, hy - s(14), hy - s(3), mix(team, '#7a6a52', 0.5));
        c.beginPath();
        c.ellipse(fx - s(1), hy - s(6), s(11), s(8), 0, Math.PI, 0);
        c.fill();
        rr(c, fx - s(12), hy - s(6.5), s(23), s(4), s(2), '#b8a07a');
      }
      break;
    case 'nasal':
    case 'horned': {
      // Spangenhelm: a rounded cone of riveted plates, brow band and nasal (no horns).
      const winged = helm === 'horned' && hero;
      const band = helm === 'horned' || hero ? BRONZE : shade(STEEL, 0.75);
      const wing = (tipx: number, tipy: number, far: boolean): void => {
        const col = far ? '#1f2028' : '#2c2e3a';
        c.fillStyle = vgrad(c, hy + s(tipy), hy - s(4), col, 1.5, 0.8);
        c.beginPath();
        c.moveTo(fx - s(3), hy - s(9));
        c.quadraticCurveTo(fx + s(tipx * 0.3), hy + s(tipy * 0.9), fx + s(tipx), hy + s(tipy));
        for (let i = 1; i <= 4; i++)
          c.lineTo(fx + s(tipx + i * 2.2 - (i % 2) * 1.5), hy + s(tipy + i * 3.2));
        c.quadraticCurveTo(fx - s(6), hy - s(4), fx - s(3), hy - s(9));
        c.closePath();
        c.fill();
        c.strokeStyle = '#6a7a9a';
        c.lineWidth = s(0.6);
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          c.moveTo(fx - s(4), hy - s(8));
          c.lineTo(fx + s(tipx + 1 + i * 2.2 - (i % 2) * 1.5), hy + s(tipy + 1.5 + i * 3.2));
        }
        c.stroke();
      };
      if (winged) wing(-15, -20, true);
      c.fillStyle = dgrad(c, fx - s(11), hy - s(16), fx + s(11), hy - s(2), metal);
      c.beginPath();
      c.moveTo(fx - s(11.2), hy - s(3));
      c.quadraticCurveTo(fx - s(11.5), hy - s(11.5), fx - s(2.5), hy - s(15));
      c.lineTo(fx - s(0.5), hy - s(15.8));
      c.quadraticCurveTo(fx + s(9.5), hy - s(13), fx + s(10.8), hy - s(3));
      c.closePath();
      c.fill();
      // Frame bands with rivets.
      line(c, fx - s(1.2), hy - s(15.2), fx - s(0.5), hy - s(3.5), s(1.8), band);
      line(c, fx - s(7.5), hy - s(12.5), fx - s(9), hy - s(3.5), s(1.4), band);
      rr(c, fx - s(11.8), hy - s(5), s(23), s(2.8), s(1.3), band);
      rivets(
        [
          [-0.9, -12],
          [-0.7, -8],
          [-8, -9.5],
          [-8, -4],
          [-4, -3.6],
          [4, -3.6],
          [9, -3.6],
        ],
        shade(band, 1.35),
      );
      // Nasal guard; heroes get a spectacle guard around the eye too.
      rr(
        c,
        fx + s(8.3),
        hy - s(4),
        s(2.6),
        s(8.5),
        s(1.2),
        dgrad(c, fx + s(8), hy, fx + s(11), hy + s(4), band),
      );
      if (hero) {
        c.strokeStyle = band;
        c.lineWidth = s(1.3);
        c.beginPath();
        c.arc(fx + s(5.6), hy - s(0.8), s(3), Math.PI * 0.9, Math.PI * 2.1);
        c.stroke();
      }
      line(c, fx - s(6), hy - s(11.5), fx + s(1), hy - s(13.8), s(1.2), shade(metal, 1.45));
      if (winged) wing(-21, -14, false);
      else if (helm === 'horned') {
        // Gilded crest ridge for the herald's helm.
        line(c, fx - s(8), hy - s(12), fx + s(5), hy - s(14), s(1.6), GOLD);
      }
      break;
    }
    case 'wolfhood': {
      // Wolf pelt worn over the head: ears, snout over the brow, falling to the back.
      const fur = '#8d8a86';
      c.fillStyle = vgrad(c, hy - s(16), hy + s(14), fur);
      c.beginPath();
      c.moveTo(fx - s(13), hy + s(14));
      c.quadraticCurveTo(fx - s(15), hy - s(6), fx - s(4), hy - s(13));
      c.quadraticCurveTo(fx + s(8), hy - s(15), fx + s(12), hy - s(6));
      c.lineTo(fx + s(15), hy - s(3));
      c.lineTo(fx + s(7), hy - s(4));
      c.quadraticCurveTo(fx - s(4), hy - s(4), fx - s(8), hy + s(6));
      c.closePath();
      c.fill();
      // Fangs along the brow, muzzle, ears, eye and fur strands.
      c.fillStyle = '#f2ece0';
      c.beginPath();
      for (const x of [9.5, 12.5]) {
        c.moveTo(fx + s(x), hy - s(4));
        c.lineTo(fx + s(x + 0.8), hy - s(1.6));
        c.lineTo(fx + s(x + 1.6), hy - s(4));
      }
      c.fill();
      oval(c, fx + s(14.5), hy - s(4.2), s(1.8), s(1.4), '#1a1410');
      for (const [x, col] of [
        [-6, shade(fur, 0.55)],
        [-2, shade(fur, 0.7)],
      ] as const) {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(fx + s(x - 1.5), hy - s(12));
        c.lineTo(fx + s(x + 1), hy - s(20));
        c.lineTo(fx + s(x + 4), hy - s(12.5));
        c.fill();
      }
      disc(c, fx + s(6), hy - s(9), s(1.2), '#ffd84a');
      c.strokeStyle = shade(fur, 0.6);
      c.lineWidth = s(0.8);
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        c.moveTo(fx - s(12) + i * s(1.2), hy - s(4) + i * s(3));
        c.lineTo(fx - s(9) + i * s(1.2), hy - s(1.5) + i * s(3));
      }
      c.moveTo(fx - s(2), hy - s(11));
      c.lineTo(fx + s(4), hy - s(12));
      c.moveTo(fx + s(1), hy - s(9));
      c.lineTo(fx + s(8), hy - s(9.5));
      c.stroke();
      line(c, fx - s(6), hy - s(13), fx + s(5), hy - s(14.5), s(1), shade(fur, 1.35));
      break;
    }
    case 'crested':
    case 'plumed': {
      // Corinthian helmet: a bronze shell covering the face, almond eye slot, nose guard and
      // cheek pieces, a flared neck guard and a horsehair crest on a stilt.
      const plume = helm === 'crested' ? team : hero ? '#f3e6c4' : (def.art.accent ?? '#b0473a');
      const plumed = helm === 'plumed';
      c.fillStyle = vgrad(c, hy - (plumed ? s(33) : s(27)), hy - s(8), plume);
      c.beginPath();
      if (plumed) {
        c.moveTo(fx + s(5), hy - s(16));
        c.quadraticCurveTo(fx + s(1), hy - s(25.5), fx - s(13), hy - s(22.5));
        c.quadraticCurveTo(fx - s(23), hy - s(17), fx - s(20), hy + s(2));
        c.quadraticCurveTo(fx - s(17), hy - s(14), fx - s(5), hy - s(16));
      } else {
        c.moveTo(fx + s(6), hy - s(15));
        c.quadraticCurveTo(fx, hy - s(25), fx - s(11), hy - s(21));
        c.quadraticCurveTo(fx - s(18), hy - s(17), fx - s(17), hy - s(6));
        c.quadraticCurveTo(fx - s(14), hy - s(14), fx - s(6), hy - s(16));
      }
      c.closePath();
      c.fill();
      c.strokeStyle = shade(plume, 0.72);
      c.lineWidth = s(0.7);
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.15 + i * 0.13);
        c.moveTo(fx - s(3) + Math.cos(a) * s(8), hy - s(15) + Math.sin(a) * s(5));
        c.lineTo(fx - s(3) + Math.cos(a) * s(15), hy - s(15) + Math.sin(a) * s(7.5));
      }
      c.stroke();
      c.fillStyle = dgrad(c, fx - s(12), hy - s(16), fx + s(12), hy + s(10), metal);
      c.beginPath();
      c.moveTo(fx - s(12.5), hy + s(7));
      c.quadraticCurveTo(fx - s(13), hy - s(4), fx - s(8), hy - s(10.5));
      c.quadraticCurveTo(fx - s(1), hy - s(16), fx + s(6), hy - s(12));
      c.quadraticCurveTo(fx + s(11), hy - s(9), fx + s(11.2), hy - s(2));
      c.lineTo(fx + s(11.6), hy + s(3.6));
      c.lineTo(fx + s(9.6), hy + s(4));
      c.lineTo(fx + s(8.6), hy + s(3));
      c.lineTo(fx + s(8.4), hy + s(4.6));
      c.lineTo(fx + s(10), hy + s(6));
      c.quadraticCurveTo(fx + s(9.6), hy + s(10.5), fx + s(5), hy + s(11));
      c.quadraticCurveTo(fx, hy + s(8.5), fx - s(4), hy + s(8));
      c.quadraticCurveTo(fx - s(7), hy + s(5), fx - s(8), hy + s(7));
      c.closePath();
      c.fill();
      // Eye slot with a glint, brow carination, rim, crest holder.
      c.fillStyle = '#1a120c';
      c.beginPath();
      c.moveTo(fx + s(2.8), hy - s(1.5));
      c.quadraticCurveTo(fx + s(7), hy - s(3.2), fx + s(10), hy - s(1.2));
      c.quadraticCurveTo(fx + s(7), hy + s(0.8), fx + s(2.8), hy - s(1.5));
      c.fill();
      disc(c, fx + s(7), hy - s(1.4), s(0.6), '#fff4d8');
      // T-shaped gap between the nose guard and the cheek pieces.
      c.fillStyle = '#1a120c';
      c.beginPath();
      c.moveTo(fx + s(11.6), hy + s(3.8));
      c.lineTo(fx + s(9.4), hy + s(4.1));
      c.lineTo(fx + s(8.8), hy + s(2.6));
      c.lineTo(fx + s(8.2), hy + s(4.4));
      c.lineTo(fx + s(10.4), hy + s(6.4));
      c.lineTo(fx + s(11.8), hy + s(6.2));
      c.closePath();
      c.fill();
      c.strokeStyle = shade(metal, 0.62);
      c.lineWidth = s(1);
      c.beginPath();
      c.moveTo(fx - s(10.5), hy - s(3.5));
      c.quadraticCurveTo(fx, hy - s(6.5), fx + s(10.8), hy - s(4));
      c.moveTo(fx - s(3.5), hy + s(8));
      c.quadraticCurveTo(fx - s(1.5), hy + s(1), fx - s(5), hy - s(2));
      c.stroke();
      line(c, fx - s(5), hy - s(11.5), fx + s(3), hy - s(13), s(1.5), shade(metal, 1.5));
      rr(c, fx - s(2.5), hy - s(18), s(3), s(4), s(1), shade(metal, 0.8));
      break;
    }
    case 'nemes':
    case 'crown': {
      // Striped headcloth with lappets in front of the shoulders and a queue at the back.
      const blue = '#2f5fa0';
      const stripe = GOLD;
      c.save();
      c.beginPath();
      c.moveTo(fx + s(8.5), hy - s(5));
      c.quadraticCurveTo(fx + s(5), hy - s(14), fx - s(3), hy - s(13.5));
      c.quadraticCurveTo(fx - s(12.5), hy - s(12), fx - s(12.5), hy - s(2));
      c.lineTo(fx - s(15), hy + s(11));
      c.lineTo(fx - s(9), hy + s(11));
      c.lineTo(fx - s(7), hy + s(3));
      c.lineTo(fx - s(6.5), hy + s(15));
      c.lineTo(fx + s(0.5), hy + s(15));
      c.lineTo(fx - s(1), hy - s(2));
      c.quadraticCurveTo(fx + s(2), hy - s(4.5), fx + s(8.5), hy - s(5));
      c.closePath();
      c.fillStyle = vgrad(c, hy - s(14), hy + s(15), blue);
      c.fill();
      c.clip();
      c.strokeStyle = stripe;
      c.lineWidth = s(1.2);
      c.beginPath();
      for (let y = hy - s(12); y < hy + s(16); y += s(2.6)) {
        c.moveTo(fx - s(16), y + s(1.5));
        c.lineTo(fx + s(10), y - s(1.5));
      }
      c.stroke();
      c.restore();
      rr(c, fx - s(10), hy - s(6), s(19), s(2.2), s(1), GOLD);
      if (helm === 'crown') {
        c.fillStyle = dgrad(c, fx - s(8), hy - s(28), fx + s(8), hy - s(10), GOLD);
        c.beginPath();
        c.moveTo(fx - s(8), hy - s(11));
        c.lineTo(fx - s(5), hy - s(24));
        c.quadraticCurveTo(fx, hy - s(27), fx + s(5), hy - s(24));
        c.lineTo(fx + s(8), hy - s(11));
        c.closePath();
        c.fill();
        line(c, fx - s(6), hy - s(15), fx + s(6.5), hy - s(15), s(1.2), shade(GOLD, 0.7));
        disc(c, fx, hy - s(19), s(2.6), blue);
        disc(c, fx, hy - s(19), s(1.2), '#7fd0ff');
      }
      // Uraeus cobra on the brow.
      c.strokeStyle = GOLD;
      c.lineWidth = s(1.5);
      c.beginPath();
      c.moveTo(fx + s(6), hy - s(6));
      c.quadraticCurveTo(fx + s(10), hy - s(8), fx + s(8.5), hy - s(11));
      c.stroke();
      disc(c, fx + s(8.5), hy - s(11), s(1.4), GOLD);
      disc(c, fx + s(8.8), hy - s(11), s(0.5), '#c0302a');
      break;
    }
  }
}

/** Arm from shoulder to hand: skin, sleeve, bracer and armlet. */
function armLimb(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  s: (v: number) => number,
  skin: string,
  g: Garb,
  far: boolean,
): void {
  const tone = (col: string): string => (far ? shade(col, 0.82) : col);
  const at = (t: number): [number, number] => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  const w = s(6);
  inked(c, x0, y0, x1, y1, w, tone(skin));
  if (g.sleeve) {
    const [sx, sy] = at(g.sleeveTo);
    line(c, x0, y0, sx, sy, w + s(0.8), tone(g.sleeve));
    if (g.sleeve === STEEL) {
      const [mx, my] = at(g.sleeveTo * 0.5);
      disc(c, mx, my, s(1), shade(STEEL, 0.6));
    }
    const [ex, ey] = at(Math.max(0, g.sleeveTo - 0.06));
    line(c, ex, ey, sx, sy, w + s(0.9), tone(shade(g.sleeve, 0.72)));
  }
  if (g.armlet) {
    const [ax, ay] = at(0.32);
    const [bx, by] = at(0.4);
    line(c, ax, ay, bx, by, w + s(0.6), tone(g.armlet));
  }
  if (g.bracer) {
    const [ax, ay] = at(0.62);
    const [bx, by] = at(0.9);
    line(c, ax, ay, bx, by, w + s(0.7), tone(g.bracer));
    wraps(c, ax, ay, bx, by, 3, w * 0.55, tone(shade(g.bracer, 0.6)));
  }
}

/** Hand gripping something: fist (or glove) with a knuckle line and thumb. */
function fist(c: Ctx, hx: number, hy: number, s: (v: number) => number, col: string): void {
  disc(c, hx, hy, s(3.7), INK);
  disc(c, hx, hy, s(3.3), rgrad(c, hx, hy, s(3.3), col));
  c.strokeStyle = shade(col, 0.62);
  c.lineWidth = s(0.7);
  c.beginPath();
  c.arc(hx + s(0.6), hy + s(0.2), s(2.2), -1.1, 1.3);
  c.stroke();
  oval(c, hx - s(0.6), hy - s(1.8), s(1.5), s(1.1), shade(col, 1.15), -0.5);
}

/** A leg (thigh to foot) pivoting at the hip by `ang` radians, dressed by faction. */
function leg(
  c: Ctx,
  x: number,
  y: number,
  ang: number,
  s: (v: number) => number,
  look: Look,
  d: Detail,
  f: FactionId,
  g: Garb,
  far: boolean,
): void {
  const tone = (col: string): string => (far ? shade(col, 0.84) : col);
  c.save();
  c.translate(x, y);
  c.rotate(-ang);
  const skin = SKIN[f];
  if (f === 'hrimfolk') {
    // Wool trousers, winingas leg wraps with a garter and a leather turnshoe.
    const wrap = mix(g.pants, '#e2d4b4', 0.55);
    rr(c, -s(4), -s(1), s(8), s(18.5), s(3.4), vgrad(c, 0, s(18), tone(g.pants)));
    rr(c, -s(4), s(8.5), s(8), s(9), s(2.2), vgrad(c, s(8.5), s(17.5), tone(wrap)));
    c.strokeStyle = tone(shade(wrap, 0.6));
    c.lineWidth = s(0.7);
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      c.moveTo(-s(3.8), s(9.5) + i * s(2.1));
      c.lineTo(s(3.8), s(11.3) + i * s(2.1));
    }
    c.stroke();
    line(c, -s(4.2), s(8.8), s(4.2), s(8.8), s(1.1), tone(LEATHER));
    c.fillStyle = vgrad(c, s(16), s(22.5), tone('#4a3626'));
    c.beginPath();
    c.moveTo(-s(4.4), s(16.5));
    c.lineTo(s(3.2), s(16.5));
    c.quadraticCurveTo(s(7.8), s(17.5), s(7.8), s(22));
    c.lineTo(-s(4.4), s(22));
    c.closePath();
    c.fill();
    line(c, -s(4.2), s(22), s(7.6), s(22), s(0.9), tone('#2a1c12'));
  } else {
    // Bare leg with knee shading; greaves for armoured hoplites; sandals laced up the ankle.
    rr(c, -s(3.6), -s(1), s(7.2), s(20), s(3.2), vgrad(c, 0, s(19), tone(skin)));
    oval(c, s(0.6), s(8.5), s(2.4), s(1.6), tone(shade(skin, 0.86)));
    const greave =
      f === 'aurelian' && (look.armor === 'plate' || look.armor === 'scale' || d.linothorax);
    if (greave) {
      const m = tone(BRONZE);
      c.fillStyle = dgrad(c, -s(4), s(7), s(4), s(18), m);
      c.beginPath();
      c.moveTo(-s(3.6), s(7.5));
      c.quadraticCurveTo(s(1), s(5.5), s(4.4), s(8));
      c.quadraticCurveTo(s(3.4), s(12), s(4), s(18.2));
      c.lineTo(-s(3.8), s(18.2));
      c.quadraticCurveTo(-s(4.4), s(12), -s(3.6), s(7.5));
      c.closePath();
      c.fill();
      oval(c, s(1.2), s(8.4), s(2), s(1.4), shade(m, 1.25));
      line(c, s(2.6), s(11), s(2.6), s(17), s(0.8), shade(m, 1.4));
    } else {
      c.strokeStyle = tone(LEATHER);
      c.lineWidth = s(0.9);
      c.beginPath();
      c.moveTo(-s(3.4), s(14));
      c.lineTo(s(3.4), s(16.5));
      c.moveTo(s(3.4), s(14));
      c.lineTo(-s(3.4), s(16.5));
      c.stroke();
    }
    if (f === 'sahrun' && !far) line(c, -s(3.4), s(17.2), s(3.4), s(17.2), s(1), GOLD);
    // Foot and sandal sole.
    c.fillStyle = vgrad(c, s(17), s(21), tone(skin));
    c.beginPath();
    c.moveTo(-s(3.6), s(17.5));
    c.lineTo(s(2.5), s(17.5));
    c.quadraticCurveTo(s(7.5), s(18.5), s(7.5), s(20.6));
    c.lineTo(-s(3.6), s(20.6));
    c.closePath();
    c.fill();
    rr(c, -s(4.2), s(20.3), s(12.4), s(2.2), s(1), tone(f === 'sahrun' ? '#c8a868' : LEATHER));
    line(c, -s(1), s(18), s(3.5), s(20.4), s(0.8), tone(LEATHER));
  }
  c.restore();
}

/** Torso outline shared by the clothing layers. */
function torsoPath(c: Ctx, fx: number, fy: number, s: (v: number) => number): void {
  c.beginPath();
  c.moveTo(fx - s(13), fy - s(20));
  c.lineTo(fx - s(12), fy - s(46));
  c.quadraticCurveTo(fx, fy - s(54), fx + s(12), fy - s(46));
  c.lineTo(fx + s(13), fy - s(20));
  c.closePath();
}

/** Bare chest shading: pectoral and abdominal lines. */
function chest(c: Ctx, fx: number, fy: number, s: (v: number) => number, col: string): void {
  c.strokeStyle = shade(col, 0.7);
  c.lineWidth = s(0.9);
  c.beginPath();
  c.moveTo(fx - s(7), fy - s(40));
  c.quadraticCurveTo(fx + s(2), fy - s(35), fx + s(10), fy - s(40));
  c.moveTo(fx + s(3), fy - s(33));
  c.lineTo(fx + s(3), fy - s(26));
  c.moveTo(fx - s(2), fy - s(30));
  c.lineTo(fx + s(8), fy - s(30));
  c.stroke();
  oval(c, fx + s(2), fy - s(45), s(5), s(2.5), 'rgba(255,240,210,0.25)');
}

/** Body clothing/armour by faction and type, with team colours. */
function torso(
  c: Ctx,
  def: UnitDef,
  look: Look,
  d: Detail,
  g: Garb,
  team: string,
  fx: number,
  fy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const worker = def.cls === 'worker';
  const hero = def.cls === 'hero';
  const metal = hero ? GOLD : f === 'aurelian' || f === 'sahrun' ? BRONZE : STEEL;
  const skin = SKIN[f];
  const L = fx - s(15);
  const R = fx + s(15);
  const top = fy - s(54);
  const bot = fy - s(19);
  const fill = (col: string | CanvasGradient): void => {
    c.fillStyle = col;
    c.fillRect(L, top, R - L, bot - top);
  };
  c.save();
  torsoPath(c, fx, fy, s);
  c.clip();
  if (f === 'hrimfolk') {
    fill(vgrad(c, top, bot, g.tunic));
    if (look.armor === 'mail') {
      fill(vgrad(c, top, bot, STEEL, 1.3, 0.62));
      rings(c, L, top + s(2), R, bot, s(1.15), s(0.65));
      // Leather edging around the neck of the byrnie.
      line(c, fx - s(7), fy - s(50), fx + s(7), fy - s(50), s(2.4), LEATHER);
    } else if (look.armor === 'leather') {
      // Quilted gambeson: padded vertical channels.
      fill(vgrad(c, top, bot, def.art.body));
      for (let x = L + s(1.5); x < R; x += s(3.6)) {
        line(c, x, top, x, bot, s(0.7), shade(def.art.body, 0.62));
        line(c, x + s(1.4), top, x + s(1.4), bot, s(0.9), shade(def.art.body, 1.18));
      }
      // Quiver baldric / sash in team colour.
      line(c, fx - s(10), fy - s(49), fx + s(10), fy - s(23), s(3.4), team);
      line(c, fx - s(10), fy - s(48.4), fx + s(10), fy - s(22.4), s(0.8), shade(team, 1.5));
    } else if (look.armor === 'fur' && !worker) {
      // Berserker: bare chest under an open fur vest, team sash.
      fill(vgrad(c, top, bot, skin));
      chest(c, fx, fy, s, skin);
      const fur = '#7d6448';
      for (const [x0, x1] of [
        [L, fx - s(4)],
        [fx + s(9), R],
      ] as const) {
        c.fillStyle = vgrad(c, top, bot, fur);
        c.fillRect(x0, top, x1 - x0, bot - top);
        c.strokeStyle = shade(fur, 1.35);
        c.lineWidth = s(0.8);
        c.beginPath();
        for (let y = top + s(3); y < bot; y += s(3)) {
          c.moveTo(x0 + s(1), y);
          c.lineTo(x1 - s(0.5), y + s(1.6));
        }
        c.stroke();
      }
      line(c, fx - s(11), fy - s(48), fx + s(11), fy - s(25), s(4), team);
    } else {
      // Peasant wool tunic with a leather apron bib.
      for (let x = L + s(3); x < R; x += s(4.5))
        line(c, x, top, x + s(1), bot, s(0.6), shade(g.tunic, 0.85));
      if (worker) {
        rr(c, fx + s(1), fy - s(41), s(12), s(20), s(2), vgrad(c, fy - s(41), bot, '#7a5230'));
        line(c, fx + s(2), fy - s(41), fx - s(3), fy - s(51), s(1.4), '#5a3a20');
        line(c, fx + s(2), fy - s(39), fx + s(12), fy - s(39), s(0.6), '#c8a070');
      }
    }
    trimBand(c, fx - s(8), fy - s(52), fx + s(8), s(2.6), team);
  } else if (f === 'aurelian') {
    fill(vgrad(c, top, bot, g.tunic));
    if (look.armor === 'cloth') {
      // Exomis: draped over one shoulder, leaving the near shoulder bare.
      c.fillStyle = vgrad(c, top, fy - s(38), skin);
      c.beginPath();
      c.moveTo(fx + s(1), top);
      c.lineTo(R, top);
      c.lineTo(R, fy - s(40));
      c.quadraticCurveTo(fx + s(6), fy - s(42), fx + s(1), top);
      c.fill();
      c.strokeStyle = shade(g.tunic, 0.72);
      c.lineWidth = s(0.8);
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        c.moveTo(fx - s(8) + i * s(3.5), fy - s(50));
        c.quadraticCurveTo(fx + i * s(3), fy - s(34), fx + s(4) + i * s(3), fy - s(22));
      }
      c.stroke();
      line(c, fx + s(1), fy - s(52), fx + s(12), fy - s(40), s(1.4), shade(g.tunic, 1.25));
    } else if (d.linothorax) {
      // Linen corselet: shoulder flaps, team key-pattern bands, bronze scale panel below.
      const lin = '#ece4d0';
      fill(vgrad(c, top, bot, lin));
      scales(c, L, fy - s(33), R, bot, s(1.9), BRONZE);
      trimBand(c, L, fy - s(35.5), R, s(2.8), team, 'key');
      line(c, L, bot - s(1), R, bot - s(1), s(1.8), team);
      line(c, fx - s(2), fy - s(48), fx - s(2), fy - s(37), s(0.6), shade(lin, 0.75));
      line(c, fx + s(5), fy - s(47), fx + s(5), fy - s(37), s(0.6), shade(lin, 0.75));
    } else if (look.armor === 'plate') {
      // Muscle cuirass: pectorals, abdominal grid, navel and sheen.
      fill(dgrad(c, L, top, R, bot, metal));
      c.strokeStyle = shade(metal, 0.6);
      c.lineWidth = s(1);
      c.beginPath();
      c.moveTo(fx - s(9), fy - s(40));
      c.quadraticCurveTo(fx - s(4), fy - s(35.5), fx + s(1), fy - s(39));
      c.quadraticCurveTo(fx + s(5), fy - s(35.5), fx + s(10), fy - s(40));
      c.moveTo(fx + s(1), fy - s(38));
      c.lineTo(fx + s(1), fy - s(24));
      c.moveTo(fx - s(5), fy - s(32));
      c.lineTo(fx + s(7), fy - s(32));
      c.moveTo(fx - s(5), fy - s(27.5));
      c.lineTo(fx + s(7), fy - s(27.5));
      c.stroke();
      disc(c, fx + s(1), fy - s(23.5), s(0.8), shade(metal, 0.55));
      oval(c, fx - s(4), fy - s(45), s(4.5), s(2.5), 'rgba(255,255,255,0.38)');
      oval(c, fx + s(6), fy - s(44), s(3), s(1.8), 'rgba(255,255,255,0.22)');
      line(c, L, fy - s(21), R, fy - s(21), s(1.6), shade(metal, 0.72));
    } else if (look.armor === 'scale') {
      fill(vgrad(c, top, bot, metal));
      scales(c, L, fy - s(48), R, bot, s(2), metal);
      trimBand(c, L, fy - s(51), R, s(2.6), team, 'key');
    } else {
      // Leather cuirass over the chiton, team baldric.
      fill(vgrad(c, top, bot, '#8a5c32'));
      for (let i = 0; i < 4; i++)
        line(c, L, fy - s(42) + i * s(6), R, fy - s(42) + i * s(6), s(0.7), '#5a3a20');
      line(c, fx - s(10), fy - s(49), fx + s(10), fy - s(23), s(3.2), team);
    }
  } else {
    // Sahrun: bare chest or a pleated robe, scale corselet for heavy troops, broad collar.
    if (look.armor === 'scale') {
      fill(vgrad(c, top, bot, metal));
      scales(c, L, fy - s(48), R, bot, s(1.9), metal);
      rr(c, fx - s(2.5), fy - s(48), s(5), s(28), s(1.2), team);
    } else if (hero) {
      fill(vgrad(c, top, bot, '#f2ead6'));
      for (let x = L + s(2); x < R; x += s(2.8))
        line(c, x, top, x - s(1), bot, s(0.6), 'rgba(140,120,80,0.45)');
      line(c, fx - s(11), fy - s(44), fx + s(11), fy - s(26), s(3.4), GOLD);
      line(c, fx - s(11), fy - s(44), fx + s(11), fy - s(26), s(1.2), team);
    } else {
      fill(vgrad(c, top, bot, skin));
      chest(c, fx, fy, s, skin);
      if (!worker) {
        // Crossed linen straps in team colour.
        line(c, fx - s(10), fy - s(47), fx + s(10), fy - s(24), s(2.6), team);
        line(c, fx + s(9), fy - s(47), fx - s(9), fy - s(24), s(2.6), shade(team, 0.8));
        disc(c, fx + s(0.5), fy - s(35.5), s(1.6), GOLD);
      }
    }
    const ring = (r: number, col: string, w: number): void => {
      c.strokeStyle = col;
      c.lineWidth = s(w);
      c.beginPath();
      c.arc(fx, fy - s(52), s(r), Math.PI * 0.12, Math.PI * 0.88);
      c.stroke();
    };
    ring(5.5, GOLD, 2.2);
    ring(7.8, '#3aa8a0', 2);
    if (!worker) {
      ring(10, team, 2);
      ring(12, GOLD, 1.6);
      c.setLineDash([s(0.6), s(1.4)]);
      ring(7.8, '#f2ead6', 0.8);
      c.setLineDash([]);
    }
  }
  c.restore();
  // Shoulder guards for armoured troops.
  if (look.armor === 'mail' || look.armor === 'scale' || look.armor === 'plate') {
    const m = look.armor === 'mail' ? STEEL : metal;
    oval(
      c,
      fx - s(10),
      fy - s(46),
      s(5.5),
      s(4.2),
      dgrad(c, fx - s(15), fy - s(50), fx - s(5), fy - s(42), m),
    );
    if (look.armor === 'mail')
      rings(c, fx - s(14), fy - s(48), fx - s(6), fy - s(43), s(1), s(0.6));
    else line(c, fx - s(14), fy - s(44), fx - s(6), fy - s(43), s(0.8), shade(m, 0.6));
  } else if (d.linothorax) {
    rr(c, fx - s(13), fy - s(50), s(14), s(5), s(2), vgrad(c, fy - s(50), fy - s(45), '#e2d8c0'));
    disc(c, fx - s(1), fy - s(47.5), s(1.1), BRONZE);
  } else if (look.armor === 'fur') {
    oval(c, fx - s(9), fy - s(47), s(6), s(4), vgrad(c, fy - s(51), fy - s(43), '#c8b48c'));
  }
}

/** Belt with buckle and what hangs from it (pouch, seax, tools, sash ends). */
function belt(
  c: Ctx,
  def: UnitDef,
  look: Look,
  fx: number,
  fy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const worker = def.cls === 'worker';
  const hero = def.cls === 'hero';
  if (f === 'sahrun') {
    // Knotted linen sash (gold-studded leather for soldiers).
    const col = worker ? '#e8dcc0' : LEATHER;
    rr(c, fx - s(13), fy - s(26), s(26), s(3.6), s(1.6), vgrad(c, fy - s(26), fy - s(22.4), col));
    if (worker) {
      line(c, fx + s(8), fy - s(24), fx + s(10), fy - s(16), s(1.6), shade(col, 0.85));
      line(c, fx + s(9), fy - s(24), fx + s(12.5), fy - s(17), s(1.6), col);
    } else for (let i = 0; i < 4; i++) disc(c, fx - s(9) + i * s(5.5), fy - s(24.2), s(0.8), GOLD);
    rr(c, fx - s(2), fy - s(26.5), s(4), s(4.6), s(1), GOLD);
    return;
  }
  if (f === 'aurelian' && look.armor === 'cloth') {
    // Twisted rope girdle.
    line(c, fx - s(13), fy - s(24.5), fx + s(13), fy - s(24.5), s(2.2), '#c8b080');
    c.setLineDash([s(1), s(1.2)]);
    line(c, fx - s(13), fy - s(24.5), fx + s(13), fy - s(24.5), s(1), '#8a7448');
    c.setLineDash([]);
    if (worker)
      rr(c, fx - s(11), fy - s(24), s(5), s(6), s(1.6), vgrad(c, fy - s(24), fy - s(18), LEATHER));
    return;
  }
  rr(c, fx - s(13), fy - s(26), s(26), s(4), s(2), vgrad(c, fy - s(26), fy - s(22), LEATHER));
  if (f === 'aurelian') {
    for (let i = 0; i < 5; i++) disc(c, fx - s(10) + i * s(5), fy - s(24), s(0.9), BRONZE);
    return;
  }
  // Norse: round bronze buckle with a hanging strap end, pouch at the hip.
  rr(
    c,
    fx - s(11.5),
    fy - s(24.5),
    s(5.5),
    s(6.5),
    s(1.8),
    vgrad(c, fy - s(24.5), fy - s(18), '#8a6440'),
  );
  line(c, fx - s(11.5), fy - s(22.5), fx - s(6), fy - s(22.5), s(0.6), '#5a3a20');
  disc(c, fx + s(3), fy - s(24), s(2.6), hero ? GOLD : BRONZE);
  disc(c, fx + s(3), fy - s(24), s(1.2), shade(LEATHER, 0.8));
  line(c, fx + s(4.5), fy - s(23), fx + s(5.5), fy - s(17), s(1.6), LEATHER);
  disc(c, fx + s(5.5), fy - s(16.6), s(0.9), hero ? GOLD : BRONZE);
  if (worker) {
    // Tool belt: a small hammer at the back hip.
    line(c, fx - s(4), fy - s(23), fx - s(5), fy - s(15), s(1.4), WOOD);
    rr(c, fx - s(7.5), fy - s(16.5), s(5), s(2.6), s(0.8), STEEL);
  } else {
    // Seax worn horizontally across the belly, antler grip to the back.
    rr(
      c,
      fx - s(4),
      fy - s(22.4),
      s(15),
      s(3.2),
      s(1.5),
      vgrad(c, fy - s(22.4), fy - s(19), '#4a3020'),
    );
    disc(c, fx + s(10.4), fy - s(20.8), s(1.2), BRONZE);
    line(c, fx - s(4), fy - s(20.8), fx - s(9.5), fy - s(20.8), s(2.2), '#d8c8a0');
    wraps(c, fx - s(9.5), fy - s(20.8), fx - s(4), fy - s(20.8), 3, s(1.2), '#8a7448');
  }
}

/** Skirt below the belt: tunic hem with trim, mail skirt, pteruges or a pleated kilt. */
function kilt(
  c: Ctx,
  def: UnitDef,
  look: Look,
  d: Detail,
  g: Garb,
  team: string,
  fx: number,
  fy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const worker = def.cls === 'worker';
  const skirt = (bottom: number, flare: number, col: string): void => {
    c.beginPath();
    c.moveTo(fx - s(12.5), fy - s(25));
    c.lineTo(fx + s(12.5), fy - s(25));
    c.lineTo(fx + s(12.5 + flare), fy - s(bottom + 1.5));
    c.quadraticCurveTo(fx, fy - s(bottom - 1), fx - s(12.5 + flare), fy - s(bottom + 1.5));
    c.closePath();
    c.fillStyle = vgrad(c, fy - s(25), fy - s(bottom), col);
    c.fill();
  };
  if (f === 'hrimfolk') {
    skirt(12.5, 2, shade(g.tunic, 0.92));
    c.save();
    c.clip();
    c.strokeStyle = shade(g.tunic, 0.7);
    c.lineWidth = s(0.7);
    c.beginPath();
    for (let i = -1; i <= 1; i++) {
      c.moveTo(fx + i * s(6), fy - s(23));
      c.lineTo(fx + i * s(7.5), fy - s(14));
    }
    c.stroke();
    trimBand(c, fx - s(16), fy - s(15.5), fx + s(16), s(5), team);
    c.restore();
    if (look.armor === 'mail') {
      c.beginPath();
      c.moveTo(fx - s(13), fy - s(25));
      c.lineTo(fx + s(13), fy - s(25));
      c.lineTo(fx + s(14), fy - s(17));
      c.lineTo(fx - s(14), fy - s(17));
      c.closePath();
      c.fillStyle = vgrad(c, fy - s(25), fy - s(17), STEEL, 1.1, 0.6);
      c.fill();
      rings(c, fx - s(14), fy - s(24), fx + s(14), fy - s(17), s(1.15), s(0.65));
      line(c, fx - s(14), fy - s(17), fx + s(14), fy - s(17), s(1), shade(STEEL, 0.55));
    }
    if (worker) {
      c.fillStyle = vgrad(c, fy - s(25), fy - s(12), '#7a5230');
      c.beginPath();
      c.moveTo(fx + s(1), fy - s(25));
      c.lineTo(fx + s(12.5), fy - s(25));
      c.lineTo(fx + s(14), fy - s(12));
      c.lineTo(fx + s(2), fy - s(12));
      c.closePath();
      c.fill();
      c.setLineDash([s(0.8), s(1)]);
      line(c, fx + s(2.5), fy - s(13.5), fx + s(13), fy - s(13.5), s(0.5), '#c8a070');
      c.setLineDash([]);
    }
  } else if (f === 'aurelian') {
    skirt(13.5, 1.5, shade(g.tunic, 0.95));
    c.save();
    c.clip();
    c.strokeStyle = shade(g.tunic, 0.72);
    c.lineWidth = s(0.6);
    c.beginPath();
    for (let i = -2; i <= 2; i++) {
      c.moveTo(fx + i * s(4.5), fy - s(23));
      c.lineTo(fx + i * s(5), fy - s(13));
    }
    c.stroke();
    trimBand(c, fx - s(15), fy - s(16.5), fx + s(15), s(5), shade(g.tunic, 0.55), 'key', '#f3e6c4');
    c.restore();
    if (look.armor === 'plate' || look.armor === 'scale' || d.linothorax) {
      // Pteruges: leather strips with a fringe.
      for (let i = 0; i < 7; i++) {
        const x = fx - s(12.6) + i * s(3.6);
        rr(
          c,
          x,
          fy - s(23),
          s(3.3),
          s(9),
          s(1),
          vgrad(c, fy - s(23), fy - s(14), i % 2 ? team : '#e8dcc0'),
        );
        line(
          c,
          x + s(0.6),
          fy - s(13.6),
          x + s(2.7),
          fy - s(13.6),
          s(1.1),
          shade(i % 2 ? team : '#e8dcc0', 0.7),
        );
      }
    }
  } else {
    // Pleated shendyt with a team front panel; the hero wears it ankle-long.
    const long = def.cls === 'hero';
    const bottom = long ? 6 : 12;
    c.beginPath();
    c.moveTo(fx - s(12), fy - s(25));
    c.lineTo(fx + s(12), fy - s(25));
    c.lineTo(fx + s(14), fy - s(bottom));
    c.lineTo(fx - s(13), fy - s(bottom + 1));
    c.closePath();
    c.fillStyle = vgrad(c, fy - s(25), fy - s(bottom), '#f2ead6');
    if (long) c.globalAlpha = 0.92;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(140,120,80,0.5)';
    c.lineWidth = s(0.6);
    c.beginPath();
    for (let i = 0; i < 7; i++) {
      c.moveTo(fx - s(10) + i * s(3.5), fy - s(24));
      c.lineTo(fx - s(11) + i * s(4.1), fy - s(bottom + 0.5));
    }
    c.stroke();
    c.fillStyle = vgrad(c, fy - s(25), fy - s(bottom), team);
    c.beginPath();
    c.moveTo(fx + s(1.5), fy - s(25));
    c.lineTo(fx + s(8), fy - s(25));
    c.lineTo(fx + s(7), fy - s(bottom - 0.5));
    c.lineTo(fx + s(2.5), fy - s(bottom - 0.5));
    c.closePath();
    c.fill();
    for (let i = 0; i < 3; i++)
      line(
        c,
        fx + s(2.4),
        fy - s(21) + i * s(3.5),
        fx + s(7.4),
        fy - s(21) + i * s(3.5),
        s(0.7),
        GOLD,
      );
  }
}

/** Shield on the off-hand side, painted per faction and unit. */
function shieldArt(
  c: Ctx,
  kind: ShieldKind,
  def: UnitDef,
  d: Detail,
  team: string,
  sx: number,
  sy: number,
  s: (v: number) => number,
): void {
  const hero = def.cls === 'hero';
  const light = '#efe2c4';
  const sahrun = def.faction === 'sahrun';
  switch (kind) {
    case 'round': {
      // Linden planks painted with a blazon, rawhide rim, iron boss with grip rivets.
      const R = s(10.6);
      disc(c, sx, sy, s(12.2), hero ? dgrad(c, sx - R, sy - R, sx + R, sy + R, GOLD) : '#5a4030');
      c.save();
      c.beginPath();
      c.arc(sx, sy, R, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = rgrad(c, sx, sy, R, team);
      c.fillRect(sx - R, sy - R, R * 2, R * 2);
      c.fillStyle = light;
      c.beginPath();
      switch (d.emblem) {
        case 'quarter':
          c.rect(sx, sy - R, R, R);
          c.rect(sx - R, sy, R, R);
          break;
        case 'halves':
          c.rect(sx - R, sy, R * 2, R);
          break;
        case 'cross':
          c.rect(sx - s(2), sy - R, s(4), R * 2);
          c.rect(sx - R, sy - s(2), R * 2, s(4));
          break;
        case 'spiral':
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            c.moveTo(sx, sy);
            c.quadraticCurveTo(
              sx + Math.cos(a) * R * 0.9,
              sy + Math.sin(a) * R * 0.9,
              sx + Math.cos(a + 1.3) * R,
              sy + Math.sin(a + 1.3) * R,
            );
            c.lineTo(sx + Math.cos(a + 0.9) * R, sy + Math.sin(a + 0.9) * R);
            c.quadraticCurveTo(
              sx + Math.cos(a + 0.3) * R * 0.5,
              sy + Math.sin(a + 0.3) * R * 0.5,
              sx,
              sy,
            );
          }
          break;
        default:
          c.arc(sx, sy, R, 0, Math.PI * 2);
          c.arc(sx, sy, R - s(1.8), 0, Math.PI * 2, true);
      }
      c.fill();
      // Shade the light paint a little so the field still reads as team colour.
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fill();
      c.strokeStyle = 'rgba(40,24,12,0.25)';
      c.lineWidth = s(0.5);
      c.beginPath();
      for (let i = -2; i <= 2; i++) {
        c.moveTo(sx + i * s(4.2), sy - R);
        c.lineTo(sx + i * s(4.2), sy + R);
      }
      c.stroke();
      c.restore();
      c.setLineDash([s(0.8), s(1.6)]);
      c.strokeStyle = hero ? shade(GOLD, 0.6) : '#a08060';
      c.lineWidth = s(0.6);
      c.beginPath();
      c.arc(sx, sy, s(11.4), 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      disc(c, sx, sy, s(4), shade(STEEL, 0.5));
      disc(c, sx, sy, s(3.4), rgrad(c, sx, sy, s(3.4), hero ? GOLD : STEEL));
      disc(c, sx - s(1), sy - s(1.2), s(0.9), 'rgba(255,255,255,0.8)');
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        disc(c, sx + Math.cos(a) * s(5.2), sy + Math.sin(a) * s(5.2), s(0.7), shade(STEEL, 0.8));
      }
      break;
    }
    case 'hoplon': {
      // Bronze-rimmed aspis with a painted blazon on a team field.
      const R = s(11.3);
      disc(c, sx, sy, s(14), dgrad(c, sx - s(14), sy - s(14), sx + s(14), sy + s(14), BRONZE));
      c.strokeStyle = shade(BRONZE, 0.65);
      c.lineWidth = s(0.6);
      c.beginPath();
      c.arc(sx, sy, s(12.6), 0, Math.PI * 2);
      c.stroke();
      disc(c, sx, sy, R, rgrad(c, sx, sy, R, team));
      const em = shade(team, 1.75);
      c.strokeStyle = em;
      c.fillStyle = em;
      if (d.emblem === 'gorgon') {
        // Gorgoneion: a face ringed by snaking locks.
        c.lineWidth = s(1.2);
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          c.moveTo(sx + Math.cos(a) * s(4.5), sy + Math.sin(a) * s(4.5));
          c.quadraticCurveTo(
            sx + Math.cos(a + 0.35) * s(7),
            sy + Math.sin(a + 0.35) * s(7),
            sx + Math.cos(a) * s(9),
            sy + Math.sin(a) * s(9),
          );
        }
        c.stroke();
        disc(c, sx, sy, s(4.2), GOLD);
        disc(c, sx - s(1.4), sy - s(0.8), s(0.7), '#2a1a10');
        disc(c, sx + s(1.4), sy - s(0.8), s(0.7), '#2a1a10');
        line(c, sx - s(1.4), sy + s(1.8), sx + s(1.4), sy + s(1.8), s(0.7), '#7a2a1a');
      } else {
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r0 = s(4.2);
          const r1 = s(i % 2 ? 7 : 9);
          c.moveTo(sx + Math.cos(a - 0.12) * r0, sy + Math.sin(a - 0.12) * r0);
          c.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
          c.lineTo(sx + Math.cos(a + 0.12) * r0, sy + Math.sin(a + 0.12) * r0);
        }
        c.fill();
        disc(c, sx, sy, s(3.2), em);
        disc(c, sx, sy, s(1.6), shade(team, 0.8));
      }
      oval(c, sx - s(5), sy - s(7), s(4), s(2.2), 'rgba(255,255,255,0.25)', -0.6);
      break;
    }
    case 'tower':
    case 'oval':
      if (sahrun) {
        // Egyptian round-topped hide shield: team-dyed cowhide, light patches, bronze boss.
        const h = kind === 'tower' ? 17 : 13.5;
        const w = kind === 'tower' ? 9 : 8.5;
        c.beginPath();
        c.moveTo(sx - s(w), sy + s(h));
        c.lineTo(sx - s(w), sy - s(h - w));
        c.arc(sx, sy - s(h - w), s(w), Math.PI, 0);
        c.lineTo(sx + s(w), sy + s(h));
        c.closePath();
        c.fillStyle = '#5a3a20';
        c.fill();
        c.save();
        c.clip();
        const iw = w - 1.6;
        rr(
          c,
          sx - s(iw),
          sy - s(h - 1.6),
          s(iw * 2),
          s(h * 2 - 3.2),
          s(iw),
          vgrad(c, sy - s(h), sy + s(h), team),
        );
        for (const [x, y, rx, ry] of [
          [-3, -6, 3, 2.4],
          [4, 1, 2.6, 3.2],
          [-2, 8, 3.4, 2.2],
          [3, -12, 2, 1.6],
        ] as const)
          oval(c, sx + s(x), sy + s(y), s(rx), s(ry), 'rgba(245,234,210,0.75)', 0.4);
        c.restore();
        disc(c, sx, sy - s(h - w) + s(1), s(2), rgrad(c, sx, sy - s(h - w), s(2), GOLD));
        break;
      }
      if (kind === 'oval') {
        // Thureos: oval with a central spine and boss, light painted border.
        oval(c, sx, sy, s(9.2), s(14), shade(team, 0.5));
        oval(c, sx, sy, s(7.8), s(12.6), light);
        oval(c, sx, sy, s(6.6), s(11.4), vgrad(c, sy - s(12), sy + s(12), team));
        line(c, sx, sy - s(11), sx, sy + s(11), s(2), shade(team, 0.7));
        oval(c, sx, sy, s(2.4), s(3.4), rgrad(c, sx, sy, s(3), BRONZE));
      } else {
        rr(
          c,
          sx - s(9),
          sy - s(18),
          s(18),
          s(34),
          s(6),
          dgrad(c, sx - s(9), sy - s(18), sx + s(9), sy + s(16), shade(team, 0.6)),
        );
        rr(c, sx - s(7), sy - s(16), s(14), s(30), s(5), vgrad(c, sy - s(16), sy + s(14), team));
        line(c, sx, sy - s(15), sx, sy + s(13), s(2), GOLD);
      }
      break;
    case 'none':
      break;
  }
}

/** Cape or cloak hanging behind the body; heroes get a gold hem, Norse a woven trim. */
function capeArt(
  c: Ctx,
  def: UnitDef,
  team: string,
  fx: number,
  fy: number,
  s: (v: number) => number,
  short: boolean,
): void {
  const hem = short ? 15 : 5;
  const col = mix(team, '#3a2a20', short ? 0.25 : 0.12);
  c.fillStyle = vgrad(c, fy - s(52), fy - s(hem), col, 1.1, 0.55);
  c.beginPath();
  c.moveTo(fx - s(9), fy - s(50));
  c.quadraticCurveTo(fx - s(25), fy - s(24), fx - s(20), fy - s(hem));
  c.quadraticCurveTo(fx - s(9), fy - s(hem + 5), fx + s(2), fy - s(hem + 7));
  c.lineTo(fx + s(4), fy - s(48));
  c.closePath();
  c.fill();
  c.strokeStyle = shade(col, 0.6);
  c.lineWidth = s(0.9);
  c.beginPath();
  c.moveTo(fx - s(10), fy - s(46));
  c.quadraticCurveTo(fx - s(19), fy - s(28), fx - s(16), fy - s(hem + 2));
  c.moveTo(fx - s(5), fy - s(46));
  c.quadraticCurveTo(fx - s(11), fy - s(30), fx - s(9), fy - s(hem + 5));
  c.stroke();
  c.strokeStyle = def.cls === 'hero' ? GOLD : '#efe2c4';
  c.lineWidth = s(1.6);
  if (def.faction === 'hrimfolk' && def.cls !== 'hero') c.setLineDash([s(1.2), s(1.2)]);
  c.beginPath();
  c.moveTo(fx - s(20), fy - s(hem));
  c.quadraticCurveTo(fx - s(9), fy - s(hem + 5), fx + s(2), fy - s(hem + 7));
  c.stroke();
  c.setLineDash([]);
}

/** Round cloak brooch at the near shoulder. */
function brooch(c: Ctx, x: number, y: number, s: (v: number) => number, gold: boolean): void {
  const m = gold ? GOLD : BRONZE;
  disc(c, x, y, s(3), shade(m, 0.55));
  disc(c, x, y, s(2.5), rgrad(c, x, y, s(2.5), m));
  disc(c, x, y, s(1), gold ? '#b02a2a' : shade(m, 0.7));
  line(c, x - s(3.5), y + s(1.5), x + s(3.5), y - s(1.5), s(0.7), shade(m, 0.8));
}

function weapon(c: Ctx, def: UnitDef, hx: number, hy: number, s: (v: number) => number): void {
  const w = def.art.weapon ?? 'none';
  const f = def.faction;
  const metal = f === 'aurelian' ? BRONZE : f === 'sahrun' ? '#d0a050' : STEEL;
  const edge = 'rgba(255,255,255,0.7)';
  switch (w) {
    case 'javelin':
      haft(c, hx - s(10), hy + s(8), hx + s(14), hy - s(34), s(2), WOOD);
      c.fillStyle = dgrad(c, hx + s(12), hy - s(42), hx + s(18), hy - s(32), metal);
      c.beginPath();
      c.moveTo(hx + s(17.5), hy - s(43));
      c.lineTo(hx + s(16.2), hy - s(32));
      c.lineTo(hx + s(12), hy - s(34.5));
      c.closePath();
      c.fill();
      // Throwing thong looped at the balance point.
      c.strokeStyle = '#d8c385';
      c.lineWidth = s(0.8);
      c.beginPath();
      c.ellipse(hx + s(3), hy - s(14), s(2.4), s(1.4), -1, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'greatsword':
      framed(c, hx, hy, 30, () => {
        const g = c.createLinearGradient(-s(2.5), 0, s(2.5), 0);
        g.addColorStop(0, '#f4f7fb');
        g.addColorStop(1, '#8e98a4');
        c.fillStyle = INK;
        c.fillRect(-s(3), -s(41), s(6), s(37.5));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-s(2.4), -s(4));
        c.lineTo(-s(2.4), -s(36));
        c.lineTo(0, -s(41));
        c.lineTo(s(2.4), -s(36));
        c.lineTo(s(2.4), -s(4));
        c.closePath();
        c.fill();
        line(c, 0, -s(6), 0, -s(34), s(0.8), 'rgba(80,90,105,0.6)');
        inked(c, -s(7), -s(4), s(7), -s(4), s(2.6), GOLD);
        inked(c, 0, -s(3), 0, s(7), s(2.6), LEATHER);
        wraps(c, 0, -s(3), 0, s(7), 4, s(1.4), '#2e1e12');
        disc(c, 0, s(8.5), s(2.2), rgrad(c, 0, s(8.5), s(2.2), GOLD));
      });
      break;
    case 'greataxe':
      framed(c, hx, hy, 17, () => {
        haft(c, 0, s(15), 0, -s(34), s(3.2));
        c.fillStyle = dgrad(c, 0, -s(40), s(18), -s(18), metal);
        c.beginPath();
        if (f === 'sahrun') {
          // Epsilon axe: a bronze crescent on a narrow neck, lashed to the haft.
          c.moveTo(s(1.5), -s(34));
          c.lineTo(s(5), -s(32));
          c.quadraticCurveTo(s(9), -s(38), s(15), -s(37));
          c.quadraticCurveTo(s(21), -s(27), s(15), -s(16.5));
          c.quadraticCurveTo(s(9), -s(16.5), s(5), -s(22));
          c.lineTo(s(1.5), -s(20));
          c.closePath();
          c.fill();
          wraps(c, 0, -s(33), 0, -s(21), 4, s(2), '#5a3a20');
          c.strokeStyle = edge;
          c.lineWidth = s(1.1);
          c.beginPath();
          c.moveTo(s(15.5), -s(35));
          c.quadraticCurveTo(s(19.5), -s(27), s(15), -s(18));
          c.stroke();
        } else {
          // Dane axe: thin body flaring to a wide crescent edge with sharp horns.
          c.moveTo(s(1.5), -s(33));
          c.lineTo(s(5), -s(33.5));
          c.quadraticCurveTo(s(11), -s(36.5), s(15), -s(40));
          c.quadraticCurveTo(s(20), -s(30), s(16), -s(18));
          c.quadraticCurveTo(s(13), -s(21), s(9), -s(21.5));
          c.quadraticCurveTo(s(5), -s(25.5), s(1.5), -s(27));
          c.closePath();
          c.fill();
          c.strokeStyle = edge;
          c.lineWidth = s(1.1);
          c.beginPath();
          c.moveTo(s(15.4), -s(38));
          c.quadraticCurveTo(s(19), -s(30), s(16), -s(20));
          c.stroke();
        }
        rr(c, -s(2.2), -s(35), s(4.4), s(9), s(1.2), shade(metal, 0.7));
        wraps(c, 0, -s(2), 0, s(8), 4, s(1.8), '#3a2616');
      });
      break;
    case 'spear':
      framed(c, hx, hy, 10, () => {
        haft(c, 0, s(16.5), 0, -s(38), s(2.8));
        if (f === 'aurelian') {
          // Bronze sauroter butt spike.
          c.fillStyle = BRONZE;
          c.beginPath();
          c.moveTo(-s(1.8), s(15));
          c.lineTo(s(1.8), s(15));
          c.lineTo(0, s(21));
          c.closePath();
          c.fill();
        }
        c.fillStyle = dgrad(c, -s(4), -s(52), s(4), -s(38), metal);
        c.beginPath();
        c.moveTo(0, -s(52));
        c.quadraticCurveTo(s(3.6), -s(44), s(1.6), -s(38.5));
        c.lineTo(-s(1.6), -s(38.5));
        c.quadraticCurveTo(-s(3.6), -s(44), 0, -s(52));
        c.fill();
        line(c, 0, -s(50), 0, -s(40), s(0.7), shade(metal, 0.6));
        line(c, s(0.8), -s(49), s(2.2), -s(42), s(0.6), edge);
        rr(c, -s(1.6), -s(39), s(3.2), s(4.5), s(0.8), shade(metal, 0.8));
        if (f === 'hrimfolk') {
          // Winged lugs below the socket.
          line(c, -s(3.6), -s(35), s(3.6), -s(35), s(1.4), shade(metal, 0.8));
        }
        wraps(c, 0, -s(4), 0, s(4), 3, s(1.6), '#3a2616');
      });
      break;
    case 'sword':
      framed(c, hx, hy, 32, () => {
        if (f === 'sahrun') {
          // Khopesh: straight shank, then a hooked bronze blade.
          c.fillStyle = INK;
          c.fillRect(-s(1.8), -s(13), s(3.6), s(10));
          c.fillStyle = dgrad(c, -s(2), -s(30), s(12), -s(10), metal);
          c.beginPath();
          c.moveTo(-s(1.3), -s(3));
          c.lineTo(-s(1.3), -s(13));
          c.quadraticCurveTo(-s(3), -s(25), s(6), -s(28));
          c.quadraticCurveTo(s(12.5), -s(29), s(11.5), -s(21));
          c.quadraticCurveTo(s(8.5), -s(24.5), s(3.5), -s(22.5));
          c.quadraticCurveTo(s(1.4), -s(17), s(1.3), -s(3));
          c.closePath();
          c.fill();
          c.strokeStyle = edge;
          c.lineWidth = s(0.8);
          c.beginPath();
          c.moveTo(-s(1.6), -s(16));
          c.quadraticCurveTo(-s(2.4), -s(25), s(6), -s(27.2));
          c.stroke();
        } else {
          // Leaf-bladed xiphos / straight sword with a fuller.
          const g = c.createLinearGradient(-s(2.6), 0, s(2.6), 0);
          g.addColorStop(0, '#f2f5f9');
          g.addColorStop(1, '#8f99a5');
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(-s(1.6), -s(4));
          c.quadraticCurveTo(-s(3), -s(18), -s(1.2), -s(25));
          c.lineTo(0, -s(30.5));
          c.lineTo(s(1.2), -s(25));
          c.quadraticCurveTo(s(3), -s(18), s(1.6), -s(4));
          c.closePath();
          c.fill();
          line(c, 0, -s(6), 0, -s(25), s(0.6), 'rgba(80,90,105,0.6)');
        }
        inked(c, -s(4.5), -s(3.5), s(4.5), -s(3.5), s(2.2), GOLD);
        inked(c, 0, -s(3), 0, s(4), s(2.4), LEATHER);
        disc(c, 0, s(5), s(1.8), GOLD);
      });
      break;
    case 'axe':
      framed(c, hx, hy, 19, () => {
        haft(c, 0, s(8.5), 0, -s(25), s(3));
        c.fillStyle = dgrad(c, 0, -s(27), s(14), -s(10), metal);
        c.beginPath();
        if (f === 'sahrun') {
          c.moveTo(s(1.5), -s(25));
          c.quadraticCurveTo(s(13), -s(27), s(13), -s(19));
          c.quadraticCurveTo(s(13), -s(12), s(1.5), -s(14));
        } else {
          // Bearded axe: straight top, long beard sweeping down to the haft.
          c.moveTo(s(1.5), -s(25.5));
          c.lineTo(s(9), -s(25.2));
          c.quadraticCurveTo(s(13), -s(24), s(13.5), -s(19));
          c.quadraticCurveTo(s(12.8), -s(12.5), s(9), -s(10));
          c.quadraticCurveTo(s(5.5), -s(14), s(5), -s(17));
          c.quadraticCurveTo(s(3), -s(20), s(1.5), -s(20.5));
        }
        c.closePath();
        c.fill();
        line(c, s(12.6), -s(23), s(10.6), -s(11.5), s(1), edge);
        rr(c, -s(2), -s(27), s(4), s(7.5), s(1), shade(metal, 0.7));
        if (def.cls !== 'worker') wraps(c, 0, -s(3), 0, s(5), 3, s(1.6), '#3a2616');
      });
      break;
    case 'bow': {
      const wood = f === 'sahrun' ? '#5a3a1e' : WOOD;
      c.lineCap = 'round';
      c.strokeStyle = INK;
      c.lineWidth = s(4.2);
      c.beginPath();
      c.arc(hx - s(4), hy - s(2), s(18), -1.15, 1.15);
      c.stroke();
      c.strokeStyle = wood;
      c.lineWidth = s(3);
      c.stroke();
      c.strokeStyle = shade(wood, 1.45);
      c.lineWidth = s(0.8);
      c.beginPath();
      c.arc(hx - s(4), hy - s(2), s(18.6), -1.0, 0.9);
      c.stroke();
      if (f === 'sahrun') {
        // Recurved tips of the composite bow.
        line(c, hx + s(3.4), hy - s(18.5), hx + s(7), hy - s(21), s(2.2), wood);
        line(c, hx + s(3.4), hy + s(14.5), hx + s(7), hy + s(17), s(2.2), wood);
      }
      line(c, hx + s(3.5), hy - s(18.5), hx + s(3.5), hy + s(14.5), s(0.9), '#f3ead8');
      wraps(c, hx + s(14), hy - s(5), hx + s(14), hy + s(1), 3, s(1.8), '#3a2616');
      // Nocked arrow with fletching and head.
      line(c, hx - s(9), hy - s(2), hx + s(15), hy - s(2), s(1.5), '#d8c385');
      c.fillStyle = metal;
      c.beginPath();
      c.moveTo(hx + s(19), hy - s(2));
      c.lineTo(hx + s(15), hy - s(4));
      c.lineTo(hx + s(15), hy);
      c.closePath();
      c.fill();
      line(c, hx - s(9), hy - s(2), hx - s(5), hy - s(4.5), s(1.2), '#b0473a');
      line(c, hx - s(9), hy - s(2), hx - s(5), hy + s(0.5), s(1.2), '#efe6cf');
      break;
    }
    case 'sling':
      c.strokeStyle = '#c8b080';
      c.lineWidth = s(1.1);
      c.beginPath();
      c.moveTo(hx, hy);
      c.quadraticCurveTo(hx + s(4), hy - s(14), hx + s(10), hy - s(19));
      c.moveTo(hx, hy);
      c.quadraticCurveTo(hx + s(8), hy - s(12), hx + s(12), hy - s(17));
      c.stroke();
      oval(c, hx + s(11.5), hy - s(18.5), s(3.2), s(2.4), LEATHER, -0.6);
      disc(
        c,
        hx + s(11.5),
        hy - s(19.5),
        s(2.4),
        rgrad(c, hx + s(11.5), hy - s(19.5), s(2.4), '#9a948a'),
      );
      break;
    case 'staff': {
      haft(c, hx, hy + s(22), hx + s(3), hy - s(34), s(2.8));
      for (let i = 0; i < 3; i++) {
        const t = 0.15 + i * 0.12;
        line(
          c,
          hx + s(3 * t) - s(1.8),
          hy - s(34) + s(56 * t),
          hx + s(3 * t) + s(1.8),
          hy - s(34) + s(56 * t),
          s(1.4),
          GOLD,
        );
      }
      const ox = hx + s(3);
      const oy = hy - s(39);
      const glow = def.art.accent ?? GOLD;
      disc(c, ox, oy, s(8.5), 'rgba(255,230,140,0.3)');
      c.strokeStyle = 'rgba(255,236,160,0.85)';
      c.lineWidth = s(1);
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.moveTo(ox + Math.cos(a) * s(6), oy + Math.sin(a) * s(6));
        c.lineTo(ox + Math.cos(a) * s(9), oy + Math.sin(a) * s(9));
      }
      c.stroke();
      disc(c, ox, oy, s(5), rgrad(c, ox, oy, s(5), glow));
      disc(c, ox - s(1.5), oy - s(1.5), s(1.4), 'rgba(255,255,240,0.9)');
      break;
    }
    case 'tool':
      tool(c, 'pick', hx, hy, 18, s);
      break;
    default:
      break;
  }
}

/** Humanoid with feet at (fx, fy); `k` scales it (riders use a smaller one). */
function humanoid(
  c: Ctx,
  def: UnitDef,
  team: string,
  fx: number,
  fy: number,
  k: number,
  pose: Pose = {},
): void {
  const s = (v: number): number => v * k;
  const f = def.faction;
  const skin = SKIN[f];
  const look = lookOf(def);
  const d = detailOf(def);
  const g = garbOf(def, look, team, d);
  const weaponKind = def.art.weapon ?? 'none';
  if (look.cape || d.cloak) capeArt(c, def, team, fx, fy, s, !look.cape);
  // Javelins / quiver carried on the back.
  if (!pose.act && !pose.carry) {
    if (weaponKind === 'javelin')
      for (let i = 0; i < 2; i++)
        haft(c, fx - s(14) + i * s(3), fy - s(18), fx - s(4) + i * s(3), fy - s(62), s(1.6));
    if (weaponKind === 'bow') {
      for (let i = 0; i < 3; i++) {
        const x = fx - s(14.5) + i * s(1.9);
        line(c, x, fy - s(52), x - s(0.6), fy - s(59), s(1), '#d8c385');
        line(
          c,
          x - s(0.6),
          fy - s(57),
          x - s(0.6),
          fy - s(60),
          s(1.6),
          i === 1 ? '#b0473a' : '#efe6cf',
        );
      }
      rr(
        c,
        fx - s(16.5),
        fy - s(55),
        s(7),
        s(21),
        s(2.2),
        vgrad(c, fy - s(55), fy - s(34), LEATHER),
      );
      line(c, fx - s(16.5), fy - s(52), fx - s(9.5), fy - s(52), s(1.2), shade(LEATHER, 0.6));
      line(c, fx - s(16.5), fy - s(38), fx - s(9.5), fy - s(38), s(1.2), shade(LEATHER, 0.6));
    }
  }
  // Back arm, then legs (far leg darker).
  armLimb(c, fx - s(8), fy - s(44), fx - s(14), fy - s(26), s, skin, g, true);
  if (look.shield === 'none' || pose.act || pose.carry)
    fist(c, fx - s(14), fy - s(26), s, shade(g.glove ?? skin, 0.85));
  if (pose.stride) {
    leg(c, fx - s(3), fy - s(23), 0.38, s, look, d, f, g, true);
    leg(c, fx + s(3), fy - s(23), -0.32, s, look, d, f, g, false);
  } else {
    leg(c, fx - s(5.25), fy - s(24), 0, s, look, d, f, g, true);
    leg(c, fx + s(5.25), fy - s(24), 0, s, look, d, f, g, false);
  }
  kilt(c, def, look, d, g, team, fx, fy, s);
  torso(c, def, look, d, g, team, fx, fy, s);
  belt(c, def, look, fx, fy, s);
  if (pose.carry === 'gold') sack(c, fx - s(12), fy - s(40), s);
  if (pose.carry === 'wood') {
    // Logs balanced across the shoulders, behind the head.
    for (let i = 0; i < 3; i++) {
      const ly = fy - s(55) + i * s(4.5);
      const lx = fx - s(20) + (i % 2) * s(3);
      rr(c, lx, ly, s(34), s(5.5), s(2.7), vgrad(c, ly, ly + s(5.5), '#8a6440'));
      line(c, lx + s(4), ly + s(2), lx + s(28), ly + s(2), s(0.6), '#5e4028');
      disc(c, lx + s(34), ly + s(2.75), s(2.7), '#d9b07a');
      disc(c, lx + s(34), ly + s(2.75), s(1.2), '#b08850');
    }
  }
  head(c, def, look, d, team, fx, fy - s(60), s);
  if (look.cape || d.cloak) brooch(c, fx + s(6), fy - s(47), s, def.cls === 'hero');
  if (pose.act || pose.carry) {
    workerArm(c, pose, fx, fy, s, skin, g);
    return;
  }
  const handCol = g.glove ?? skin;
  const frontArm = (hx: number, hy: number): void =>
    armLimb(c, fx + s(8), fy - s(46), hx, hy, s, skin, g, false);
  if (weaponKind === 'horn') {
    // War horn bound with bronze bands, raised to the lips.
    const hx = fx + s(11);
    const hy = fy - s(55);
    frontArm(hx, hy);
    c.fillStyle = dgrad(c, fx + s(8), fy - s(62), fx + s(28), fy - s(40), '#efe2c0');
    c.beginPath();
    c.moveTo(fx + s(8), fy - s(56));
    c.quadraticCurveTo(fx + s(18), fy - s(62), fx + s(26), fy - s(50));
    c.lineTo(fx + s(31), fy - s(44));
    c.lineTo(fx + s(22), fy - s(46));
    c.quadraticCurveTo(fx + s(17), fy - s(56), fx + s(9), fy - s(53));
    c.closePath();
    c.fill();
    for (let i = 0; i < 3; i++)
      line(
        c,
        fx + s(13) + i * s(4),
        fy - s(58) + i * s(2),
        fx + s(13) + i * s(4),
        fy - s(54) + i * s(2.5),
        s(1.4),
        BRONZE,
      );
    line(c, fx + s(29), fy - s(46.5), fx + s(24), fy - s(44.5), s(1.4), shade(BRONZE, 1.2));
    fist(c, hx, hy, s, handCol);
  } else if (weaponKind === 'banner') {
    // Standard: tall pole, team flag with an emblem and fringe, gilded finial.
    const hx = fx + s(13);
    const hy = fy - s(38);
    frontArm(hx, hy);
    haft(c, hx, hy + s(30), hx + s(1), hy - s(44), s(2.4));
    c.fillStyle = vgrad(c, hy - s(40), hy - s(14), team, 1.2, 0.7);
    c.beginPath();
    c.moveTo(hx + s(1.5), hy - s(40));
    c.quadraticCurveTo(hx + s(12), hy - s(43), hx + s(22), hy - s(39));
    c.lineTo(hx + s(21), hy - s(16));
    c.quadraticCurveTo(hx + s(12), hy - s(20), hx + s(1.5), hy - s(16));
    c.closePath();
    c.fill();
    c.strokeStyle = GOLD;
    c.lineWidth = s(1.6);
    c.setLineDash([s(1), s(1)]);
    c.beginPath();
    c.moveTo(hx + s(21), hy - s(15));
    c.quadraticCurveTo(hx + s(12), hy - s(19), hx + s(1.5), hy - s(15));
    c.stroke();
    c.setLineDash([]);
    line(c, hx + s(2), hy - s(38), hx + s(21), hy - s(37), s(1), shade(team, 1.5));
    disc(c, hx + s(11), hy - s(29), s(4.5), GOLD);
    disc(c, hx + s(11), hy - s(29), s(2.4), shade(team, 0.6));
    line(c, hx - s(1), hy - s(44), hx + s(3), hy - s(44), s(2.4), GOLD);
    disc(c, hx + s(1), hy - s(47), s(2.6), rgrad(c, hx + s(1), hy - s(47), s(2.6), GOLD));
    fist(c, hx, hy, s, handCol);
  } else {
    // Front arm + hand holding the weapon (two-handed weapons are held lower).
    const two = weaponKind === 'greatsword' || weaponKind === 'greataxe';
    const hx = fx + s(two ? 12 : 14);
    const hy = fy - s(two ? 32 : 36);
    frontArm(hx, hy);
    weapon(c, def, hx, hy, s);
    fist(c, hx, hy, s, handCol);
  }
  if (look.shield !== 'none') {
    const big = look.shield === 'tower' || look.shield === 'hoplon';
    shieldArt(c, look.shield, def, d, team, fx - s(big ? 12 : 13), fy - s(big ? 32 : 34), s);
  }
}

/** Tool kinds drawn by `tool()`; the handle runs "up" from the hand before rotation. */
type ToolKind = 'axe' | 'pick' | 'hammer' | 'hoe' | 'rod';

/** Draw a tool gripped at (hx, hy), rotated `deg` degrees clockwise from pointing straight up. */
function tool(
  c: Ctx,
  kind: ToolKind,
  hx: number,
  hy: number,
  deg: number,
  s: (v: number) => number,
): void {
  framed(c, hx, hy, deg, () => {
    const metal = (x0: number, y0: number, x1: number, y1: number): CanvasGradient =>
      dgrad(c, x0, y0, x1, y1, STEEL);
    const edge = 'rgba(255,255,255,0.7)';
    // Hand tools are a touch smaller so the swing frames stay inside the canvas.
    if (kind !== 'rod' && kind !== 'hoe') c.scale(0.82, 0.82);
    switch (kind) {
      case 'axe':
        haft(c, 0, s(6), 0, -s(28), s(3));
        c.fillStyle = metal(0, -s(34), s(14), -s(18));
        c.beginPath();
        c.moveTo(s(1), -s(29));
        c.quadraticCurveTo(s(14), -s(34), s(12.5), -s(16));
        c.quadraticCurveTo(s(7), -s(21), s(1), -s(20));
        c.closePath();
        c.fill();
        line(c, s(12), -s(30), s(12.3), -s(18), s(1), edge);
        rr(c, -s(2), -s(30), s(4), s(8), s(1), shade(STEEL, 0.65));
        break;
      case 'pick':
        haft(c, 0, s(6), 0, -s(27), s(3));
        c.strokeStyle = INK;
        c.lineWidth = s(4.6);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-s(13), -s(20));
        c.quadraticCurveTo(0, -s(33), s(14), -s(21));
        c.stroke();
        c.strokeStyle = metal(-s(14), -s(30), s(14), -s(24));
        c.lineWidth = s(3.4);
        c.stroke();
        c.strokeStyle = edge;
        c.lineWidth = s(0.8);
        c.beginPath();
        c.moveTo(-s(10), -s(24));
        c.quadraticCurveTo(0, -s(32), s(10), -s(25));
        c.stroke();
        rr(c, -s(2.2), -s(30), s(4.4), s(6), s(1), shade(STEEL, 0.6));
        break;
      case 'hammer':
        haft(c, 0, s(5), 0, -s(20), s(3));
        rr(c, -s(5.5), -s(27.5), s(13), s(9), s(1.6), INK);
        rr(c, -s(5), -s(27), s(12), s(8), s(1.5), metal(-s(5), -s(27), s(7), -s(19)));
        line(c, -s(4), -s(26), s(6), -s(26), s(0.8), edge);
        break;
      case 'hoe':
        haft(c, 0, s(10), 0, -s(36), s(2.8));
        c.fillStyle = metal(0, -s(40), s(10), -s(30));
        c.beginPath();
        c.moveTo(-s(1), -s(36.5));
        c.lineTo(s(11.5), -s(33));
        c.lineTo(s(10.5), -s(27.5));
        c.lineTo(-s(1), -s(32));
        c.closePath();
        c.fill();
        line(c, s(11.2), -s(32.5), s(10.4), -s(28), s(0.9), edge);
        break;
      case 'rod':
        c.strokeStyle = INK;
        c.lineWidth = s(3);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(0, s(6));
        c.quadraticCurveTo(s(2), -s(18), s(4), -s(36));
        c.stroke();
        c.strokeStyle = '#9a7848';
        c.lineWidth = s(2);
        c.stroke();
        wraps(c, 0, s(5), s(0.5), -s(3), 3, s(1.4), '#3a2616');
        break;
    }
  });
}

/** Worker front arm for work and carry poses (and what the off hand holds). */
function workerArm(
  c: Ctx,
  pose: Pose,
  fx: number,
  fy: number,
  s: (v: number) => number,
  skin: string,
  g: Garb,
): void {
  const shx = fx + s(8);
  const shy = fy - s(46);
  const arm = (dx: number, dy: number): [number, number] => {
    const hx = shx + s(dx);
    const hy = shy + s(dy);
    armLimb(c, shx, shy, hx, hy, s, skin, g, false);
    return [hx, hy];
  };
  const hand = (hx: number, hy: number): void => fist(c, hx, hy, s, g.glove ?? skin);
  const f = pose.frame ?? 0;
  if (pose.act) {
    switch (pose.act) {
      case 'chop':
      case 'mine': {
        const kind = pose.act === 'chop' ? 'axe' : 'pick';
        // Wind-up over the shoulder, then the swing lands in front.
        const [hx, hy] = f === 0 ? arm(-2, -12) : arm(10, 6);
        tool(c, kind, hx, hy, f === 0 ? -78 : pose.act === 'chop' ? 95 : 115, s);
        hand(hx, hy);
        break;
      }
      case 'build': {
        const [hx, hy] = f === 0 ? arm(3, -15) : arm(11, 4);
        tool(c, 'hammer', hx, hy, f === 0 ? -35 : 85, s);
        hand(hx, hy);
        break;
      }
      case 'farm': {
        // Two-handed hoe: the back hand also grips the shaft.
        const [hx, hy] = f === 0 ? arm(4, -8) : arm(13, 6);
        tool(c, 'hoe', hx, hy, f === 0 ? -62 : 138, s);
        hand(hx, hy);
        break;
      }
      case 'pick': {
        basket(c, fx + s(13), fy - s(25), s, 'berries');
        if (f === 0) {
          const [hx, hy] = arm(15, -8);
          hand(hx, hy);
          disc(c, hx + s(3), hy - s(3), s(2.4), rgrad(c, hx + s(3), hy - s(3), s(2.4), '#d8304a'));
        } else {
          const [hx, hy] = arm(6, 12);
          hand(hx, hy);
        }
        break;
      }
      case 'fish': {
        const [hx, hy] = arm(11, 1);
        tool(c, 'rod', hx, hy, f === 0 ? ROD_DEG[0] : ROD_DEG[1], s);
        hand(hx, hy);
        break;
      }
    }
    return;
  }
  switch (pose.carry) {
    case 'wood': {
      const [hx, hy] = arm(4, -6);
      hand(hx, hy);
      break;
    }
    case 'gold': {
      const [hx, hy] = arm(5, 10);
      hand(hx, hy);
      break;
    }
    case 'berries':
    case 'grain': {
      basket(c, fx + s(14), fy - s(30), s, pose.carry);
      const [hx, hy] = arm(8, 14);
      hand(hx, hy);
      break;
    }
    case 'fish': {
      const [hx, hy] = arm(9, 12);
      line(c, hx, hy, hx + s(1), hy + s(6), s(1.2), '#d8c385');
      for (let i = 0; i < 2; i++) {
        const cx = hx + s(1) + i * s(3);
        const cy = hy + s(13) + i * s(2);
        oval(c, cx, cy, s(2.6), s(7), vgrad(c, cy - s(7), cy + s(7), '#9fb8c8'));
        line(c, cx, cy - s(5), cx, cy + s(4), s(0.6), 'rgba(255,255,255,0.6)');
        c.fillStyle = '#7d96a8';
        c.beginPath();
        c.moveTo(cx, cy + s(6));
        c.lineTo(cx - s(3), cy + s(10));
        c.lineTo(cx + s(3), cy + s(10));
        c.closePath();
        c.fill();
        disc(c, cx + s(0.8), cy - s(4.5), s(0.6), '#1a1a20');
      }
      hand(hx, hy);
      break;
    }
  }
}

/** Woven basket with its contents peeking out. */
function basket(
  c: Ctx,
  x: number,
  y: number,
  s: (v: number) => number,
  contents: 'berries' | 'grain',
): void {
  if (contents === 'berries') {
    for (let i = 0; i < 5; i++) {
      const bx = x - s(5) + i * s(2.5);
      const by = y - s(3) - (i % 2) * s(1.5);
      disc(c, bx, by, s(2.4), rgrad(c, bx, by, s(2.4), i % 3 ? '#d8304a' : '#7a2a6a'));
    }
    oval(c, x + s(4), y - s(4), s(2.6), s(1.3), '#4f8a3a', -0.4);
  } else {
    for (let i = 0; i < 5; i++) {
      line(c, x - s(4) + i * s(2), y, x - s(6) + i * s(3), y - s(11), s(1.2), '#c8a048');
      oval(c, x - s(6) + i * s(3), y - s(11.5), s(1.2), s(2.4), '#e8c868', 0.2);
    }
  }
  c.fillStyle = vgrad(c, y - s(2), y + s(9), '#b08548');
  c.beginPath();
  c.moveTo(x - s(8), y - s(2));
  c.lineTo(x + s(8), y - s(2));
  c.lineTo(x + s(6), y + s(8));
  c.lineTo(x - s(6), y + s(8));
  c.closePath();
  c.fill();
  c.strokeStyle = '#7a5634';
  c.lineWidth = s(0.8);
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    c.moveTo(x - s(7), y + i * s(3));
    c.lineTo(x + s(7), y + i * s(3));
  }
  for (let i = -2; i <= 2; i++) {
    c.moveTo(x + i * s(3), y - s(2));
    c.lineTo(x + i * s(2.5), y + s(8));
  }
  c.stroke();
  line(c, x - s(8), y - s(2), x + s(8), y - s(2), s(1.4), '#8a6438');
}

/** Bulging ore sack slung on the back, nuggets glinting at the mouth. */
function sack(c: Ctx, x: number, y: number, s: (v: number) => number): void {
  oval(c, x, y + s(4), s(8), s(10), vgrad(c, y - s(6), y + s(14), '#a08060'));
  line(c, x - s(4), y + s(2), x - s(2), y + s(12), s(0.6), '#6a5038');
  line(c, x + s(3), y + s(1), x + s(4), y + s(11), s(0.6), '#6a5038');
  line(c, x - s(5), y - s(3.5), x + s(5), y - s(3.5), s(1.4), '#6a5038');
  disc(c, x - s(2), y - s(6), s(2.6), rgrad(c, x - s(2), y - s(6), s(2.6), GOLD));
  disc(c, x + s(2.5), y - s(5), s(2.2), rgrad(c, x + s(2.5), y - s(5), s(2.2), GOLD));
}

const ROD_DEG = [35, 46] as const;

/**
 * Rod tip of the fishing pose in the 100×100 design box (feet at (50, 86)); the renderer draws
 * the line from here to the fishing spot. Hand at (69, 41), tip at local (4, -36) rotated.
 */
export function rodTip(frame: 0 | 1): [number, number] {
  const a = (ROD_DEG[frame] * Math.PI) / 180;
  return [69 + 4 * Math.cos(a) + 36 * Math.sin(a), 41 + 4 * Math.sin(a) - 36 * Math.cos(a)];
}

// ───────────────────────── riders & engines ─────────────────────────

/** Two-segment animal leg from the body to the ground with a hoof or a clawed paw. */
function animalLeg(
  c: Ctx,
  x: number,
  y: number,
  len: number,
  w: number,
  color: string,
  hind: boolean,
  foot: 'hoof' | 'paw' | 'pad',
): void {
  const kx = x + (hind ? -2.5 : 1.5);
  const ky = y + len * 0.5;
  inked(c, x, y, kx, ky, w, color);
  inked(c, kx, ky, x - (hind ? 0.5 : 1), y + len, w * 0.75, color);
  const fx = x - (hind ? 0.5 : 1);
  const fy = y + len;
  if (foot === 'hoof') {
    rr(c, fx - w * 0.6, fy - 1.5, w * 1.3, 3.2, 1, '#2a2018');
    line(c, fx - w * 0.5, fy - 1.6, fx + w * 0.6, fy - 1.6, 0.8, shade(color, 1.25));
  } else {
    oval(c, fx + 1, fy, w * 0.8, w * 0.42, shade(color, 0.8));
    if (foot === 'paw') {
      c.strokeStyle = '#f2ece0';
      c.lineWidth = 0.7;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        c.moveTo(fx + 1 + i * 1.3, fy + 0.5);
        c.lineTo(fx + 2 + i * 1.3, fy + 1.8);
      }
      c.stroke();
    }
  }
}

/** Fur strands along an edge: short lighter/darker strokes between two points. */
function furStrands(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  len: number,
  color: string,
  w = 0.9,
): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    c.moveTo(x, y);
    c.lineTo(x - len * 0.6, y + len);
  }
  c.stroke();
}

function mount(c: Ctx, kind: 'horse' | 'wolf', color: string, x: number, y: number): void {
  const dark = shade(color, 0.7);
  const wolf = kind === 'wolf';
  // Tail behind the body.
  if (wolf) {
    c.fillStyle = vgrad(c, y - 16, y + 2, color);
    c.beginPath();
    c.moveTo(x - 22, y - 4);
    c.quadraticCurveTo(x - 40, y - 16, x - 37, y - 1);
    c.quadraticCurveTo(x - 30, y + 3, x - 22, y + 2);
    c.fill();
    disc(c, x - 37, y - 5, 3, shade(color, 1.35));
    furStrands(c, x - 34, y - 9, x - 24, y - 3, 4, 3, dark);
  } else {
    c.lineCap = 'round';
    for (const [dx, col] of [
      [0, shade(color, 0.42)],
      [3, shade(color, 0.55)],
    ] as const) {
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x - 23, y - 5);
      c.quadraticCurveTo(x - 33 + dx, y, x - 30 + dx, y + 16);
      c.stroke();
    }
  }
  // Legs (far pair darker).
  const foot = wolf ? 'paw' : 'hoof';
  animalLeg(c, x - 16, y + 3, 23, 5, dark, true, foot);
  animalLeg(c, x + 12, y + 3, 23, 4.6, dark, false, foot);
  animalLeg(c, x - 10, y + 3, 23, 5.2, color, true, foot);
  animalLeg(c, x + 18, y + 3, 23, 4.8, color, false, foot);
  // Body with belly shade and a lit back.
  oval(c, x, y, 25.5, 12.5, INK);
  oval(c, x, y, 25, 12, vgrad(c, y - 12, y + 12, color));
  oval(c, x, y + 6.5, 19, 4.5, 'rgba(20,10,0,0.13)');
  oval(c, x - 4, y - 7.5, 15, 3, 'rgba(255,250,235,0.18)');
  if (wolf) furStrands(c, x - 20, y - 9, x + 16, y - 11, 9, 3.4, shade(color, 0.62), 1);
  // Neck + head.
  c.fillStyle = vgrad(c, y - 30, y, color);
  c.beginPath();
  c.moveTo(x + 14, y - 8);
  c.lineTo(x + 26, y - 26);
  c.lineTo(x + 34, y - 22);
  c.lineTo(x + 24, y + 2);
  c.closePath();
  c.fill();
  if (wolf) {
    // Ruff, head, ears, snout with fangs, glowing eye.
    for (let i = 0; i < 4; i++)
      oval(c, x + 18 + i * 2.5, y - 12 - i * 3.5, 5, 6, shade(color, 1.05 - i * 0.05));
    furStrands(c, x + 16, y - 6, x + 27, y - 22, 5, 3, shade(color, 1.3));
    oval(c, x + 33, y - 23, 10, 7, rgrad(c, x + 33, y - 23, 10, color));
    for (const [ex, col] of [
      [27, dark],
      [31, shade(color, 0.85)],
    ] as const) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x + ex, y - 28);
      c.lineTo(x + ex + 2, y - 38);
      c.lineTo(x + ex + 6, y - 29);
      c.fill();
    }
    oval(c, x + 42, y - 21, 6, 3.6, shade(color, 0.95));
    line(c, x + 36, y - 18.5, x + 47, y - 19.5, 0.9, '#2a1410');
    c.fillStyle = '#f2ece0';
    c.beginPath();
    c.moveTo(x + 41, y - 19);
    c.lineTo(x + 41.8, y - 16.6);
    c.lineTo(x + 42.6, y - 19);
    c.moveTo(x + 44, y - 19.3);
    c.lineTo(x + 44.6, y - 17.2);
    c.lineTo(x + 45.2, y - 19.4);
    c.fill();
    disc(c, x + 47.5, y - 22, 1.3, '#1a1410');
    eye(c, x + 36, y - 25, 1.5, '#ffd84a');
  } else {
    // Mane, head, muzzle, ear, eye and bridle.
    oval(c, x + 35, y - 24, 9, 6, rgrad(c, x + 35, y - 24, 9, color), 0.4);
    oval(c, x + 41, y - 20, 4.5, 3.6, shade(color, 0.85), 0.4);
    disc(c, x + 43, y - 20.5, 0.9, '#1a0e08');
    c.fillStyle = shade(color, 0.8);
    c.beginPath();
    c.moveTo(x + 29, y - 28);
    c.lineTo(x + 30, y - 35);
    c.lineTo(x + 33, y - 29);
    c.fill();
    disc(c, x + 34, y - 27, 1.5, '#140c08');
    disc(c, x + 34.5, y - 27.5, 0.5, '#ffffff');
    c.lineCap = 'round';
    c.strokeStyle = shade(color, 0.42);
    c.lineWidth = 2.4;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      c.moveTo(x + 27 - i * 2.6, y - 28 + i * 4.5);
      c.quadraticCurveTo(x + 22 - i * 2.6, y - 24 + i * 4.5, x + 21 - i * 2.6, y - 20 + i * 4.5);
    }
    c.moveTo(x + 30, y - 29);
    c.lineTo(x + 33, y - 25);
    c.stroke();
    c.strokeStyle = '#3a2416';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + 31, y - 28);
    c.lineTo(x + 40, y - 18);
    c.moveTo(x + 36, y - 26);
    c.lineTo(x + 38, y - 18);
    c.moveTo(x + 39, y - 19);
    c.lineTo(x + 10, y - 10);
    c.stroke();
    disc(c, x + 39, y - 19, 1.1, GOLD);
  }
}

/** Camel: long legs, a hump and a long curved neck. */
function camel(c: Ctx, color: string, x: number, y: number): void {
  const dark = shade(color, 0.72);
  line(c, x - 22, y - 2, x - 27, y + 12, 3, shade(color, 0.5));
  animalLeg(c, x - 15, y + 4, 27, 4.4, dark, true, 'pad');
  animalLeg(c, x + 13, y + 4, 27, 4, dark, false, 'pad');
  animalLeg(c, x - 9, y + 4, 27, 4.6, color, true, 'pad');
  animalLeg(c, x + 19, y + 4, 27, 4.2, color, false, 'pad');
  oval(c, x, y, 24.5, 11.5, INK);
  oval(c, x, y, 24, 11, vgrad(c, y - 11, y + 11, color));
  oval(c, x - 3, y - 10, 12, 9, vgrad(c, y - 19, y - 2, color));
  oval(c, x - 5, y - 15, 6, 2.5, 'rgba(255,250,235,0.2)');
  c.strokeStyle = INK;
  c.lineWidth = 9.4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x + 18, y - 2);
  c.quadraticCurveTo(x + 30, y - 6, x + 30, y - 26);
  c.stroke();
  c.strokeStyle = vgrad(c, y - 34, y, color);
  c.lineWidth = 8;
  c.stroke();
  oval(c, x + 35, y - 28, 8, 4.5, rgrad(c, x + 35, y - 28, 8, color), 0.2);
  oval(c, x + 41, y - 25.5, 3, 2, shade(color, 0.85), 0.3);
  disc(c, x + 34, y - 30, 1.3, '#140c08');
  line(c, x + 32.5, y - 31.6, x + 35.5, y - 31.8, 0.7, '#140c08');
  line(c, x + 31, y - 31, x + 31.5, y - 35, 2.4, shade(color, 0.8));
  // Tasselled bridle and a striped saddle blanket with hanging tassels.
  line(c, x + 28, y - 24, x + 38, y - 26, 1.2, '#b0473a');
  line(c, x + 28, y - 24, x + 27, y - 18, 1, '#b0473a');
  disc(c, x + 27, y - 17, 1.6, GOLD);
}

function rider(c: Ctx, def: UnitDef, team: string): void {
  const f = def.faction;
  const kind = def.art.mount ?? (f === 'sahrun' ? 'chariot' : f === 'hrimfolk' ? 'wolf' : 'horse');
  /** Team saddle cloth with a woven border and tassels. */
  const cloth = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    pattern: 'diamond' | 'key',
  ): void => {
    c.fillStyle = vgrad(c, y0, y1, team);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y0);
    c.lineTo(x1 - 2, y1);
    c.lineTo(x0 + 2, y1);
    c.closePath();
    c.fill();
    c.save();
    c.clip();
    trimBand(c, x0, y1 - 3.4, x1, 3.4, shade(team, 0.6), pattern, GOLD);
    c.restore();
    for (let i = 0; i < 4; i++) {
      const tx = x0 + 4 + i * ((x1 - x0 - 8) / 3);
      line(c, tx, y1, tx, y1 + 3, 1, GOLD);
      disc(c, tx, y1 + 3.6, 1, GOLD);
    }
    rr(c, x0 + 3, y0 - 2.5, x1 - x0 - 6, 4, 2, vgrad(c, y0 - 2.5, y0 + 1.5, LEATHER));
  };
  if (kind === 'camel') {
    camel(c, def.art.body, 52, 58);
    cloth(38, 58, 44, 60, 'diamond');
    humanoid(c, def, team, 49, 50, 0.6);
    return;
  }
  if (kind === 'chariot') {
    // Chariot: plumed horse pulling a light car with a standing archer.
    mount(c, 'horse', '#c9a46a', 60, 58);
    line(c, 91, 23, 93, 16, 2.4, team);
    disc(c, 93, 15.5, 2.2, team);
    inked(c, 30, 64, 48, 57, 2.6, WOOD);
    rr(c, 8, 50, 30, 24, 6, INK);
    rr(c, 8.5, 50.5, 29, 23, 5.5, vgrad(c, 50, 74, def.art.body));
    rr(c, 11, 54, 24, 14, 4, vgrad(c, 54, 68, team));
    disc(c, 23, 61, 3.4, GOLD);
    disc(c, 23, 61, 1.6, shade(team, 0.6));
    rr(c, 8, 50, 30, 4, 2, GOLD);
    disc(c, 22, 78, 11.6, INK);
    disc(c, 22, 78, 11, shade(WOOD, 0.7));
    disc(c, 22, 78, 8, shade(WOOD, 1.1));
    c.strokeStyle = shade(WOOD, 0.6);
    c.lineWidth = 1.6;
    c.beginPath();
    for (let a = 0; a < 6; a++) {
      c.moveTo(22, 78);
      c.lineTo(22 + Math.cos((a * Math.PI) / 3) * 9.5, 78 + Math.sin((a * Math.PI) / 3) * 9.5);
    }
    c.stroke();
    for (let a = 0; a < 8; a++)
      disc(
        c,
        22 + Math.cos((a * Math.PI) / 4) * 10,
        78 + Math.sin((a * Math.PI) / 4) * 10,
        0.8,
        STEEL,
      );
    disc(c, 22, 78, 2.5, GOLD);
    humanoid(c, def, team, 24, 54, 0.6);
    return;
  }
  mount(c, kind, def.art.body, 52, 58);
  cloth(40, 62, 48, 65, f === 'hrimfolk' ? 'diamond' : 'key');
  humanoid(c, def, team, 52, 56, 0.6);
}

function engine(c: Ctx, def: UnitDef, team: string): void {
  const wood = def.art.body;
  const ranged = !!def.attack && def.attack.range > 2;
  const bolts = (pts: ReadonlyArray<readonly [number, number]>): void => {
    for (const [x, y] of pts) disc(c, x, y, 1.1, rgrad(c, x, y, 1.1, STEEL));
  };
  // Chassis: planks with grain and iron bands.
  rr(c, 9.5, 51.5, 79, 17, 4, INK);
  rr(c, 10, 52, 78, 16, 4, vgrad(c, 52, 68, wood));
  for (let i = 0; i < 3; i++) line(c, 12, 56 + i * 4.5, 86, 56 + i * 4.5, 0.6, shade(wood, 0.72));
  for (let i = 0; i < 4; i++) {
    line(c, 16 + i * 20, 52.5, 16 + i * 20, 67.5, 2.2, shade(STEEL, 0.6));
    bolts([
      [16 + i * 20, 55],
      [16 + i * 20, 65],
    ]);
  }
  if (ranged) {
    if (def.faction === 'sahrun') {
      // Sun lens: a big polished disc on a gilded frame, with rays.
      inked(c, 50, 52, 50, 26, 6, shade(wood, 0.8));
      c.strokeStyle = 'rgba(255,240,170,0.6)';
      c.lineWidth = 1.4;
      c.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.moveTo(52 + Math.cos(a) * 18, 22 + Math.sin(a) * 18);
        c.lineTo(52 + Math.cos(a) * (i % 2 ? 20 : 22), 22 + Math.sin(a) * (i % 2 ? 20 : 22));
      }
      c.stroke();
      disc(c, 52, 22, 17, dgrad(c, 35, 5, 69, 39, '#a07a20'));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        disc(c, 52 + Math.cos(a) * 15.5, 22 + Math.sin(a) * 15.5, 0.9, GOLD);
      }
      const g = c.createRadialGradient(46, 16, 2, 52, 22, 14);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.5, def.art.accent ?? '#ffe58a');
      g.addColorStop(1, '#c08a20');
      disc(c, 52, 22, 13.5, g);
      oval(c, 47, 16, 4, 2.4, 'rgba(255,255,255,0.7)', -0.6);
    } else {
      // Torsion frame with twisted rope bundles, throwing arm and bucket.
      rr(c, 26, 40, 46, 12, 3, vgrad(c, 40, 52, shade(wood, 0.9)));
      for (const bx of [32, 64]) {
        oval(c, bx, 46, 4, 6, vgrad(c, 40, 52, '#c8b080'));
        for (let i = 0; i < 3; i++) line(c, bx - 3, 42 + i * 3, bx + 3, 44 + i * 3, 0.7, '#8a7448');
      }
      bolts([
        [28, 42],
        [70, 42],
        [28, 50],
        [70, 50],
      ]);
      inked(c, 34, 44, 74, 12, 5.5, shade(wood, 1.1));
      line(c, 36, 42, 72, 13, 1, shade(wood, 1.45));
      disc(c, 76, 11, 8.6, INK);
      disc(c, 76, 11, 8, rgrad(c, 76, 11, 8, def.art.accent ?? '#9a9a9a'));
      disc(c, 76, 11, 5, rgrad(c, 75, 10, 5, '#8a8076'));
      oval(c, 34, 46, 7, 5, shade(team, 0.9));
    }
  } else {
    // Hide-covered ram house with stitched seams, iron-shod ram head.
    c.fillStyle = vgrad(c, 22, 52, shade(wood, 0.95));
    c.beginPath();
    c.moveTo(14, 52);
    c.lineTo(26, 24);
    c.lineTo(72, 24);
    c.lineTo(84, 52);
    c.closePath();
    c.fill();
    c.fillStyle = vgrad(c, 22, 40, '#a08060');
    c.beginPath();
    c.moveTo(19, 40);
    c.lineTo(26, 24);
    c.lineTo(72, 24);
    c.lineTo(79, 40);
    c.closePath();
    c.fill();
    c.setLineDash([1.2, 1.4]);
    for (let i = 0; i < 4; i++) line(c, 30 + i * 12, 25, 26 + i * 13.5, 39, 0.8, '#5a4030');
    c.setLineDash([]);
    for (let i = 0; i < 5; i++) line(c, 22 + i * 13, 41, 18 + i * 15, 51, 1.3, shade(wood, 0.7));
    line(c, 19, 40, 79, 40, 1.6, shade(wood, 0.6));
    const tip = def.art.accent ?? STEEL;
    if (def.id === 'frostram')
      for (let i = 0; i < 7; i++) {
        const ix = 22 + i * 9;
        c.fillStyle = 'rgba(230,246,255,0.9)';
        c.beginPath();
        c.moveTo(ix - 2, 24.5);
        c.lineTo(ix + 2, 24.5);
        c.lineTo(ix, 29 + (i % 3) * 2);
        c.closePath();
        c.fill();
      }
    inked(c, 60, 42, 76, 42, 6, shade(WOOD, 0.9));
    rr(c, 70, 35.5, 25, 13, 4.5, INK);
    rr(c, 70, 36, 24, 12, 4, dgrad(c, 70, 36, 94, 48, tip));
    line(c, 74, 36.5, 74, 47.5, 1.6, shade(tip, 0.65));
    oval(c, 85, 38.5, 5, 1.6, 'rgba(255,255,255,0.45)');
    // Curled horns on the ram head.
    c.strokeStyle = shade(tip, 0.75);
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(80, 42, 4, Math.PI * 0.9, Math.PI * 2.4);
    c.stroke();
  }
  for (const wx of [24, 74]) {
    disc(c, wx, 72, 12.6, INK);
    disc(c, wx, 72, 12, shade(WOOD, 0.6));
    disc(c, wx, 72, 9, vgrad(c, 63, 81, WOOD));
    c.strokeStyle = shade(WOOD, 0.55);
    c.lineWidth = 1.5;
    c.beginPath();
    for (let a = 0; a < 6; a++) {
      c.moveTo(wx, 72);
      c.lineTo(
        wx + Math.cos((a * Math.PI) / 3 + 0.3) * 9,
        72 + Math.sin((a * Math.PI) / 3 + 0.3) * 9,
      );
    }
    c.stroke();
    for (let a = 0; a < 8; a++)
      disc(
        c,
        wx + Math.cos((a * Math.PI) / 4) * 10.6,
        72 + Math.sin((a * Math.PI) / 4) * 10.6,
        0.8,
        STEEL,
      );
    disc(c, wx, 72, 3, rgrad(c, wx, 72, 3, GOLD));
  }
  // Team pennant with a woven edge.
  inked(c, 16, 52, 16, 14, 2.6, shade(WOOD, 0.8));
  c.fillStyle = vgrad(c, 14, 30, team);
  c.beginPath();
  c.moveTo(17, 14);
  c.lineTo(36, 20);
  c.lineTo(17, 28);
  c.closePath();
  c.fill();
  line(c, 17, 14, 36, 20, 1, shade(team, 1.5));
  disc(c, 16, 13, 1.8, GOLD);
}

// ───────────────────────── mythic creatures ─────────────────────────

function eye(c: Ctx, x: number, y: number, r: number, glow: string): void {
  disc(c, x, y, r * 2.2, `${glow}55`);
  disc(c, x, y, r, glow);
  disc(c, x - r * 0.3, y - r * 0.3, r * 0.35, '#ffffff');
}

/** Glowing crack: a soft wide stroke under a bright thin one along a polyline. */
function glowCrack(c: Ctx, pts: ReadonlyArray<readonly [number, number]>, col: string): void {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const [w, s] of [
    [3, `${col}66`],
    [1.1, '#fff4d0'],
  ] as const) {
    c.strokeStyle = s;
    c.lineWidth = w;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }
}

/** Faceted crystal/shard pointing from (x, y) towards angle `a` (radians, 0 = up). */
function shard(c: Ctx, x: number, y: number, len: number, w: number, a: number, col: string): void {
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const tx = x + dx * len;
  const ty = y + dy * len;
  c.fillStyle = shade(col, 0.8);
  c.beginPath();
  c.moveTo(x - dy * w, y + dx * w);
  c.lineTo(tx, ty);
  c.lineTo(x + dy * w, y - dx * w);
  c.closePath();
  c.fill();
  c.fillStyle = shade(col, 1.25);
  c.beginPath();
  c.moveTo(x - dy * w, y + dx * w);
  c.lineTo(tx, ty);
  c.lineTo(x, y);
  c.closePath();
  c.fill();
}

function giant(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  const ember = def.id === 'cinder_colossus';
  // Legs with knee plates and toes.
  for (const [x, col] of [
    [32, shade(b, 0.65)],
    [54, shade(b, 0.55)],
  ] as const) {
    rr(c, x - 0.6, 59.4, 14.2, 27.2, 5.5, INK);
    rr(c, x, 60, 13, 26, 5, vgrad(c, 60, 86, col));
    oval(c, x + 6.5, 71, 5, 3.5, shade(col, 1.25));
    for (let i = 0; i < 3; i++) oval(c, x + 4 + i * 3.6, 85.5, 1.8, 1.4, shade(col, 0.8));
  }
  // Back arm with fist.
  inked(c, 30, 34, 16, 62, 13, shade(b, 0.75));
  disc(c, 15, 64, 7.4, INK);
  disc(c, 15, 64, 6.8, rgrad(c, 15, 64, 6.8, shade(b, 0.72)));
  // Body with muscle lines.
  c.fillStyle = vgrad(c, 22, 70, b);
  c.beginPath();
  c.moveTo(26, 64);
  c.quadraticCurveTo(18, 30, 36, 24);
  c.quadraticCurveTo(50, 18, 66, 24);
  c.quadraticCurveTo(84, 32, 74, 64);
  c.closePath();
  c.fill();
  c.strokeStyle = shade(b, 0.7);
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(34, 40);
  c.quadraticCurveTo(43, 46, 50, 40);
  c.quadraticCurveTo(57, 46, 66, 40);
  c.moveTo(50, 42);
  c.lineTo(50, 56);
  c.moveTo(42, 50);
  c.lineTo(58, 50);
  c.stroke();
  oval(c, 42, 30, 9, 3.5, 'rgba(255,255,255,0.18)', -0.2);
  if (ember) {
    // Molten cracks glowing through the rock.
    glowCrack(
      c,
      [
        [36, 30],
        [41, 37],
        [38, 45],
        [44, 54],
      ],
      a,
    );
    glowCrack(
      c,
      [
        [63, 29],
        [58, 36],
        [64, 44],
        [60, 52],
      ],
      a,
    );
    glowCrack(
      c,
      [
        [48, 26],
        [52, 32],
        [50, 37],
      ],
      a,
    );
  }
  // Crystalline/ember plates.
  for (const [x, y, r] of [
    [38, 36, 6],
    [58, 32, 5],
    [62, 48, 6],
    [42, 52, 4],
  ] as const) {
    c.fillStyle = dgrad(c, x - r, y - r, x + r, y + r, a);
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
    c.fill();
    line(c, x - r * 0.5, y - r * 0.2, x, y - r * 0.8, 0.8, 'rgba(255,255,255,0.7)');
  }
  // Shoulder shards / ember spikes.
  for (const [x, y, ang, len] of [
    [31, 27, -0.5, 10],
    [37, 23, -0.15, 8],
    [64, 23, 0.2, 9],
    [70, 27, 0.55, 10],
  ] as const)
    shard(c, x, y, len, 3, ang, a);
  // Fur loincloth with a team belt.
  c.fillStyle = vgrad(c, 62, 74, ember ? '#3a2a24' : '#d8d4cc');
  c.beginPath();
  c.moveTo(28, 63);
  c.lineTo(72, 63);
  for (let i = 0; i <= 8; i++) c.lineTo(72 - i * 5.5, 70 + (i % 2) * 4);
  c.closePath();
  c.fill();
  rr(c, 28, 58, 44, 8, 4, vgrad(c, 58, 66, team));
  disc(c, 50, 62, 3, rgrad(c, 50, 62, 3, GOLD));
  // Head: brow ridge, glowing eyes, mouth and an icicle / ember beard.
  disc(c, 50, 18, 12.5, INK);
  disc(c, 50, 18, 12, rgrad(c, 50, 18, 12, shade(b, 1.1)));
  line(c, 41, 13, 59, 13, 3, shade(b, 0.75));
  eye(c, 54, 16, 2.4, a);
  eye(c, 46, 16, 2.4, a);
  c.fillStyle = ember ? a : shade(b, 0.4);
  c.beginPath();
  c.moveTo(44, 23);
  c.lineTo(56, 23);
  c.lineTo(54, 26);
  c.lineTo(46, 26);
  c.closePath();
  c.fill();
  for (let i = 0; i < 5; i++) {
    const bx = 41 + i * 4.5;
    c.fillStyle = ember ? (i % 2 ? '#ffb04a' : '#ff6a2a') : i % 2 ? '#f4fbff' : shade(a, 0.9);
    c.beginPath();
    c.moveTo(bx - 2.2, 26);
    c.lineTo(bx + 2.2, 26);
    c.lineTo(bx, 32 + (i % 2) * 3);
    c.closePath();
    c.fill();
  }
  // Front arm with knuckled fist.
  inked(c, 70, 34, 86, 58, 13, shade(b, 0.9));
  disc(c, 87, 60, 9.6, INK);
  disc(c, 87, 60, 9, rgrad(c, 87, 60, 9, shade(b, 0.8)));
  c.strokeStyle = shade(b, 0.55);
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    c.moveTo(85 + i * 2.5, 54);
    c.lineTo(85 + i * 2.5, 58);
  }
  c.stroke();
}

/** Point on a cubic Bézier. */
function bez(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function serpent(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  c.lineCap = 'round';
  const segs = [
    [8, 80, 30, 58, 48, 94, 62, 66],
    [62, 66, 70, 50, 60, 38, 74, 28],
  ] as const;
  const path = (): void => {
    c.beginPath();
    c.moveTo(8, 80);
    c.bezierCurveTo(30, 58, 48, 94, 62, 66);
    c.bezierCurveTo(70, 50, 60, 38, 74, 28);
  };
  // Dorsal fin spines along the back (drawn first, behind the body).
  c.fillStyle = shade(a, 0.85);
  c.beginPath();
  for (const sg of segs)
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const x = bez(t, sg[0], sg[2], sg[4], sg[6]);
      const y = bez(t, sg[1], sg[3], sg[5], sg[7]);
      const x2 = bez(t + 0.02, sg[0], sg[2], sg[4], sg[6]);
      const y2 = bez(t + 0.02, sg[1], sg[3], sg[5], sg[7]);
      const len = Math.hypot(x2 - x, y2 - y) || 1;
      const nx = (y2 - y) / len;
      const ny = -(x2 - x) / len;
      // Spines on the left of the direction of travel (tail to head): the back.
      c.moveTo(x - ((x2 - x) / len) * 4.5, y - ((y2 - y) / len) * 4.5);
      c.lineTo(x + nx * 14, y + ny * 14);
      c.lineTo(x + ((x2 - x) / len) * 4.5, y + ((y2 - y) / len) * 4.5);
    }
  c.fill();
  path();
  c.strokeStyle = 'rgba(30,20,12,0.8)';
  c.lineWidth = 21;
  c.stroke();
  path();
  c.strokeStyle = shade(b, 0.6);
  c.lineWidth = 19;
  c.stroke();
  path();
  c.strokeStyle = b;
  c.lineWidth = 14;
  c.stroke();
  // Scale bands across the body, a lit ridge and belly plates.
  c.setLineDash([2, 2.6]);
  path();
  c.strokeStyle = shade(b, 0.6);
  c.lineWidth = 16;
  c.stroke();
  c.setLineDash([]);
  path();
  c.strokeStyle = shade(b, 1.35);
  c.lineWidth = 4;
  c.stroke();
  c.setLineDash([3, 4]);
  path();
  c.strokeStyle = a;
  c.lineWidth = 3;
  c.stroke();
  c.setLineDash([]);
  // Frill of spines behind the head, then head with jaw, fangs and eye.
  for (let i = 0; i < 5; i++) shard(c, 72, 28, 12, 2.2, -1.9 + i * 0.45, i % 2 ? a : shade(b, 0.9));
  oval(c, 72, 30, 16.5, 12.5, INK, -0.3);
  oval(c, 72, 30, 16, 12, shade(b, 0.8), -0.3);
  oval(c, 85, 29, 9, 4, shade(b, 0.7), -0.1);
  oval(c, 82, 24, 13, 9, rgrad(c, 82, 24, 13, b), -0.2);
  c.fillStyle = '#f7f1e6';
  c.beginPath();
  c.moveTo(89, 28);
  c.lineTo(90, 33.5);
  c.lineTo(91.5, 28);
  c.moveTo(84, 29);
  c.lineTo(85, 32.5);
  c.lineTo(86, 29);
  c.fill();
  line(c, 92, 26, 96, 32, 1.6, '#c0302a');
  line(c, 96, 32, 97, 34, 1, '#c0302a');
  disc(c, 92.5, 21, 0.9, '#1a1410');
  line(c, 80, 19, 89, 17, 1.6, shade(b, 0.65));
  eye(c, 86, 20, 2.3, '#ffe066');
  rr(c, 62, 34, 15, 6, 3, team);
  line(c, 63, 37, 76, 37, 1, GOLD);
}

function beast(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  const hydra = def.id === 'hydrake';
  // Extra heads on long necks behind the main one (hydra).
  const sideHead = (nx: number, ny: number, hx: number, hy: number): void => {
    c.lineCap = 'round';
    c.strokeStyle = INK;
    c.lineWidth = 9.5;
    c.beginPath();
    c.moveTo(nx, ny);
    c.quadraticCurveTo(hx - 10, hy + 8, hx, hy);
    c.stroke();
    c.strokeStyle = shade(b, 0.78);
    c.lineWidth = 8;
    c.stroke();
    oval(c, hx + 3, hy - 1, 8, 5.5, rgrad(c, hx + 3, hy - 1, 8, shade(b, 0.85)), -0.2);
    oval(c, hx + 10, hy + 1, 4.5, 3, shade(b, 0.75), -0.1);
    shard(c, hx - 1, hy - 4, 7, 1.6, -0.9, a);
    eye(c, hx + 5, hy - 2.5, 1.5, a);
  };
  if (hydra) {
    sideHead(66, 46, 70, 16);
    sideHead(62, 48, 52, 22);
  }
  // Legs with clawed paws (far pair darker).
  animalLeg(c, 28, 60, 24, 8, shade(b, 0.6), true, 'paw');
  animalLeg(c, 64, 60, 24, 7.5, shade(b, 0.6), false, 'paw');
  // Tail: bushy for wolves, spiked for the hydra.
  if (hydra) {
    inked(c, 22, 52, 6, 40, 6, shade(b, 0.8));
    shard(c, 6, 40, 7, 2.5, -0.9, a);
    for (let i = 0; i < 3; i++) shard(c, 18 - i * 5, 46 - i * 3.5, 5, 1.8, -0.3, a);
  } else {
    c.fillStyle = vgrad(c, 32, 56, shade(b, 0.85));
    c.beginPath();
    c.moveTo(22, 46);
    c.quadraticCurveTo(10, 36, 4, 30);
    c.quadraticCurveTo(8, 44, 22, 56);
    c.closePath();
    c.fill();
    furStrands(c, 8, 34, 20, 48, 5, 3, shade(b, 0.6));
  }
  oval(c, 50, 56, 31.6, 16.6, INK);
  c.fillStyle = vgrad(c, 40, 72, b);
  c.beginPath();
  c.ellipse(50, 56, 31, 16, 0, 0, Math.PI * 2);
  c.fill();
  oval(c, 46, 64, 24, 5, 'rgba(10,6,0,0.14)');
  if (hydra) {
    // Scaled hide.
    c.strokeStyle = shade(b, 0.7);
    c.lineWidth = 0.8;
    c.beginPath();
    let row = 0;
    for (let y = 44; y < 68; y += 3.4, row++)
      for (let x = 24 + (row % 2) * 2.5; x < 76; x += 5) {
        c.moveTo(x + 2.5, y);
        c.arc(x, y, 2.5, 0, Math.PI);
      }
    c.stroke();
    for (let i = 0; i < 6; i++) shard(c, 28 + i * 8, 42 + Math.abs(i - 2.5), 5, 2, 0, a);
  } else furStrands(c, 22, 46, 66, 42, 12, 4, shade(b, 1.4));
  animalLeg(c, 38, 60, 24, 8.5, shade(b, 0.85), true, 'paw');
  animalLeg(c, 74, 60, 24, 8, shade(b, 0.85), false, 'paw');
  // Shaggy mane / neck ruff.
  for (let i = 0; i < 6; i++)
    oval(c, 60 + i * 3, 46 + (i % 2) * 3, 7, 9, shade(b, 0.8 + (i % 3) * 0.1));
  if (!hydra) furStrands(c, 58, 40, 76, 42, 7, 6, shade(b, 1.3));
  rr(c, 66, 48, 9, 16, 3, team);
  for (let i = 0; i < 3; i++) disc(c, 70.5, 51 + i * 5, 1, GOLD);
  // Head with ears / horns, open jaw with fangs, glowing eye.
  oval(c, 84, 44.5, 14.6, 12.6, INK);
  oval(c, 84, 44, 14, 12, rgrad(c, 84, 44, 14, b));
  if (hydra) {
    shard(c, 80, 35, 12, 2.4, -0.7, a);
    shard(c, 85, 34, 9, 2, -0.3, shade(a, 0.85));
  } else
    for (const [x, col] of [
      [77, shade(b, 0.7)],
      [82, shade(b, 0.85)],
    ] as const) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x, 36);
      c.lineTo(x + 3, 21);
      c.lineTo(x + 10, 34);
      c.fill();
    }
  oval(c, 95, 47, 7, 4.2, shade(b, 0.9));
  c.fillStyle = '#5a1a14';
  c.beginPath();
  c.moveTo(86, 51);
  c.lineTo(98, 50.5);
  c.lineTo(96, 55);
  c.lineTo(87, 55);
  c.closePath();
  c.fill();
  oval(c, 92, 56, 6.5, 2.4, shade(b, 0.8));
  c.fillStyle = '#f7f1e6';
  c.beginPath();
  for (const tx of [89, 92.5, 96]) {
    c.moveTo(tx - 1, 50.6);
    c.lineTo(tx, 53.4);
    c.lineTo(tx + 1, 50.6);
  }
  c.moveTo(90, 55.5);
  c.lineTo(91, 53);
  c.lineTo(92, 55.5);
  c.fill();
  disc(c, 98.2, 45.6, 1.1, '#1a1410');
  line(c, 82, 38, 91, 40, 1.8, shade(b, 0.6));
  eye(c, 88, 41.5, 2.2, a);
}

function flyer(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.3);
  const fire = def.id === 'sunbird';
  const wing = (x0: number, y0: number, tipx: number, tipy: number, back: boolean): void => {
    const base = shade(b, back ? 0.75 : 1);
    // Long primary feathers fanned along the trailing edge.
    for (let i = 0; i < 6; i++) {
      const t = 0.35 + i * 0.13;
      const px = x0 + (tipx - x0) * t;
      const py = y0 + (tipy - y0) * t + 4;
      const fl = 8 + i * 1.6;
      const ang = Math.atan2(tipy - y0, tipx - x0) + (tipx > x0 ? 1.2 : -1.2);
      const ex = px + Math.cos(ang) * fl * (tipx > x0 ? 1 : -1) * -0.3;
      const ey = py + fl * 0.85;
      c.fillStyle = shade(i % 2 ? base : shade(base, 0.92), 1);
      c.beginPath();
      c.ellipse(
        (px + ex) / 2,
        (py + ey) / 2,
        2.6,
        fl * 0.55,
        (tipx > x0 ? -0.5 : 0.5) + (ex - px) * 0.02,
        0,
        Math.PI * 2,
      );
      c.fill();
      if (fire) disc(c, ex, ey, 1.6, `${a}cc`);
    }
    c.fillStyle = vgrad(c, tipy, y0 + 8, base);
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + tipx) / 2, tipy - 6, tipx, tipy);
    c.lineTo(x0 + (tipx - x0) * 0.6, y0 + 6);
    c.lineTo(x0 + (tipx - x0) * 0.3, y0 + 10);
    c.closePath();
    c.fill();
    // Covert feather rows.
    c.strokeStyle = shade(base, 0.62);
    c.lineWidth = 0.9;
    c.beginPath();
    for (let r = 0; r < 2; r++)
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        const px = x0 + (tipx - x0) * t * (0.9 - r * 0.25);
        const py = y0 + (tipy - y0) * t * (0.9 - r * 0.25) + 2 + r * 3;
        c.moveTo(px + 2.2, py);
        c.arc(px, py, 2.2, 0, Math.PI);
      }
    c.stroke();
    for (let i = 1; i < 4; i++)
      line(
        c,
        x0,
        y0 + 2,
        x0 + (tipx - x0) * (i / 4),
        tipy + (y0 - tipy) * (i / 5),
        0.9,
        shade(base, 0.6),
      );
  };
  wing(52, 46, 92, 8, true);
  // Tail fan.
  for (let i = 0; i < 4; i++) {
    const ty = 44 + i * 3.5;
    c.fillStyle = vgrad(c, ty - 3, ty + 3, shade(i % 2 ? b : a, 0.85));
    c.beginPath();
    c.moveTo(28, 50);
    c.lineTo(5 + i, ty - 3 + i);
    c.lineTo(8 + i * 1.5, ty + 3 + i);
    c.closePath();
    c.fill();
  }
  oval(c, 50, 52, 24.5, 12.5, INK);
  oval(c, 50, 52, 24, 12, vgrad(c, 40, 64, b));
  furStrands(c, 34, 56, 64, 58, 7, 2.5, shade(b, 0.8), 0.8);
  rr(c, 38, 46, 16, 12, 4, team);
  line(c, 39, 49, 53, 49, 1, GOLD);
  // Head, crest (flame plumes or a golden horn), hooked beak, eye.
  if (fire)
    for (let i = 0; i < 4; i++)
      shard(c, 74 + i * 2, 33, 9 + i, 1.8, -0.9 + i * 0.25, i % 2 ? a : '#ff6a2a');
  else shard(c, 82, 33, 11, 1.8, 0.35, a);
  oval(c, 78, 40.5, 10.5, 9.5, INK);
  oval(c, 78, 40, 10, 9, rgrad(c, 78, 40, 10, b));
  c.fillStyle = dgrad(c, 86, 36, 98, 46, a);
  c.beginPath();
  c.moveTo(86, 37);
  c.quadraticCurveTo(96, 37, 98, 43);
  c.quadraticCurveTo(95, 41.5, 92, 43);
  c.lineTo(86, 46);
  c.closePath();
  c.fill();
  line(c, 87, 42, 93, 42, 0.8, shade(a, 0.6));
  disc(c, 81, 37, 2.4, '#fff7e0');
  eye(c, 81.5, 37, 1.5, '#2a1a10');
  wing(48, 46, 10, 10, false);
  // Talons.
  for (const lx of [44, 56]) {
    inked(c, lx, 62, lx - 2 + (lx > 50 ? 4 : 0), 74, 2.6, a);
    c.strokeStyle = shade(a, 0.6);
    c.lineWidth = 1.2;
    c.beginPath();
    for (const d of [-2.5, 0, 2.5]) {
      c.moveTo(lx - 2 + (lx > 50 ? 4 : 0), 74);
      c.lineTo(lx - 2 + (lx > 50 ? 4 : 0) + d, 76.5);
    }
    c.stroke();
  }
}

function construct(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? '#ffe58a';
  const scarab = def.faction === 'sahrun';
  const rivets = (pts: ReadonlyArray<readonly [number, number]>): void => {
    for (const [x, y] of pts) {
      disc(c, x, y, 1.1, shade(b, 0.55));
      disc(c, x - 0.3, y - 0.3, 0.7, shade(b, 1.4));
    }
  };
  // Legs with knee plates.
  for (const [x, col] of [
    [30, shade(b, 0.65)],
    [55, shade(b, 0.6)],
  ] as const) {
    rr(c, x - 0.6, 61.4, 16.2, 25.2, 3.5, INK);
    rr(c, x, 62, 15, 24, 3, vgrad(c, 62, 86, col));
    rr(c, x - 1, 68, 17, 6, 2, dgrad(c, x, 68, x + 16, 74, shade(col, 1.2)));
    line(c, x + 2, 80, x + 13, 80, 1, shade(col, 0.7));
  }
  rr(c, 9.4, 29.4, 15.2, 37.2, 5.5, INK);
  rr(c, 10, 30, 14, 36, 5, vgrad(c, 30, 66, shade(b, 0.8)));
  for (let i = 0; i < 3; i++) line(c, 11, 40 + i * 8, 23, 40 + i * 8, 1, shade(b, 0.55));
  rr(c, 21.4, 25.4, 57.2, 43.2, 7.5, INK);
  rr(c, 22, 26, 56, 42, 7, dgrad(c, 22, 26, 78, 68, b));
  // Panel seams with glowing lines, chest band.
  c.strokeStyle = shade(b, 0.6);
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(22, 40);
  c.lineTo(78, 40);
  c.moveTo(36, 40);
  c.lineTo(34, 68);
  c.moveTo(64, 40);
  c.lineTo(66, 68);
  c.stroke();
  glowCrack(
    c,
    [
      [26, 58],
      [36, 58],
      [40, 62],
      [60, 62],
      [64, 58],
      [74, 58],
    ],
    a,
  );
  trimBand(c, 23, 27.5, 77, 3.6, shade(b, 0.7), 'key', shade(a, 0.9));
  rivets([
    [27, 31],
    [73, 31],
    [27, 63],
    [73, 63],
    [27, 45],
    [73, 45],
    [40, 66],
    [60, 66],
  ]);
  // Head with visor slit and glowing eyes.
  rr(c, 33.4, 5.4, 33.2, 23.2, 5.5, INK);
  rr(c, 34, 6, 32, 22, 5, dgrad(c, 34, 6, 66, 28, shade(b, 1.1)));
  rr(c, 37, 13, 26, 6, 3, shade(b, 0.4));
  eye(c, 43, 16, 2.6, a);
  eye(c, 57, 16, 2.6, a);
  line(c, 40, 23, 60, 23, 1, shade(b, 0.6));
  if (scarab) {
    // Scarab crest on the head.
    oval(c, 50, 6.5, 6, 3.2, dgrad(c, 44, 3, 56, 9, a));
  } else rr(c, 47, 3, 6, 4, 2, team);
  oval(c, 40, 9, 5, 1.6, 'rgba(255,255,255,0.3)');
  rr(c, 75.4, 29.4, 15.2, 37.2, 5.5, INK);
  rr(c, 76, 30, 14, 36, 5, vgrad(c, 30, 66, shade(b, 0.85)));
  for (let i = 0; i < 3; i++) line(c, 77, 40 + i * 8, 89, 40 + i * 8, 1, shade(b, 0.55));
  // Shoulder pauldrons.
  for (const x of [17, 83]) oval(c, x, 31, 9, 6, dgrad(c, x - 9, 25, x + 9, 37, shade(b, 1.05)));
  // Core: team disc in a ray frame (scarab wings for the Sahrun one).
  if (scarab)
    for (const dir of [-1, 1]) {
      c.fillStyle = dgrad(c, 50, 40, 50 + dir * 16, 54, a);
      c.beginPath();
      c.moveTo(50, 44);
      c.quadraticCurveTo(50 + dir * 18, 38, 50 + dir * 17, 50);
      c.quadraticCurveTo(50 + dir * 10, 48, 50, 50);
      c.closePath();
      c.fill();
    }
  else {
    c.strokeStyle = a;
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      c.moveTo(50 + Math.cos(ang) * 10, 46 + Math.sin(ang) * 10);
      c.lineTo(50 + Math.cos(ang) * 13, 46 + Math.sin(ang) * 13);
    }
    c.stroke();
  }
  disc(c, 50, 46, 9, shade(team, 0.5));
  disc(c, 50, 46, 7, rgrad(c, 50, 46, 7, team));
  disc(c, 48, 44, 2, 'rgba(255,255,255,0.55)');
}

/** Projectile sprites (drawn at ART_RES). */
export function drawProjectile(kind: 'arrow' | 'stone' | 'orb'): HTMLCanvasElement {
  const S = 24 * ART_RES;
  const [cv, c] = createCanvas(S, S);
  c.scale(ART_RES, ART_RES);
  if (kind === 'arrow') {
    line(c, 2, 12, 20, 12, 2, WOOD);
    c.fillStyle = STEEL;
    c.beginPath();
    c.moveTo(23, 12);
    c.lineTo(17, 9);
    c.lineTo(17, 15);
    c.fill();
    line(c, 2, 12, 6, 9, 2, '#f3ead8');
    line(c, 2, 12, 6, 15, 2, '#f3ead8');
  } else if (kind === 'stone') {
    disc(c, 12, 12, 6.5, rgrad(c, 12, 12, 6.5, '#8a8076'));
  } else {
    disc(c, 12, 12, 10, 'rgba(255,240,160,0.35)');
    disc(c, 12, 12, 6, rgrad(c, 12, 12, 6, '#fff3b0'));
  }
  return cv;
}
