import type { BuildingDef, FactionDef } from '../../../data/types';
import { TILE_PX } from '../tileset';
import { circle, createCanvas, ellipse, seeded } from './draw';

type Ctx = CanvasRenderingContext2D;
type Roof = 'steep' | 'tile' | 'flat';

/** Extra height above the footprint so roofs/towers can overhang (in tiles). */
export const BUILDING_OVERHANG = 0.75;

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function rect(c: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}

function roofShape(f: FactionDef): Roof {
  return f.id === 'hrimfolk' ? 'steep' : f.id === 'aurelian' ? 'tile' : 'flat';
}

/**
 * Draw a building. Canvas = footprint plus BUILDING_OVERHANG tiles on top. The footprint's
 * top-left is at (0, overhang). Anchor for placement: origin (0, overhang / totalHeight).
 */
export function drawBuilding(def: BuildingDef, f: FactionDef, team: string): HTMLCanvasElement {
  const W = def.size * TILE_PX;
  const OH = Math.round(BUILDING_OVERHANG * TILE_PX);
  const H = W + OH;
  const [cv, c] = createCanvas(W, H);
  const st = f.style;
  const roof = roofShape(f);
  // ground pad
  c.fillStyle = 'rgba(70,52,30,0.35)';
  c.beginPath();
  c.roundRect(2, OH + 2, W - 4, W - 4, 10);
  c.fill();
  ellipse(c, W / 2 + 4, OH + W * 0.82, W * 0.42, W * 0.12, 'rgba(0,0,0,0.25)');

  const pad = W * 0.1;
  switch (def.art) {
    case 'farm':
      farm(c, W, OH, team);
      break;
    case 'tower':
      tower(c, W, OH, st, roof, team);
      break;
    case 'monument':
      monument(c, W, OH, st, team);
      break;
    case 'shrine':
      shrine(c, W, OH, st, team);
      break;
    case 'temple':
      temple(c, W, OH, st, roof, team);
      break;
    case 'storehouse':
      house(c, pad, OH + W * 0.25, W - pad * 2, W * 0.55, st, roof, team, false);
      // crates and logs out front
      for (let i = 0; i < 3; i++) rect(c, pad + i * 14, OH + W * 0.78, 12, 10, '#8a5a33');
      ellipse(c, W - pad - 14, OH + W * 0.84, 12, 5, '#6b4a2e');
      break;
    case 'house':
      house(c, pad, OH + W * 0.2, W - pad * 2, W * 0.62, st, roof, team, true);
      break;
    case 'hall':
      house(c, pad * 0.6, OH + W * 0.22, W - pad * 1.2, W * 0.62, st, roof, team, true);
      house(c, W * 0.3, OH - OH * 0.4, W * 0.4, W * 0.42, st, roof, team, false);
      flag(c, W * 0.5, OH - OH * 0.5, team, 30);
      break;
    case 'barracks':
      house(c, pad * 0.5, OH + W * 0.24, W - pad, W * 0.58, st, roof, team, true);
      // weapon rack
      for (let i = 0; i < 4; i++) {
        c.strokeStyle = '#6b4a2e';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(W * 0.62 + i * 8, OH + W * 0.94);
        c.lineTo(W * 0.62 + i * 8, OH + W * 0.74);
        c.stroke();
        circle(c, W * 0.62 + i * 8, OH + W * 0.73, 3, '#c9ccd4');
      }
      flag(c, W * 0.15, OH + W * 0.1, team, 22);
      break;
    case 'stable':
      house(c, pad * 0.5, OH + W * 0.24, W - pad, W * 0.56, st, roof, team, true);
      // fence
      c.strokeStyle = '#7a5634';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(pad * 0.5, OH + W * 0.9);
      c.lineTo(W - pad * 0.5, OH + W * 0.9);
      c.stroke();
      ellipse(c, W * 0.3, OH + W * 0.86, 8, 4, '#d8c385');
      break;
    case 'workshop':
      house(c, pad * 0.5, OH + W * 0.3, W - pad, W * 0.52, st, roof, team, true);
      // crane / gear
      c.strokeStyle = '#6b4a2e';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(W * 0.8, OH + W * 0.4);
      c.lineTo(W * 0.8, OH - OH * 0.3);
      c.lineTo(W * 0.5, OH - OH * 0.1);
      c.stroke();
      circle(c, W * 0.2, OH + W * 0.2, 12, '#9a9da5');
      circle(c, W * 0.2, OH + W * 0.2, 5, '#5a5d65');
      break;
  }
  return cv;
}

