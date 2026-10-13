import type { UnitDef } from '../../../data/types';
import { TILE_PX } from '../tileset';
import { circle, createCanvas, ellipse } from './draw';

type Ctx = CanvasRenderingContext2D;

/** Base canvas size for a scale-1 unit (a worker is roughly 0.6 tiles tall). */
const BASE = Math.round(TILE_PX * 0.9);

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function line(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string,
): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

function roundRect(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

/**
 * Draw a unit facing right. Anchor convention: feet at (0.5, 0.85) of the canvas.
 * Team colour appears on tabards, shields, saddle cloths and collars.
 */
export function drawUnit(def: UnitDef, team: string): HTMLCanvasElement {
  const scale = def.art.scale ?? 1;
  const S = Math.round(BASE * scale);
  const [cv, c] = createCanvas(S, S);
  c.save();
  c.scale(S / 100, S / 100); // draw in a 100×100 box
  ellipse(c, 50, 86, 22, 6, 'rgba(0,0,0,0.28)');
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
  return cv;
}

/** Small humanoid with feet at (fx, fy). `k` scales it (riders use a smaller one). */
function humanoid(c: Ctx, def: UnitDef, team: string, fx: number, fy: number, k: number): void {
  const body = def.art.body;
  const acc = def.art.accent ?? shade(body, 0.6);
  const skin = '#e3b68c';
  const s = (v: number): number => v * k;
  // legs
  roundRect(c, fx - s(9), fy - s(22), s(7), s(22), s(3), shade(body, 0.55));
  roundRect(c, fx + s(2), fy - s(22), s(7), s(22), s(3), shade(body, 0.5));
  // torso + team tabard
  roundRect(c, fx - s(13), fy - s(50), s(26), s(32), s(8), body);
  roundRect(c, fx - s(6), fy - s(48), s(12), s(28), s(4), team);
  // head
  circle(c, fx, fy - s(60), s(10), skin);
  // helmet / hood
  c.fillStyle = acc;
  c.beginPath();
  c.arc(fx, fy - s(62), s(10.5), Math.PI, 0);
  c.fill();
  // weapon (right hand)
  const hx = fx + s(14);
  const hy = fy - s(38);
  circle(c, hx, hy, s(4), skin);
  const w = def.art.weapon ?? 'none';
  if (w === 'spear') {
    line(c, hx, hy + s(14), hx + s(6), hy - s(40), s(3), '#6b4a2e');
    c.fillStyle = '#d6d9e0';
    c.beginPath();
    c.moveTo(hx + s(6), hy - s(50));
    c.lineTo(hx + s(10), hy - s(38));
    c.lineTo(hx + s(2), hy - s(39));
    c.fill();
  } else if (w === 'sword') {
    line(c, hx, hy, hx + s(16), hy - s(22), s(4), '#d6d9e0');
    line(c, hx - s(3), hy + s(2), hx + s(4), hy - s(5), s(3), '#c9a24a');
  } else if (w === 'axe') {
    line(c, hx, hy + s(6), hx + s(10), hy - s(24), s(3), '#6b4a2e');
    c.fillStyle = '#c9ccd4';
    c.beginPath();
    c.moveTo(hx + s(8), hy - s(20));
    c.quadraticCurveTo(hx + s(24), hy - s(26), hx + s(16), hy - s(10));
    c.closePath();
    c.fill();
  } else if (w === 'bow') {
    c.strokeStyle = '#7a5634';
    c.lineWidth = s(3);
    c.beginPath();
    c.arc(hx - s(2), hy, s(16), -1.2, 1.2);
    c.stroke();
    line(c, hx + s(4), hy - s(15), hx + s(4), hy + s(15), s(1), '#eee');
  } else if (w === 'sling') {
    line(c, hx, hy, hx + s(10), hy - s(16), s(1.5), '#7a5634');
    circle(c, hx + s(10), hy - s(16), s(3), '#8a8a8a');
  } else if (w === 'staff') {
    line(c, hx, hy + s(20), hx + s(2), hy - s(30), s(3), '#7a5634');
    circle(c, hx + s(2), hy - s(33), s(6), acc);
    circle(c, hx + s(1), hy - s(34), s(2.5), '#fff8d0');
  } else if (w === 'tool') {
    line(c, hx, hy + s(6), hx + s(8), hy - s(18), s(3), '#7a5634');
    line(c, hx - s(2), hy - s(18), hx + s(16), hy - s(14), s(3), '#9a9da5');
  }
  // shield on the off-hand for melee soldiers
  if (def.cls === 'infantry' || def.cls === 'hero') {
    circle(c, fx - s(14), fy - s(36), s(11), shade(team, 0.75));
    circle(c, fx - s(14), fy - s(36), s(7), team);
    circle(c, fx - s(14), fy - s(36), s(2.5), '#f0cf72');
  }
  if (def.cls === 'hero') {
    // a little crown/halo to make heroes pop
    c.strokeStyle = '#f0cf72';
    c.lineWidth = s(2.5);
    c.beginPath();
    c.ellipse(fx, fy - s(74), s(9), s(3), 0, 0, Math.PI * 2);
    c.stroke();
  }
}

function rider(c: Ctx, def: UnitDef, team: string): void {
  const mount = def.art.accent ?? '#8b5a2b';
  const isChariot = def.art.weapon === 'bow' && def.cls === 'cavalry';
  if (isChariot) {
    // horse + small cart
    roundRect(c, 10, 52, 34, 22, 8, '#6b4a2e');
    circle(c, 20, 76, 10, '#3a2a1a');
    circle(c, 20, 76, 5, '#c9a24a');
    roundRect(c, 12, 50, 30, 6, 3, team);
  }
  // mount body
  ellipse(c, 58, 58, 24, 12, mount);
  for (const lx of [40, 48, 66, 74]) line(c, lx, 62, lx + 1, 84, 5, shade(mount, 0.7));
  // neck + head
  line(c, 76, 54, 86, 38, 9, mount);
  ellipse(c, 89, 36, 8, 5, mount);
  circle(c, 92, 34, 1.5, '#111');
  // saddle cloth
  roundRect(c, 46, 46, 22, 14, 4, team);
  humanoid(c, def, team, isChariot ? 28 : 57, isChariot ? 54 : 52, 0.62);
}

function engine(c: Ctx, def: UnitDef, team: string): void {
  const wood = def.art.body;
  roundRect(c, 14, 50, 72, 18, 4, wood);
  for (const wx of [24, 76]) {
    circle(c, wx, 74, 11, shade(wood, 0.6));
    circle(c, wx, 74, 4, '#c9a24a');
  }
  if (def.attack && def.attack.range > 2) {
    // throwing arm / lens
    line(c, 30, 50, 70, 18, 6, shade(wood, 0.8));
    circle(c, 72, 16, 8, def.art.accent ?? '#9a9a9a');
  } else {
    // ram head
    roundRect(c, 20, 30, 64, 20, 6, shade(wood, 0.8));
    roundRect(c, 78, 32, 14, 16, 4, def.art.accent ?? '#9a9da5');
  }
  // team pennant
  line(c, 18, 50, 18, 18, 3, '#4a3420');
  c.fillStyle = team;
  c.beginPath();
  c.moveTo(19, 18);
  c.lineTo(34, 23);
  c.lineTo(19, 29);
  c.fill();
}

function giant(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.3);
  roundRect(c, 34, 62, 12, 24, 5, shade(b, 0.6));
  roundRect(c, 54, 62, 12, 24, 5, shade(b, 0.55));
  roundRect(c, 26, 26, 48, 42, 16, b);
  roundRect(c, 30, 58, 40, 7, 3, team); // belt
  circle(c, 50, 20, 11, shade(b, 1.1));
  circle(c, 46, 18, 2, a);
  circle(c, 54, 18, 2, a);
  // arms
  line(c, 28, 34, 16, 62, 12, shade(b, 0.85));
  line(c, 72, 34, 86, 58, 12, shade(b, 0.85));
  circle(c, 86, 60, 8, a); // fist/club
  // icy/fiery highlights
  circle(c, 38, 36, 5, a);
  circle(c, 60, 44, 4, a);
}

