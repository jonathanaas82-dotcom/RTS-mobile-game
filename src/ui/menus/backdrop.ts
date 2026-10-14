import { buildingDef, factionDef, unitDef } from '../../data';
import { valueNoise } from '../../sim/map/noise';
import { drawBuilding } from '../../render/assets/procedural/buildings';
import { createCanvas, seeded } from '../../render/assets/procedural/draw';
import { drawUnit } from '../../render/assets/procedural/units';
import { treeCanvas } from '../../render/terrain/trees';

const W = 1600;
const H = 800;
const HORIZON = H * 0.6;

let cached: string | null = null;

/**
 * Painted dusk panorama for the menus, composed from the game's own procedural art: a glowing
 * sky, layered mountains, the three factions' buildings on the hills and heroes in the
 * foreground. Generated once and cached as a data URL (used as a CSS background).
 */
export function menuBackdrop(): string {
  if (cached) return cached;
  const [cv, c] = createCanvas(W, H);
  sky(c);
  mountains(c);
  scenery(c);
  foreground(c);
  // Darken the edges and the bottom so menu text stays readable.
  const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(5,4,12,0.55)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  cached = cv.toDataURL('image/jpeg', 0.86);
  return cached;
}

function sky(c: CanvasRenderingContext2D): void {
  const g = c.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, '#0b1230');
  g.addColorStop(0.45, '#33295a');
  g.addColorStop(0.75, '#a2506a');
  g.addColorStop(1, '#f2a85a');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const rnd = seeded(7);
  // Stars in the upper sky.
  for (let i = 0; i < 140; i++) {
    const y = rnd() * HORIZON * 0.5;
    c.fillStyle = `rgba(255,250,235,${(0.15 + rnd() * 0.6) * (1 - y / (HORIZON * 0.5))})`;
    c.fillRect(rnd() * W, y, 1.6, 1.6);
  }
  // Setting sun with a wide glow and faint god rays.
  const sx = W * 0.6;
  const sy = HORIZON - 30;
  const glow = c.createRadialGradient(sx, sy, 10, sx, sy, W * 0.5);
  glow.addColorStop(0, 'rgba(255,236,170,0.95)');
  glow.addColorStop(0.08, 'rgba(255,200,110,0.6)');
  glow.addColorStop(0.35, 'rgba(240,120,80,0.18)');
  glow.addColorStop(1, 'rgba(240,120,80,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.22 + (rnd() - 0.5) * 0.08;
    c.fillStyle = 'rgba(255,210,140,0.05)';
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + Math.cos(a - 0.04) * W, sy + Math.sin(a - 0.04) * W);
    c.lineTo(sx + Math.cos(a + 0.04) * W, sy + Math.sin(a + 0.04) * W);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.fillStyle = '#fff3cf';
  c.beginPath();
  c.arc(sx, sy, 34, 0, Math.PI * 2);
  c.fill();
  // Long glowing clouds.
  for (let i = 0; i < 7; i++) {
    const y = HORIZON * (0.22 + rnd() * 0.5);
    const x = rnd() * W;
    const w = 180 + rnd() * 320;
    const cg = c.createLinearGradient(0, y - 12, 0, y + 12);
    cg.addColorStop(0, 'rgba(255,190,150,0.0)');
    cg.addColorStop(0.5, `rgba(255,${150 + Math.floor(rnd() * 60)},140,${0.18 + rnd() * 0.2})`);
    cg.addColorStop(1, 'rgba(90,60,110,0.0)');
    c.fillStyle = cg;
    c.beginPath();
    c.ellipse(x, y, w, 10 + rnd() * 8, 0, 0, Math.PI * 2);
    c.fill();
  }
}

function ridge(
  c: CanvasRenderingContext2D,
  base: number,
  amp: number,
  scale: number,
  seed: number,
  fill: string | CanvasGradient,
): void {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const n =
      valueNoise(x / scale, 0.5, seed) * 0.7 + valueNoise(x / (scale * 0.35), 3.5, seed) * 0.3;
    c.lineTo(x, base - n * amp);
  }
  c.lineTo(W, H);
  c.closePath();
  c.fill();
}

function mountains(c: CanvasRenderingContext2D): void {
  ridge(c, HORIZON + 10, 230, 260, 11, 'rgba(120,82,130,0.55)');
  ridge(c, HORIZON + 30, 170, 200, 23, 'rgba(78,56,104,0.85)');
  // Mist in the valleys.
  const m = c.createLinearGradient(0, HORIZON - 40, 0, HORIZON + 60);
  m.addColorStop(0, 'rgba(255,190,150,0)');
  m.addColorStop(0.6, 'rgba(255,190,150,0.22)');
  m.addColorStop(1, 'rgba(255,190,150,0)');
  c.fillStyle = m;
  c.fillRect(0, HORIZON - 40, W, 100);
  ridge(c, HORIZON + 70, 110, 170, 37, '#3a2c4c');
}

