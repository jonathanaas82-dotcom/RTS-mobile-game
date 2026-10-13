import type { FactionId, UnitDef } from '../../../data/types';
import { TILE_PX } from '../tileset';
import {
  ART_RES,
  createCanvas,
  dgrad,
  mix,
  outlined,
  rgrad,
  shade,
  softShadow,
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

/**
 * Draw a unit facing right on a transparent canvas: shaded figure with a dark outline and a soft
 * contact shadow. Anchor convention: feet at (0.5, 0.86) of the canvas.
 */
export function drawUnit(def: UnitDef, team: string): HTMLCanvasElement {
  const scale = def.art.scale ?? 1;
  const S = Math.round(BASE * scale);
  const [fig, c] = createCanvas(S, S);
  c.save();
  c.scale(S / 100, S / 100); // draw in a 100×100 design box
  switch (def.art.shape) {
    case 'humanoid':
      humanoid(c, def, team, 50, 86, 1);
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
  const [out, oc] = createCanvas(S, S);
  const flying = def.art.shape === 'flyer';
  softShadow(oc, S * 0.5, S * 0.87, S * (flying ? 0.2 : 0.27), S * 0.07, flying ? 0.25 : 0.4);
  oc.drawImage(outlined(fig, Math.max(2, S / 48)), 0, 0);
  return out;
}

// ───────────────────────── humanoids ─────────────────────────

/** Faction headwear by role. */
function head(c: Ctx, def: UnitDef, fx: number, hy: number, s: (v: number) => number): void {
  const f = def.faction;
  const skin = SKIN[f];
  const military = def.cls !== 'worker';
  // Face with soft shading, eye and nose (facing right).
  disc(c, fx, hy, s(10), rgrad(c, fx, hy, s(10), skin));
  disc(c, fx + s(5), hy - s(1), s(1.5), '#2a1d14');
  oval(c, fx + s(9.5), hy + s(1.5), s(1.6), s(2.2), shade(skin, 0.85));
  if (f === 'hrimfolk') {
    // Braided beard.
    c.fillStyle = HAIR[f];
    c.beginPath();
    c.moveTo(fx - s(4), hy + s(3));
    c.quadraticCurveTo(fx + s(4), hy + s(16), fx + s(9), hy + s(4));
    c.quadraticCurveTo(fx + s(3), hy + s(7), fx - s(4), hy + s(3));
    c.fill();
    if (military) {
      // Rounded iron helm with nose guard.
      c.fillStyle = dgrad(
        c,
        fx - s(10),
        hy - s(14),
        fx + s(10),
        hy,
        def.cls === 'hero' ? '#d8dde6' : STEEL,
      );
      c.beginPath();
      c.arc(fx, hy - s(2), s(11), Math.PI * 1.02, Math.PI * 1.98);
      c.closePath();
      c.fill();
      rr(c, fx - s(11), hy - s(3.5), s(22), s(3), s(1.5), shade(STEEL, 0.75));
      rr(c, fx + s(5.5), hy - s(3), s(2.5), s(8), s(1), shade(STEEL, 0.8));
      if (def.cls === 'hero') rr(c, fx - s(11), hy - s(3.5), s(22), s(2), s(1), GOLD);
    } else {
      // Fur cap.
      c.fillStyle = vgrad(c, hy - s(14), hy - s(2), '#8a6a48');
      c.beginPath();
      c.ellipse(fx - s(1), hy - s(6), s(11), s(7), 0, Math.PI, 0);
      c.fill();
    }
  } else if (f === 'aurelian') {
    if (military) {
      // Bronze helmet with cheek guard and a tall crest.
      const helm = def.cls === 'hero' ? GOLD : BRONZE;
      c.fillStyle = dgrad(c, fx - s(11), hy - s(13), fx + s(10), hy + s(4), helm);
      c.beginPath();
      c.arc(fx, hy - s(1), s(11), Math.PI * 0.95, Math.PI * 2.05);
      c.lineTo(fx + s(4), hy + s(6));
      c.lineTo(fx - s(9), hy + s(6));
      c.closePath();
      c.fill();
      disc(c, fx + s(5), hy - s(1), s(1.5), '#1a120c');
      c.fillStyle = vgrad(c, hy - s(26), hy - s(9), def.cls === 'hero' ? '#f3e6c4' : '#b0473a');
      c.beginPath();
      c.moveTo(fx - s(12), hy - s(10));
      c.quadraticCurveTo(fx - s(4), hy - s(28), fx + s(9), hy - s(13));
      c.quadraticCurveTo(fx - s(2), hy - s(17), fx - s(12), hy - s(10));
      c.fill();
    } else {
      c.fillStyle = HAIR[f];
      c.beginPath();
      c.arc(fx - s(1), hy - s(2), s(10.5), Math.PI * 0.9, Math.PI * 1.95);
      c.fill();
      // Laurel band.
      c.strokeStyle = '#6f9a3a';
      c.lineWidth = s(2.2);
      c.beginPath();
      c.arc(fx, hy - s(1), s(10), Math.PI * 1.05, Math.PI * 1.9);
      c.stroke();
    }
  } else {
    // Sahrun: striped headcloth falling to the shoulders; heroes wear a tall golden crown.
    const cloth = military ? '#2f5fa0' : '#efe6cf';
    c.fillStyle = vgrad(c, hy - s(12), hy + s(10), cloth);
    c.beginPath();
    c.moveTo(fx - s(11), hy + s(9));
    c.lineTo(fx - s(12), hy - s(4));
    c.arc(fx, hy - s(3), s(11), Math.PI, Math.PI * 2);
    c.lineTo(fx + s(6), hy + s(1));
    c.lineTo(fx - s(5), hy + s(9));
    c.closePath();
    c.fill();
    if (military) {
      for (let i = 0; i < 3; i++)
        line(
          c,
          fx - s(10) + i * s(1.5),
          hy - s(6) + i * s(5),
          fx - s(4) + i * s(1.5),
          hy - s(6) + i * s(5),
          s(1.6),
          GOLD,
        );
    }
    if (def.cls === 'hero') {
      c.fillStyle = dgrad(c, fx - s(8), hy - s(26), fx + s(8), hy - s(10), GOLD);
      c.beginPath();
      c.moveTo(fx - s(8), hy - s(11));
      c.lineTo(fx - s(5), hy - s(26));
      c.lineTo(fx + s(5), hy - s(26));
      c.lineTo(fx + s(8), hy - s(11));
      c.closePath();
      c.fill();
      disc(c, fx, hy - s(18), s(2.5), '#2f5fa0');
    }
  }
}

function weapon(c: Ctx, def: UnitDef, hx: number, hy: number, s: (v: number) => number): void {
  const w = def.art.weapon ?? 'none';
  const metal = def.faction === 'aurelian' ? BRONZE : STEEL;
  switch (w) {
    case 'spear':
      line(c, hx - s(2), hy + s(16), hx + s(8), hy - s(42), s(3), WOOD);
      c.fillStyle = dgrad(c, hx + s(4), hy - s(54), hx + s(12), hy - s(40), metal);
      c.beginPath();
      c.moveTo(hx + s(9.5), hy - s(55));
      c.lineTo(hx + s(13), hy - s(41));
      c.lineTo(hx + s(5), hy - s(42.5));
      c.closePath();
      c.fill();
      break;
    case 'sword': {
      const g = c.createLinearGradient(hx, hy, hx + s(18), hy - s(26));
      g.addColorStop(0, '#eef2f7');
      g.addColorStop(1, '#9aa3ad');
      if (def.faction === 'sahrun') {
        // Curved khopesh.
        c.strokeStyle = g;
        c.lineWidth = s(4);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(hx, hy);
        c.lineTo(hx + s(8), hy - s(12));
        c.quadraticCurveTo(hx + s(20), hy - s(22), hx + s(12), hy - s(30));
        c.stroke();
      } else line(c, hx, hy, hx + s(16), hy - s(26), s(4.2), g);
      line(c, hx - s(4), hy + s(2), hx + s(4), hy - s(5), s(3), GOLD);
      break;
    }
    case 'axe':
      line(c, hx - s(1), hy + s(8), hx + s(10), hy - s(24), s(3.2), WOOD);
      c.fillStyle = dgrad(c, hx + s(6), hy - s(30), hx + s(22), hy - s(10), STEEL);
      c.beginPath();
      c.moveTo(hx + s(7), hy - s(20));
      c.quadraticCurveTo(hx + s(26), hy - s(30), hx + s(19), hy - s(8));
      c.quadraticCurveTo(hx + s(14), hy - s(15), hx + s(7), hy - s(13));
      c.closePath();
      c.fill();
      break;
    case 'bow':
      c.strokeStyle = def.faction === 'sahrun' ? '#5a3a1e' : WOOD;
      c.lineWidth = s(3.2);
      c.beginPath();
      c.arc(hx - s(4), hy - s(2), s(18), -1.15, 1.15);
      c.stroke();
      line(c, hx + s(3.5), hy - s(18.5), hx + s(3.5), hy + s(14.5), s(1), '#f3ead8');
      line(c, hx - s(10), hy - s(2), hx + s(10), hy - s(2), s(1.6), '#d8c385');
      break;
    case 'sling':
      line(c, hx, hy, hx + s(9), hy - s(18), s(1.6), WOOD);
      disc(c, hx + s(10), hy - s(19), s(3.2), rgrad(c, hx + s(10), hy - s(19), s(3.2), '#8a8a8a'));
      break;
    case 'staff':
      line(c, hx, hy + s(22), hx + s(3), hy - s(34), s(3), WOOD);
      disc(c, hx + s(3), hy - s(38), s(7), 'rgba(255,230,140,0.35)');
      disc(
        c,
        hx + s(3),
        hy - s(38),
        s(5),
        rgrad(c, hx + s(3), hy - s(38), s(5), def.art.accent ?? GOLD),
      );
      break;
    case 'tool':
      line(c, hx, hy + s(6), hx + s(8), hy - s(20), s(3), WOOD);
      c.fillStyle = dgrad(c, hx - s(4), hy - s(24), hx + s(18), hy - s(14), STEEL);
      c.beginPath();
      c.moveTo(hx - s(4), hy - s(19));
      c.quadraticCurveTo(hx + s(7), hy - s(26), hx + s(18), hy - s(16));
      c.quadraticCurveTo(hx + s(7), hy - s(21), hx - s(4), hy - s(19));
      c.fill();
      break;
    default:
      break;
  }
}

/** Humanoid with feet at (fx, fy); `k` scales it (riders use a smaller one). */
function humanoid(c: Ctx, def: UnitDef, team: string, fx: number, fy: number, k: number): void {
  const s = (v: number): number => v * k;
  const body = def.art.body;
  const f = def.faction;
  const skin = SKIN[f];
  const pants = shade(body, 0.55);
  const military = def.cls !== 'worker';
  // Hero cape behind everything.
  if (def.cls === 'hero') {
    c.fillStyle = vgrad(c, fy - s(52), fy - s(6), team, 1.1, 0.6);
    c.beginPath();
    c.moveTo(fx - s(9), fy - s(50));
    c.quadraticCurveTo(fx - s(24), fy - s(20), fx - s(18), fy - s(6));
    c.lineTo(fx + s(2), fy - s(14));
    c.lineTo(fx + s(4), fy - s(48));
    c.closePath();
    c.fill();
  }
  // Back arm.
  line(c, fx - s(8), fy - s(44), fx - s(14), fy - s(26), s(6), shade(skin, 0.8));
  // Legs with boots.
  rr(c, fx - s(9), fy - s(24), s(7.5), s(20), s(3), vgrad(c, fy - s(24), fy - s(4), pants));
  rr(
    c,
    fx + s(1.5),
    fy - s(24),
    s(7.5),
    s(20),
    s(3),
    vgrad(c, fy - s(24), fy - s(4), shade(pants, 0.9)),
  );
  rr(c, fx - s(10), fy - s(7), s(9.5), s(7), s(2.5), LEATHER);
  rr(c, fx + s(1), fy - s(7), s(10.5), s(7), s(2.5), shade(LEATHER, 0.85));
  // Torso: armour/clothes with a team-coloured tabard and belt.
  const torsoColor = military && f === 'hrimfolk' ? mix(body, STEEL, 0.25) : body;
  c.fillStyle = vgrad(c, fy - s(52), fy - s(20), torsoColor);
  c.beginPath();
  c.moveTo(fx - s(13), fy - s(20));
  c.lineTo(fx - s(12), fy - s(46));
  c.quadraticCurveTo(fx, fy - s(54), fx + s(12), fy - s(46));
  c.lineTo(fx + s(13), fy - s(20));
  c.closePath();
  c.fill();
  c.fillStyle = vgrad(c, fy - s(48), fy - s(18), team, 1.25, 0.75);
  c.beginPath();
  c.moveTo(fx - s(6), fy - s(48));
  c.lineTo(fx + s(6), fy - s(48));
  c.lineTo(fx + s(7), fy - s(17));
  c.lineTo(fx, fy - s(20));
  c.lineTo(fx - s(7), fy - s(17));
  c.closePath();
  c.fill();
  // Small emblem on the tabard.
  disc(c, fx, fy - s(38), s(2.6), shade(team, 1.6));
  rr(c, fx - s(13), fy - s(26), s(26), s(4), s(2), LEATHER);
  rr(c, fx - s(2), fy - s(26.5), s(4), s(5), s(1), GOLD);
  if (military && def.cls !== 'ranged') {
    // Shoulder plates.
    oval(
      c,
      fx - s(10),
      fy - s(46),
      s(5),
      s(4),
      dgrad(c, fx - s(15), fy - s(50), fx - s(5), fy - s(42), f === 'aurelian' ? BRONZE : STEEL),
    );
  }
  head(c, def, fx, fy - s(60), s);
  // Front arm + hand holding the weapon.
  const hx = fx + s(14);
  const hy = fy - s(36);
  line(c, fx + s(8), fy - s(46), hx, hy, s(6), shade(skin, 0.95));
  weapon(c, def, hx, hy, s);
  disc(c, hx, hy, s(3.6), rgrad(c, hx, hy, s(3.6), skin));
  // Shield on the off-hand for melee soldiers and heroes.
  if (def.cls === 'infantry' || (def.cls === 'hero' && def.art.weapon !== 'staff')) {
    const sx = fx - s(13);
    const sy = fy - s(34);
    if (f === 'sahrun') {
      oval(c, sx, sy, s(9), s(14), shade(team, 0.55));
      oval(c, sx, sy, s(7), s(12), vgrad(c, sy - s(12), sy + s(12), team));
      line(c, sx, sy - s(10), sx, sy + s(10), s(2), GOLD);
    } else {
      const r = f === 'aurelian' ? 13 : 11.5;
      disc(c, sx, sy, s(r), f === 'aurelian' ? BRONZE : shade(WOOD, 0.9));
      disc(c, sx, sy, s(r - 2.5), rgrad(c, sx, sy, s(r - 2.5), team));
      if (f === 'hrimfolk') {
        line(c, sx - s(8), sy, sx + s(8), sy, s(1.5), shade(team, 0.6));
        line(c, sx, sy - s(8), sx, sy + s(8), s(1.5), shade(team, 0.6));
      } else {
        // Painted emblem: a simple stylised eye.
        oval(c, sx, sy, s(5), s(2.6), shade(team, 1.7));
        disc(c, sx, sy, s(1.6), shade(team, 0.4));
      }
      disc(c, sx, sy, s(2.5), rgrad(c, sx, sy, s(2.5), GOLD));
    }
  }
  if (def.cls === 'ranged' && def.art.weapon === 'bow') {
    // Quiver on the back.
    rr(c, fx - s(15), fy - s(52), s(6), s(18), s(2), LEATHER);
    for (let i = 0; i < 3; i++)
      line(
        c,
        fx - s(13) + i * s(1.8),
        fy - s(52),
        fx - s(14) + i * s(1.8),
        fy - s(57),
        s(1.4),
        '#efe6cf',
      );
  }
}

// ───────────────────────── riders & engines ─────────────────────────

function mount(c: Ctx, kind: 'horse' | 'wolf', color: string, x: number, y: number): void {
  const dark = shade(color, 0.7);
  // Legs (far pair darker).
  for (const [lx, d] of [
    [x - 16, dark],
    [x + 12, dark],
    [x - 10, color],
    [x + 18, color],
  ] as const) {
    line(c, lx, y + 4, lx - 1, y + 26, 5, d);
    oval(c, lx - 1, y + 26, 3.2, 2, '#2a2018');
  }
  // Body.
  oval(c, x, y, 25, 12, vgrad(c, y - 12, y + 12, color));
  // Tail.
  if (kind === 'wolf') {
    c.fillStyle = vgrad(c, y - 16, y, color);
    c.beginPath();
    c.moveTo(x - 22, y - 4);
    c.quadraticCurveTo(x - 38, y - 14, x - 36, y - 2);
    c.quadraticCurveTo(x - 30, y + 2, x - 22, y + 2);
    c.fill();
  } else line(c, x - 23, y - 4, x - 30, y + 14, 5, shade(color, 0.5));
  // Neck + head.
  c.fillStyle = vgrad(c, y - 30, y, color);
  c.beginPath();
  c.moveTo(x + 14, y - 8);
  c.lineTo(x + 26, y - 26);
  c.lineTo(x + 34, y - 22);
  c.lineTo(x + 24, y + 2);
  c.closePath();
  c.fill();
  if (kind === 'wolf') {
    oval(c, x + 33, y - 23, 10, 7, rgrad(c, x + 33, y - 23, 10, color));
    c.fillStyle = dark;
    c.beginPath();
    c.moveTo(x + 27, y - 28);
    c.lineTo(x + 29, y - 38);
    c.lineTo(x + 34, y - 29);
    c.fill();
    oval(c, x + 42, y - 21, 5, 3.5, shade(color, 0.9));
    disc(c, x + 35, y - 25, 1.6, '#ffd84a');
  } else {
    oval(c, x + 35, y - 24, 9, 6, rgrad(c, x + 35, y - 24, 9, color), 0.4);
    disc(c, x + 34, y - 27, 1.4, '#140c08');
    // Mane.
    line(c, x + 22, y - 24, x + 15, y - 6, 4, shade(color, 0.45));
  }
}

function rider(c: Ctx, def: UnitDef, team: string): void {
  const f = def.faction;
  if (f === 'sahrun') {
    // Chariot: horse pulling a light car with a standing archer.
    mount(c, 'horse', '#c9a46a', 64, 58);
    line(c, 30, 64, 50, 58, 3, WOOD);
    rr(c, 8, 50, 30, 24, 6, vgrad(c, 50, 74, def.art.body));
    rr(c, 8, 50, 30, 5, 3, team);
    disc(c, 22, 78, 11, shade(WOOD, 0.7));
    disc(c, 22, 78, 8, shade(WOOD, 1.1));
    for (let a = 0; a < 6; a++)
      line(c, 22, 78, 22 + Math.cos(a) * 8, 78 + Math.sin(a) * 8, 1.5, shade(WOOD, 0.6));
    disc(c, 22, 78, 2.5, GOLD);
    humanoid(c, def, team, 24, 54, 0.6);
    return;
  }
  const kind = f === 'hrimfolk' ? 'wolf' : 'horse';
  mount(c, kind, def.art.body, 52, 58);
  // Saddle cloth in team colour.
  c.fillStyle = vgrad(c, 46, 64, team);
  c.beginPath();
  c.moveTo(40, 48);
  c.lineTo(62, 48);
  c.lineTo(60, 66);
  c.lineTo(42, 66);
  c.closePath();
  c.fill();
  humanoid(c, def, team, 52, 56, 0.6);
}

function engine(c: Ctx, def: UnitDef, team: string): void {
  const wood = def.art.body;
  const ranged = !!def.attack && def.attack.range > 2;
  // Chassis.
  rr(c, 10, 52, 78, 16, 4, vgrad(c, 52, 68, wood));
  for (let i = 0; i < 4; i++) line(c, 16 + i * 20, 53, 16 + i * 20, 67, 1.5, shade(wood, 0.6));
  if (ranged) {
    if (def.faction === 'sahrun') {
      // Sun lens: a big polished disc on a frame.
      line(c, 50, 52, 50, 26, 6, shade(wood, 0.8));
      disc(c, 52, 22, 17, '#8a6a1a');
      const g = c.createRadialGradient(46, 16, 2, 52, 22, 15);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.5, def.art.accent ?? '#ffe58a');
      g.addColorStop(1, '#c08a20');
      disc(c, 52, 22, 14, g);
    } else {
      // Torsion arm + bucket.
      rr(c, 26, 40, 46, 12, 3, vgrad(c, 40, 52, shade(wood, 0.9)));
      line(c, 34, 44, 74, 12, 6, vgrad(c, 12, 44, shade(wood, 1.1)));
      disc(c, 76, 11, 8, rgrad(c, 76, 11, 8, def.art.accent ?? '#9a9a9a'));
      oval(c, 34, 46, 7, 5, shade(team, 0.9));
    }
  } else {
    // Covered ram with a metal head.
    c.fillStyle = vgrad(c, 22, 52, shade(wood, 0.95));
    c.beginPath();
    c.moveTo(14, 52);
    c.lineTo(26, 24);
    c.lineTo(72, 24);
    c.lineTo(84, 52);
    c.closePath();
    c.fill();
    for (let i = 0; i < 5; i++) line(c, 28 + i * 10, 25, 22 + i * 12, 51, 1.5, shade(wood, 0.7));
    rr(c, 70, 36, 24, 12, 4, dgrad(c, 70, 36, 94, 48, def.art.accent ?? STEEL));
  }
  for (const wx of [24, 74]) {
    disc(c, wx, 72, 12, shade(WOOD, 0.6));
    disc(c, wx, 72, 9, vgrad(c, 63, 81, WOOD));
    disc(c, wx, 72, 3, GOLD);
  }
  // Team pennant.
  line(c, 16, 52, 16, 14, 3, shade(WOOD, 0.8));
  c.fillStyle = vgrad(c, 14, 30, team);
  c.beginPath();
  c.moveTo(17, 14);
  c.lineTo(36, 20);
  c.lineTo(17, 28);
  c.closePath();
  c.fill();
}

// ───────────────────────── mythic creatures ─────────────────────────

function eye(c: Ctx, x: number, y: number, r: number, glow: string): void {
  disc(c, x, y, r * 2.2, `${glow}55`);
  disc(c, x, y, r, glow);
  disc(c, x - r * 0.3, y - r * 0.3, r * 0.35, '#ffffff');
}

function giant(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  rr(c, 32, 60, 13, 26, 5, vgrad(c, 60, 86, shade(b, 0.65)));
  rr(c, 54, 60, 13, 26, 5, vgrad(c, 60, 86, shade(b, 0.55)));
  line(c, 30, 34, 16, 62, 13, shade(b, 0.75));
  c.fillStyle = vgrad(c, 22, 70, b);
  c.beginPath();
  c.moveTo(26, 64);
  c.quadraticCurveTo(18, 30, 36, 24);
  c.quadraticCurveTo(50, 18, 66, 24);
  c.quadraticCurveTo(84, 32, 74, 64);
  c.closePath();
  c.fill();
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
  }
  rr(c, 28, 58, 44, 8, 4, vgrad(c, 58, 66, team));
  disc(c, 50, 18, 12, rgrad(c, 50, 18, 12, shade(b, 1.1)));
  eye(c, 54, 16, 2.4, a);
  eye(c, 46, 16, 2.4, a);
  line(c, 70, 34, 86, 58, 13, shade(b, 0.9));
  disc(c, 87, 60, 9, rgrad(c, 87, 60, 9, shade(b, 0.8)));
}