function serpent(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  c.lineCap = 'round';
  c.strokeStyle = shade(b, 0.7);
  c.lineWidth = 18;
  c.beginPath();
  c.moveTo(10, 80);
  c.bezierCurveTo(30, 60, 50, 92, 62, 66);
  c.bezierCurveTo(70, 50, 60, 36, 74, 26);
  c.stroke();
  c.strokeStyle = b;
  c.lineWidth = 14;
  c.stroke();
  c.strokeStyle = a;
  c.lineWidth = 4;
  c.stroke();
  ellipse(c, 80, 24, 13, 9, b);
  circle(c, 84, 21, 2.5, '#ffe066');
  roundRect(c, 64, 30, 14, 6, 3, team); // collar
  // fangs / crest
  line(c, 92, 26, 96, 32, 2, '#fff');
}

function beast(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  ellipse(c, 50, 56, 30, 15, b);
  for (const lx of [28, 38, 62, 72]) line(c, lx, 60, lx - 2, 84, 7, shade(b, 0.7));
  // tail
  line(c, 22, 50, 8, 38, 6, shade(b, 0.8));
  // head
  ellipse(c, 82, 44, 13, 11, b);
  c.fillStyle = shade(b, 0.8);
  c.beginPath();
  c.moveTo(76, 36);
  c.lineTo(80, 22);
  c.lineTo(86, 34);
  c.fill();
  ellipse(c, 93, 48, 7, 5, shade(b, 0.9));
  circle(c, 86, 41, 2.5, a);
  roundRect(c, 66, 46, 8, 16, 3, team); // collar
  // mane highlights
  circle(c, 56, 46, 5, a);
  circle(c, 44, 48, 4, a);
}