/** Darken a sprite towards dusk colours, keeping a warm rim from the sun side. */
function dusk(src: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const [cv, c] = createCanvas(src.width, src.height);
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(src.width, 0, 0, 0);
  g.addColorStop(0, `rgba(255,170,100,${amount * 0.18})`);
  g.addColorStop(0.4, `rgba(40,26,60,${amount * 0.65})`);
  g.addColorStop(1, `rgba(24,16,40,${amount * 0.85})`);
  c.fillStyle = g;
  c.fillRect(0, 0, src.width, src.height);
  return cv;
}

function place(
  c: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  footY: number,
  scale: number,
  flip = false,
): void {
  const w = src.width * scale;
  const h = src.height * scale;
  c.save();
  c.translate(x, footY);
  if (flip) c.scale(-1, 1);
  c.drawImage(src, -w / 2, -h, w, h);
  c.restore();
}

function scenery(c: CanvasRenderingContext2D): void {
  // Hills carrying the three civilisations.
  const hill = (cx: number, top: number, rx: number, color: string): void => {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(cx - rx, H);
    c.quadraticCurveTo(cx - rx * 0.6, top, cx, top);
    c.quadraticCurveTo(cx + rx * 0.6, top, cx + rx, H);
    c.closePath();
    c.fill();
  };
  hill(W * 0.16, HORIZON + 40, 420, '#2b2238');
  hill(W * 0.86, HORIZON + 30, 420, '#2b2238');
  hill(W * 0.52, HORIZON + 85, 520, '#271f33');

  const team = '#3b82f6';
  const rival = '#e5484d';
  const hr = factionDef('hrimfolk');
  const au = factionDef('aurelian');
  const sa = factionDef('sahrun');
  place(
    c,
    dusk(drawBuilding(buildingDef('town_hall'), hr, team), 0.5),
    W * 0.12,
    HORIZON + 96,
    0.62,
  );
  place(c, dusk(drawBuilding(buildingDef('tower'), hr, team), 0.55), W * 0.25, HORIZON + 102, 0.5);
  place(
    c,
    dusk(drawBuilding(buildingDef('temple'), au, rival), 0.48),
    W * 0.85,
    HORIZON + 92,
    0.62,
  );
  place(
    c,
    dusk(drawBuilding(buildingDef('monument'), sa, '#e8b830'), 0.5),
    W * 0.71,
    HORIZON + 110,
    0.5,
  );
  place(c, dusk(drawBuilding(buildingDef('house'), au, rival), 0.55), W * 0.96, HORIZON + 130, 0.5);

  // Forest silhouettes along the hills.
  const rnd = seeded(31);
  const pines = [0, 1, 2].map((k) => dusk(treeCanvas('pine', k * 17 + 3, '#245a3e'), 0.9));
  const broad = [0, 1].map((k) => dusk(treeCanvas('broad', k * 31 + 5, '#3f7a34'), 0.9));
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    if (x > W * 0.36 && x < W * 0.62) continue; // keep the centre open
    const set = x < W * 0.5 ? pines : broad;
    const tree = set[i % set.length]!;
    const foot = HORIZON + 110 + rnd() * 70;
    place(c, tree, x, foot, 0.5 + rnd() * 0.35);
  }
}

function foreground(c: CanvasRenderingContext2D): void {
  const g = c.createLinearGradient(0, H * 0.78, 0, H);
  g.addColorStop(0, '#1e1a26');
  g.addColorStop(1, '#0d0b12');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, H);
  c.lineTo(0, H * 0.86);
  c.quadraticCurveTo(W * 0.3, H * 0.78, W * 0.55, H * 0.83);
  c.quadraticCurveTo(W * 0.8, H * 0.88, W, H * 0.8);
  c.lineTo(W, H);
  c.closePath();
  c.fill();
  // Heroes of the three factions facing the sunset.
  const hero = (id: string, team: string): HTMLCanvasElement =>
    dusk(drawUnit(unitDef(id), team), 0.4);
  place(c, hero('stormsworn', '#3b82f6'), W * 0.08, H * 0.97, 1.5);
  place(c, hero('shieldbrother', '#3b82f6'), W * 0.15, H * 0.94, 1.15);
  place(c, hero('lionheart', '#e5484d'), W * 0.92, H * 0.96, 1.5, true);
  place(c, hero('sun_priest', '#e8b830'), W * 0.83, H * 0.93, 1.2, true);
  // Grass tufts on the ridge line.
  const rnd = seeded(5);
  c.strokeStyle = 'rgba(12,10,16,0.9)';
  c.lineWidth = 2;
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = H * (0.83 + rnd() * 0.15);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 2, y - 6, x + 4 - rnd() * 8, y - 10 - rnd() * 8);
    c.stroke();
  }
}
