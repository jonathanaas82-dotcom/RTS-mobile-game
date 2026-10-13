import { PALETTE } from '../palette';
import { TILE_PX } from '../tileset';
import { circle, createCanvas, ellipse, seeded } from './draw';

/** Gold mine, 2x2 tiles: a rocky mound studded with gold nuggets. */
export function generateGoldMine(): HTMLCanvasElement {
  const s = TILE_PX * 2;
  const [cv, c] = createCanvas(s, s);
  ellipse(c, s / 2 + 4, s * 0.78, s * 0.42, s * 0.14, PALETTE.shadow);
  const rnd = seeded(77);
  const rocks = [
    { x: 0.32, y: 0.55, r: 0.2 },
    { x: 0.66, y: 0.52, r: 0.22 },
    { x: 0.5, y: 0.38, r: 0.22 },
    { x: 0.48, y: 0.64, r: 0.2 },
  ];
  for (const r of rocks) {
    circle(c, r.x * s + 2, r.y * s + 3, r.r * s, PALETTE.cliffDark);
    circle(c, r.x * s, r.y * s, r.r * s, PALETTE.cliff);
    circle(c, (r.x - 0.06) * s, (r.y - 0.06) * s, r.r * s * 0.45, PALETTE.cliffLight);
  }
  for (let i = 0; i < 14; i++) {
    const x = (0.22 + rnd() * 0.56) * s;
    const y = (0.24 + rnd() * 0.5) * s;
    const r = 3 + rnd() * 5;
    circle(c, x + 1, y + 1, r, PALETTE.goldDark);
    circle(c, x, y, r, PALETTE.gold);
    circle(c, x - r * 0.3, y - r * 0.3, r * 0.4, PALETTE.goldLight);
  }
  return cv;
}

/** Berry bush, 1x1 tile. */
export function generateBerryBush(): HTMLCanvasElement {
  const s = TILE_PX;
  const [cv, c] = createCanvas(s, s);
  ellipse(c, s / 2 + 2, s * 0.8, s * 0.36, s * 0.12, PALETTE.shadow);
  circle(c, s * 0.5, s * 0.52, s * 0.32, '#245f2a');
  circle(c, s * 0.36, s * 0.46, s * 0.2, PALETTE.berryLeaf);
  circle(c, s * 0.62, s * 0.44, s * 0.21, PALETTE.berryLeaf);
  circle(c, s * 0.5, s * 0.6, s * 0.22, '#3a8a3f');
  const rnd = seeded(13);
  for (let i = 0; i < 10; i++) {
    const x = s * (0.28 + rnd() * 0.44);
    const y = s * (0.32 + rnd() * 0.38);
    circle(c, x, y, 3.2, PALETTE.berry);
    circle(c, x - 1, y - 1, 1.1, '#ff8a95');
  }
  return cv;
}

/** Banner marking a player's start (placeholder until buildings arrive in M3). */
export function generateBanner(color: string): HTMLCanvasElement {
  const w = TILE_PX;
  const h = TILE_PX * 1.5;
  const [cv, c] = createCanvas(w, h);
  ellipse(c, w / 2 + 3, h - 6, 14, 5, PALETTE.shadow);
  c.fillStyle = '#4a3420';
  c.fillRect(w / 2 - 2, 8, 4, h - 14);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(w / 2 + 2, 10);
  c.lineTo(w - 6, 18);
  c.lineTo(w / 2 + 2, 34);
  c.closePath();
  c.fill();
  c.strokeStyle = '#f3d27a';
  c.lineWidth = 2;
  c.stroke();
  circle(c, w / 2, 8, 4, '#f3d27a');
  return cv;
}

/** White ring used for tap / command feedback (tinted at runtime). */
export function generateRing(): HTMLCanvasElement {
  const s = 64;
  const [cv, c] = createCanvas(s, s);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 5;
  c.beginPath();
  c.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  c.stroke();
  return cv;
}