function serpent(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  c.lineCap = 'round';
  const path = (): void => {
    c.beginPath();
    c.moveTo(8, 80);
    c.bezierCurveTo(30, 58, 48, 94, 62, 66);
    c.bezierCurveTo(70, 50, 60, 38, 74, 28);
  };
  path();
  c.strokeStyle = shade(b, 0.6);
  c.lineWidth = 20;
  c.stroke();
  path();
  c.strokeStyle = b;
  c.lineWidth = 15;
  c.stroke();
  path();
  c.strokeStyle = shade(b, 1.35);
  c.lineWidth = 5;
  c.stroke();
  // Belly scales.
  c.setLineDash([3, 4]);
  path();
  c.strokeStyle = a;
  c.lineWidth = 3;
  c.stroke();
  c.setLineDash([]);
  // Hood/frills and head.
  oval(c, 72, 30, 16, 12, shade(b, 0.8), -0.3);
  oval(c, 82, 24, 13, 9, rgrad(c, 82, 24, 13, b), -0.2);
  eye(c, 86, 20, 2.3, '#ffe066');
  line(c, 93, 27, 97, 33, 2, '#fff');
  rr(c, 62, 34, 15, 6, 3, team);
}

function beast(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  for (const [lx, d] of [
    [28, 0.6],
    [64, 0.6],
    [38, 0.85],
    [74, 0.85],
  ] as const) {
    line(c, lx, 60, lx - 2, 84, 8, shade(b, d));
    oval(c, lx - 2, 85, 5, 2.5, '#1a1410');
  }
  c.fillStyle = vgrad(c, 40, 72, b);
  c.beginPath();
  c.ellipse(50, 56, 31, 16, 0, 0, Math.PI * 2);
  c.fill();
  // Shaggy mane.
  for (let i = 0; i < 6; i++)
    oval(c, 60 + i * 3, 46 + (i % 2) * 3, 7, 9, shade(b, 0.8 + (i % 3) * 0.1));
  line(c, 22, 50, 6, 36, 7, shade(b, 0.8));
  oval(c, 84, 44, 14, 12, rgrad(c, 84, 44, 14, b));
  c.fillStyle = shade(b, 0.7);
  c.beginPath();
  c.moveTo(77, 36);
  c.lineTo(80, 21);
  c.lineTo(87, 34);
  c.fill();
  oval(c, 95, 49, 7, 5, shade(b, 0.9));
  eye(c, 88, 41, 2.2, a);
  line(c, 90, 54, 96, 54, 1.5, '#fff');
  rr(c, 66, 48, 9, 16, 3, team);
}