function flag(c: Ctx, x: number, y: number, team: string, h: number): void {
  c.strokeStyle = '#4a3420';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y);
  c.stroke();
  c.fillStyle = team;
  c.beginPath();
  c.moveTo(x + 1, y);
  c.lineTo(x + h * 0.7, y + h * 0.22);
  c.lineTo(x + 1, y + h * 0.45);
  c.fill();
}

/** A generic house body: front wall with door/windows and a roof in the faction style. */
function house(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  st: FactionDef['style'],
  roof: Roof,
  team: string,
  door: boolean,
): void {
  const wallTop = y + h * 0.35;
  rect(c, x, wallTop, w, h * 0.65, st.wall);
  rect(c, x, wallTop, w, 4, shade(st.wall, 1.15));
  rect(c, x + w - 6, wallTop, 6, h * 0.65, shade(st.wall, 0.8));
  if (door) {
    rect(c, x + w / 2 - w * 0.09, y + h - h * 0.34, w * 0.18, h * 0.34, '#4a3420');
    rect(c, x + w / 2 - w * 0.09, y + h - h * 0.36, w * 0.18, 4, st.trim);
  }
  // windows
  rect(c, x + w * 0.15, wallTop + h * 0.15, w * 0.1, h * 0.12, '#2b2116');
  rect(c, x + w * 0.75, wallTop + h * 0.15, w * 0.1, h * 0.12, '#2b2116');
  // team stripe
  rect(c, x, wallTop + h * 0.05, w, 4, team);
  if (roof === 'flat') {
    rect(c, x - 3, wallTop - h * 0.12, w + 6, h * 0.14, shade(st.roof, 1.05));
    for (let i = 0; i < 5; i++)
      rect(c, x + (i * (w - 8)) / 4, wallTop - h * 0.2, 8, h * 0.09, st.roof);
  } else {
    const peak = roof === 'steep' ? y - h * 0.05 : y + h * 0.12;
    c.fillStyle = st.roof;
    c.beginPath();
    c.moveTo(x - 5, wallTop + 2);
    c.lineTo(x + w / 2, peak);
    c.lineTo(x + w + 5, wallTop + 2);
    c.closePath();
    c.fill();
    c.fillStyle = shade(st.roof, 0.75);
    c.beginPath();
    c.moveTo(x + w / 2, peak);
    c.lineTo(x + w + 5, wallTop + 2);
    c.lineTo(x + w / 2, wallTop + 2);
    c.closePath();
    c.fill();
    // ridge line in trim colour
    c.strokeStyle = st.trim;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 5, wallTop + 2);
    c.lineTo(x + w / 2, peak);
    c.lineTo(x + w + 5, wallTop + 2);
    c.stroke();
  }
}

function farm(c: Ctx, W: number, OH: number, team: string): void {
  const rnd = seeded(31);
  rect(c, 6, OH + 6, W - 12, W - 12, '#8a6a3a');
  for (let r = 0; r < 6; r++) {
    const y = OH + 12 + r * ((W - 24) / 6);
    rect(c, 10, y, W - 20, 5, '#6b5028');
    for (let k = 0; k < 7; k++)
      circle(c, 14 + k * ((W - 28) / 6), y - 2, 3 + rnd() * 1.5, '#9bc45a');
  }
  c.strokeStyle = '#7a5634';
  c.lineWidth = 3;
  c.strokeRect(5, OH + 5, W - 10, W - 10);
  rect(c, 5, OH + 5, 10, 10, team);
}

function tower(
  c: Ctx,
  W: number,
  OH: number,
  st: FactionDef['style'],
  roof: Roof,
  team: string,
): void {
  const x = W * 0.25;
  const w = W * 0.5;
  const top = OH * 0.1;
  rect(c, x, top + 20, w, OH + W * 0.85 - top - 20, st.wall);
  rect(c, x + w - 6, top + 20, 6, OH + W * 0.85 - top - 20, shade(st.wall, 0.8));
  rect(c, x + w / 2 - 4, OH + W * 0.3, 8, 14, '#2b2116');
  if (roof === 'flat') {
    for (let i = 0; i < 4; i++)
      rect(c, x - 4 + i * ((w + 8) / 4), top + 8, (w + 8) / 6, 14, st.roof);
    rect(c, x - 4, top + 18, w + 8, 6, st.roof);
  } else {
    c.fillStyle = st.roof;
    c.beginPath();
    c.moveTo(x - 8, top + 24);
    c.lineTo(x + w / 2, roof === 'steep' ? top - 14 : top);
    c.lineTo(x + w + 8, top + 24);
    c.fill();
  }
  rect(c, x, top + 26, w, 4, team);
  flag(c, x + w / 2, roof === 'flat' ? top - 14 : top - 30, team, 18);
}