function flyer(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.3);
  // wings
  c.fillStyle = shade(b, 0.85);
  c.beginPath();
  c.moveTo(48, 44);
  c.lineTo(8, 14);
  c.lineTo(22, 50);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(56, 44);
  c.lineTo(90, 10);
  c.lineTo(80, 48);
  c.closePath();
  c.fill();
  ellipse(c, 52, 52, 22, 12, b);
  roundRect(c, 42, 46, 14, 12, 4, team);
  ellipse(c, 78, 40, 9, 8, b);
  c.fillStyle = a;
  c.beginPath();
  c.moveTo(86, 38);
  c.lineTo(97, 41);
  c.lineTo(86, 44);
  c.fill();
  circle(c, 80, 37, 2, '#111');
  // legs (it hovers: shadow is drawn below by the caller)
  line(c, 46, 62, 44, 72, 3, a);
  line(c, 58, 62, 60, 72, 3, a);
}

function construct(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? '#ffe58a';
  roundRect(c, 32, 64, 14, 22, 3, shade(b, 0.6));
  roundRect(c, 54, 64, 14, 22, 3, shade(b, 0.55));
  roundRect(c, 24, 28, 52, 40, 6, b);
  roundRect(c, 36, 10, 28, 20, 4, shade(b, 1.15));
  circle(c, 44, 20, 3, a);
  circle(c, 56, 20, 3, a);
  roundRect(c, 12, 30, 12, 34, 4, shade(b, 0.8));
  roundRect(c, 76, 30, 12, 34, 4, shade(b, 0.8));
  circle(c, 50, 46, 7, team); // chest gem
  circle(c, 48, 44, 2.5, '#fff');
  // rivets
  for (const [x, y] of [
    [30, 34],
    [70, 34],
    [30, 62],
    [70, 62],
  ] as const)
    circle(c, x, y, 2, a);
}

/** Projectile sprites. */
export function drawProjectile(kind: 'arrow' | 'stone' | 'orb'): HTMLCanvasElement {
  const [cv, c] = createCanvas(24, 24);
  if (kind === 'arrow') {
    line(c, 3, 12, 20, 12, 2, '#5b3a22');
    c.fillStyle = '#d6d9e0';
    c.beginPath();
    c.moveTo(23, 12);
    c.lineTo(17, 9);
    c.lineTo(17, 15);
    c.fill();
    line(c, 3, 12, 6, 9, 2, '#eee');
    line(c, 3, 12, 6, 15, 2, '#eee');
  } else if (kind === 'stone') {
    circle(c, 12, 12, 6, '#7d7368');
    circle(c, 10, 10, 2.5, '#a49a8c');
  } else {
    circle(c, 12, 12, 8, 'rgba(255,240,160,0.5)');
    circle(c, 12, 12, 5, '#fff3b0');
  }
  return cv;
}