function flyer(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.3);
  const wing = (x0: number, y0: number, tipx: number, tipy: number, back: boolean): void => {
    c.fillStyle = vgrad(c, tipy, y0 + 8, shade(b, back ? 0.75 : 1));
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + tipx) / 2, tipy - 6, tipx, tipy);
    c.lineTo(x0 + (tipx - x0) * 0.6, y0 + 6);
    c.lineTo(x0 + (tipx - x0) * 0.3, y0 + 10);
    c.closePath();
    c.fill();
    for (let i = 1; i < 4; i++)
      line(
        c,
        x0,
        y0 + 2,
        x0 + (tipx - x0) * (i / 4),
        tipy + (y0 - tipy) * (i / 5),
        1.2,
        shade(b, 0.6),
      );
  };
  wing(52, 46, 92, 8, true);
  oval(c, 50, 52, 24, 12, vgrad(c, 40, 64, b));
  rr(c, 38, 46, 16, 12, 4, team);
  oval(c, 78, 40, 10, 9, rgrad(c, 78, 40, 10, b));
  c.fillStyle = a;
  c.beginPath();
  c.moveTo(86, 38);
  c.lineTo(98, 42);
  c.lineTo(86, 46);
  c.fill();
  eye(c, 81, 37, 2, '#2a1a10');
  c.fillStyle = vgrad(c, 50, 66, shade(b, 0.8));
  c.beginPath();
  c.moveTo(26, 50);
  c.lineTo(6, 44);
  c.lineTo(10, 56);
  c.closePath();
  c.fill();
  wing(48, 46, 10, 10, false);
  line(c, 44, 62, 42, 74, 3, a);
  line(c, 56, 62, 58, 74, 3, a);
}