function temple(
  c: Ctx,
  W: number,
  OH: number,
  st: FactionDef['style'],
  roof: Roof,
  team: string,
): void {
  const x = W * 0.08;
  const w = W * 0.84;
  const base = OH + W * 0.85;
  rect(c, x - 4, base - 8, w + 8, 10, shade(st.wall, 0.85));
  rect(c, x, base - 14, w, 8, st.wall);
  const cols = 6;
  for (let i = 0; i < cols; i++) {
    const cx = x + 6 + (i * (w - 18)) / (cols - 1);
    rect(c, cx, OH + W * 0.25, 7, base - 14 - (OH + W * 0.25), shade(st.wall, 1.08));
    rect(c, cx + 5, OH + W * 0.25, 2, base - 14 - (OH + W * 0.25), shade(st.wall, 0.8));
  }
  rect(c, x - 2, OH + W * 0.18, w + 4, 10, st.wall);
  if (roof === 'flat') {
    rect(c, x - 4, OH + W * 0.08, w + 8, 12, st.roof);
  } else {
    c.fillStyle = st.roof;
    c.beginPath();
    c.moveTo(x - 6, OH + W * 0.19);
    c.lineTo(x + w / 2, roof === 'steep' ? OH - OH * 0.3 : OH);
    c.lineTo(x + w + 6, OH + W * 0.19);
    c.fill();
  }
  circle(c, x + w / 2, OH + W * 0.12, 7, team);
  circle(c, x + w / 2, OH + W * 0.12, 3, st.trim);
}

function shrine(c: Ctx, W: number, OH: number, st: FactionDef['style'], team: string): void {
  rect(c, W * 0.2, OH + W * 0.55, W * 0.6, W * 0.3, st.wall);
  rect(c, W * 0.15, OH + W * 0.5, W * 0.7, 8, shade(st.wall, 1.1));
  rect(c, W * 0.2, OH + W * 0.6, W * 0.6, 4, team);
  // eternal flame
  ellipse(c, W / 2, OH + W * 0.4, 9, 16, '#ff9a3a');
  ellipse(c, W / 2, OH + W * 0.43, 5, 10, '#ffe58a');
  rect(c, W * 0.12, OH + W * 0.2, 6, W * 0.65, st.trim);
  rect(c, W * 0.82, OH + W * 0.2, 6, W * 0.65, st.trim);
}

function monument(c: Ctx, W: number, OH: number, st: FactionDef['style'], team: string): void {
  rect(c, W * 0.2, OH + W * 0.72, W * 0.6, W * 0.14, shade(st.wall, 0.9));
  c.fillStyle = st.wall;
  c.beginPath();
  c.moveTo(W * 0.36, OH + W * 0.72);
  c.lineTo(W * 0.43, -OH * 0.1 + 20);
  c.lineTo(W * 0.57, -OH * 0.1 + 20);
  c.lineTo(W * 0.64, OH + W * 0.72);
  c.fill();
  c.fillStyle = shade(st.wall, 0.8);
  c.beginPath();
  c.moveTo(W * 0.5, -OH * 0.1 + 20);
  c.lineTo(W * 0.57, -OH * 0.1 + 20);
  c.lineTo(W * 0.64, OH + W * 0.72);
  c.lineTo(W * 0.5, OH + W * 0.72);
  c.fill();
  // golden cap
  c.fillStyle = '#e8b830';
  c.beginPath();
  c.moveTo(W * 0.43, -OH * 0.1 + 20);
  c.lineTo(W * 0.5, -OH * 0.1 + 4);
  c.lineTo(W * 0.57, -OH * 0.1 + 20);
  c.fill();
  rect(c, W * 0.42, OH + W * 0.3, W * 0.16, 5, team);
  // glyphs
  for (let i = 0; i < 4; i++) rect(c, W * 0.47, OH * 0.4 + i * 14, 6, 6, st.trim);
}

/** Generic construction scaffold drawn under rising buildings. */
export function drawFoundation(size: number): HTMLCanvasElement {
  const W = size * TILE_PX;
  const [cv, c] = createCanvas(W, W);
  c.fillStyle = 'rgba(120,90,50,0.55)';
  c.fillRect(4, 4, W - 8, W - 8);
  c.strokeStyle = '#6b4a2e';
  c.lineWidth = 3;
  c.strokeRect(4, 4, W - 8, W - 8);
  c.beginPath();
  for (let i = 0; i <= size * 2; i++) {
    c.moveTo(4 + (i * (W - 8)) / (size * 2), 4);
    c.lineTo(4, 4 + (i * (W - 8)) / (size * 2));
  }
  c.stroke();
  return cv;
}