function construct(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? '#ffe58a';
  rr(c, 30, 62, 15, 24, 3, vgrad(c, 62, 86, shade(b, 0.65)));
  rr(c, 55, 62, 15, 24, 3, vgrad(c, 62, 86, shade(b, 0.6)));
  rr(c, 10, 30, 14, 36, 5, vgrad(c, 30, 66, shade(b, 0.8)));
  rr(c, 22, 26, 56, 42, 7, dgrad(c, 22, 26, 78, 68, b));
  rr(c, 34, 6, 32, 22, 5, dgrad(c, 34, 6, 66, 28, shade(b, 1.1)));
  eye(c, 43, 16, 2.6, a);
  eye(c, 57, 16, 2.6, a);
  rr(c, 76, 30, 14, 36, 5, vgrad(c, 30, 66, shade(b, 0.85)));
  disc(c, 50, 46, 9, shade(team, 0.5));
  disc(c, 50, 46, 7, rgrad(c, 50, 46, 7, team));
  for (const [x, y] of [
    [27, 31],
    [73, 31],
    [27, 63],
    [73, 63],
  ] as const)
    disc(c, x, y, 2.4, rgrad(c, x, y, 2.4, a));
  line(c, 22, 40, 78, 40, 1.5, shade(b, 0.6));
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
