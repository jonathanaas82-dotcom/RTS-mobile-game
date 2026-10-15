import type { BuildingDef, FactionDef } from '../../../data/types';
import { TILE_PX } from '../tileset';
import {
  ART_RES,
  castShadow,
  createCanvas,
  createSoftCanvas,
  outlined,
  rgrad,
  seeded,
  shade,
  softShadow,
  sunlight,
  vgrad,
} from './draw';

type Ctx = CanvasRenderingContext2D;
type Style = FactionDef['style'];
type Rnd = () => number;
type Fill = string | CanvasGradient;
type Pt = [number, number];

/** Extra height above the footprint so roofs/towers can overhang (in tiles). */
export const BUILDING_OVERHANG = 1;

const GOLD = '#e8b830';
const INK = 'rgba(38,26,16,0.82)';
const IRON = '#3b3a3c';

// ───────────────────────── primitives ─────────────────────────

function rect(c: Ctx, x: number, y: number, w: number, h: number, fill: Fill): void {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}

function line(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: Fill,
): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

function disc(c: Ctx, x: number, y: number, r: number, fill: Fill): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: Fill): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

/** Trace a polygon from a flat [x0, y0, x1, y1, ...] list. */
function trace(c: Ctx | Path2D, pts: readonly number[], close = true): void {
  if (c instanceof Path2D) {
    c.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
    if (close) c.closePath();
    return;
  }
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  if (close) c.closePath();
}

function poly(c: Ctx, pts: readonly number[], fill: Fill, edge?: string, ew = 1): void {
  trace(c, pts);
  c.fillStyle = fill;
  c.fill();
  if (edge) stroke(c, ew, edge);
}

function stroke(c: Ctx, w: number, color: Fill, p?: Path2D): void {
  c.lineWidth = w;
  c.strokeStyle = color;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (p) c.stroke(p);
  else c.stroke();
}

function fillP(c: Ctx, p: Path2D, fill: Fill): void {
  c.fillStyle = fill;
  c.fill(p);
}

/** Run `draw` clipped to a polygon. */
function clipped(c: Ctx, pts: readonly number[], draw: () => void): void {
  c.save();
  trace(c, pts);
  c.clip();
  draw();
  c.restore();
}

function bounds(pts: readonly number[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]!);
    x1 = Math.max(x1, pts[i]!);
    y0 = Math.min(y0, pts[i + 1]!);
    y1 = Math.max(y1, pts[i + 1]!);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

function hgrad(c: Ctx, x0: number, x1: number, color: string, l = 1.22, d = 0.72): CanvasGradient {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(color, l));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, d));
  return g;
}

/** Vertical alpha ramp of one colour (for shading overlays). */
function ramp(c: Ctx, y0: number, y1: number, rgb: string, a0: number, a1: number): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${rgb},${a0})`);
  g.addColorStop(1, `rgba(${rgb},${a1})`);
  return g;
}

/** Warm interior light for windows and doorways. */
function glow(c: Ctx, y0: number, y1: number): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#ffe9a8');
  g.addColorStop(1, '#ee9a36');
  return g;
}

function halo(c: Ctx, x: number, y: number, r: number, a = 0.55, rgb = '255,196,96'): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A small flickering flame (outer orange, inner yellow). */
function flame(c: Ctx, x: number, y: number, h: number): void {
  const w = h * 0.45;
  c.fillStyle = '#ff7a2a';
  c.beginPath();
  c.moveTo(x - w, y);
  c.quadraticCurveTo(x - w * 1.1, y - h * 0.55, x, y - h);
  c.quadraticCurveTo(x + w * 1.1, y - h * 0.5, x + w, y);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffe07a';
  c.beginPath();
  c.moveTo(x - w * 0.5, y);
  c.quadraticCurveTo(x - w * 0.55, y - h * 0.4, x, y - h * 0.62);
  c.quadraticCurveTo(x + w * 0.55, y - h * 0.38, x + w * 0.5, y);
  c.closePath();
  c.fill();
}

// ───────────────────────── materials ─────────────────────────

/** Vertical boards with seams, wood grain and highlights, filling a rectangle. */
function boards(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  bw: number,
  rnd: Rnd,
): void {
  for (let bx = x; bx < x + w; bx += bw)
    rect(c, bx, y, bw + 0.2, h, shade(col, 0.86 + rnd() * 0.28));
  const grain = new Path2D();
  const seam = new Path2D();
  const hi = new Path2D();
  for (let bx = x; bx < x + w; bx += bw) {
    seam.moveTo(bx, y);
    seam.lineTo(bx, y + h);
    hi.moveTo(bx + 0.9, y);
    hi.lineTo(bx + 0.9, y + h);
    const gx = bx + bw * (0.35 + rnd() * 0.3);
    grain.moveTo(gx, y);
    grain.bezierCurveTo(gx + 0.9, y + h * 0.3, gx - 0.9, y + h * 0.65, gx + 0.4, y + h);
    if (rnd() < 0.25) {
      const ky = y + rnd() * h;
      grain.moveTo(gx + 1.2, ky);
      grain.ellipse(gx, ky, 1.2, 1.8, 0, 0, Math.PI * 2);
    }
  }
  stroke(c, 0.55, shade(col, 0.66), grain);
  stroke(c, 0.5, shade(col, 1.3), hi);
  stroke(c, 0.9, shade(col, 0.42), seam);
}

/** Horizontal boards / logs (rows of height `bh`), optionally rounded like logs. */
function rows(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  bh: number,
  rnd: Rnd,
  round = false,
): void {
  for (let ly = y; ly < y + h; ly += bh) {
    const t = shade(col, 0.88 + rnd() * 0.22);
    if (round) {
      const g = c.createLinearGradient(0, ly, 0, ly + bh);
      g.addColorStop(0, shade(t, 1.28));
      g.addColorStop(0.45, t);
      g.addColorStop(1, shade(t, 0.62));
      rect(c, x, ly, w, bh, g);
    } else rect(c, x, ly, w, bh, t);
  }
  const seam = new Path2D();
  const grain = new Path2D();
  for (let ly = y; ly < y + h; ly += bh) {
    seam.moveTo(x, ly);
    seam.lineTo(x + w, ly);
    for (let gx = x + rnd() * 20; gx < x + w; gx += 14 + rnd() * 16) {
      const gy = ly + bh * (0.3 + rnd() * 0.4);
      grain.moveTo(gx, gy);
      grain.lineTo(gx + 6 + rnd() * 8, gy + (rnd() - 0.5) * 0.8);
    }
  }
  stroke(c, 0.5, shade(col, 0.7), grain);
  stroke(c, 0.9, shade(col, 0.4), seam);
}

/** Dressed stone courses with per-block tone, mortar joints and sunlit top edges. */
function ashlar(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  rh: number,
  bw: number,
  rnd: Rnd,
  jitter = 0.1,
): void {
  rect(c, x, y, w, h, shade(col, 0.74));
  let row = 0;
  for (let ly = y; ly < y + h; ly += rh, row++) {
    let bx = x - (row % 2 ? bw * 0.5 : 0) - rnd() * 3;
    while (bx < x + w) {
      const bw2 = bw * (0.7 + rnd() * 0.6);
      rect(c, bx + 0.5, ly + 0.5, bw2 - 1, rh - 1, shade(col, 1 - jitter + rnd() * jitter * 2));
      bx += bw2;
    }
  }
  const hi = new Path2D();
  for (let ly = y + 1; ly < y + h; ly += rh) {
    hi.moveTo(x, ly);
    hi.lineTo(x + w, ly);
  }
  stroke(c, 0.6, 'rgba(255,250,232,0.35)', hi);
}

/** Smooth plaster / whitewash with soft blotches. */
function plaster(c: Ctx, x: number, y: number, w: number, h: number, col: string, rnd: Rnd): void {
  rect(c, x, y, w, h, vgrad(c, y, y + h, col, 1.05, 0.9));
  const n = Math.min(60, (w * h) / 80);
  for (let i = 0; i < n; i++)
    ell(
      c,
      x + rnd() * w,
      y + rnd() * h,
      1.5 + rnd() * 4,
      1 + rnd() * 2,
      rnd() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(110,70,30,0.08)',
    );
}

/** Rubble footing: a row of rounded field stones along a polyline. */
function footing(c: Ctx, pts: readonly number[], rnd: Rnd, col = '#8a8a84', h = 5): void {
  for (let i = 0; i < pts.length - 2; i += 2) {
    const x0 = pts[i]!;
    const y0 = pts[i + 1]!;
    const x1 = pts[i + 2]!;
    const y1 = pts[i + 3]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d < len; d += 5 + rnd() * 3) {
      const t = d / len;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const r = 2.6 + rnd() * 1.6;
      const tone = shade(col, 0.85 + rnd() * 0.3);
      ell(c, x, y - h * 0.4, r + 0.6, h * 0.55 + 0.4, shade(tone, 0.55));
      ell(c, x, y - h * 0.45, r, h * 0.5, tone);
      ell(c, x - r * 0.3, y - h * 0.65, r * 0.45, h * 0.18, 'rgba(255,255,255,0.28)');
    }
  }
}

// ───────────────────────── roof geometry ─────────────────────────

/** A roof slope parameterised by s (along the eave, 0..1) and t (eave 0 → ridge 1). */
interface RoofG {
  at(s: number, t: number): Pt;
  len: number;
  slope: number;
  poly: number[];
}

/** Roof face from its four corners (eave start/end, ridge start/end) with optional bow and sag. */
function roofG(e0: Pt, e1: Pt, r0: Pt, r1: Pt, eBow = 0, rSag = 0): RoofG {
  const at = (s: number, t: number): Pt => {
    const b = 4 * s * (1 - s);
    const ex = e0[0] + (e1[0] - e0[0]) * s;
    const ey = e0[1] + (e1[1] - e0[1]) * s + eBow * b;
    const rx = r0[0] + (r1[0] - r0[0]) * s;
    const ry = r0[1] + (r1[1] - r0[1]) * s + rSag * b;
    return [ex + (rx - ex) * t, ey + (ry - ey) * t];
  };
  const pts: number[] = [];
  const N = eBow || rSag ? 12 : 1;
  for (let i = 0; i <= N; i++) pts.push(...at(i / N, 0));
  for (let i = N; i >= 0; i--) pts.push(...at(i / N, 1));
  return {
    at,
    len: Math.max(
      Math.hypot(e1[0] - e0[0], e1[1] - e0[1]),
      Math.hypot(r1[0] - r0[0], r1[1] - r0[1]),
    ),
    slope: Math.hypot((r0[0] + r1[0] - e0[0] - e1[0]) / 2, (r0[1] + r1[1] - e0[1] - e1[1]) / 2),
    poly: pts,
  };
}

/** Flat local roof face (eave along the bottom) for drawing inside an affine frame. */
function flatRoof(w: number, h: number, apex = false): RoofG {
  return apex
    ? roofG([0, h], [w, h], [w / 2, 0], [w / 2, 0])
    : roofG([0, h], [w, h], [0, 0], [w, 0]);
}

/**
 * Draw in an affine frame: local x runs along `u` (length |u|), local y along `v` (length |v|),
 * both from origin `o`. Used for sloped faces seen at an angle.
 */
function inFrame(c: Ctx, o: Pt, u: Pt, v: Pt, draw: (lu: number, lv: number) => void): void {
  const lu = Math.hypot(u[0], u[1]);
  const lv = Math.hypot(v[0], v[1]);
  c.save();
  c.transform(u[0] / lu, u[1] / lu, v[0] / lv, v[1] / lv, o[0], o[1]);
  draw(lu, lv);
  c.restore();
}

function curve(g: RoofG, t: number, s0 = 0, s1 = 1, n = 12): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(...g.at(s0 + ((s1 - s0) * i) / n, t));
  return out;
}

/** Overlapping wooden shingles ("scales") in curved courses, eave first. */
function shingleRoof(c: Ctx, g: RoofG, col: string, rnd: Rnd, sw = 6.5, rh = 4.4): void {
  clipped(c, g.poly, () => {
    const [bx, by, bw, bh] = bounds(g.poly);
    rect(c, bx, by, bw, bh, shade(col, 0.55));
    const nr = Math.ceil(g.slope / rh) + 1;
    const n = Math.ceil(g.len / sw) + 1;
    const tones = [shade(col, 0.82), col, shade(col, 1.12), shade(col, 1.25)];
    for (let r = 0; r < nr; r++) {
      const t = (r - 0.3) / (nr - 1);
      const paths = tones.map(() => new Path2D());
      const edge = new Path2D();
      const off = (r % 2) * 0.5;
      for (let i = -1; i <= n; i++) {
        const s = (i + off) / n;
        const [x, y] = g.at(s, t);
        const p = paths[Math.min(3, Math.floor(rnd() * 3.3))]!;
        const w = sw * 0.5;
        p.moveTo(x - w, y - rh * 2.2);
        p.lineTo(x - w, y - w * 0.6);
        p.quadraticCurveTo(x - w, y, x, y);
        p.quadraticCurveTo(x + w, y, x + w, y - w * 0.6);
        p.lineTo(x + w, y - rh * 2.2);
        p.closePath();
        edge.moveTo(x - w, y - w * 0.6);
        edge.quadraticCurveTo(x - w, y, x, y);
        edge.quadraticCurveTo(x + w, y, x + w, y - w * 0.6);
      }
      paths.forEach((p, i) => fillP(c, p, tones[i]!));
      stroke(c, 0.8, shade(col, 0.42), edge);
    }
    // Sun on the upper roof, shade towards the eave and the far end.
    rect(c, bx, by, bw, bh, ramp(c, by, by + bh, '255,236,190', 0.16, 0));
    rect(c, bx, by, bw, bh, ramp(c, by, by + bh, '20,14,10', 0, 0.22));
  });
}

/** Turf roof: grass with mottling, tufts, wild flowers and a hanging fringe at the eave. */
function turfRoof(c: Ctx, g: RoofG, rnd: Rnd): void {
  const [bx, by, bw, bh] = bounds(g.poly);
  clipped(c, g.poly, () => {
    rect(c, bx, by, bw, bh, vgrad(c, by, by + bh, '#6c9140', 1.18, 0.78));
    const area = bw * bh * 0.6;
    const blot = ['rgba(140,180,80,0.35)', 'rgba(60,90,40,0.3)', 'rgba(120,110,60,0.25)'];
    for (let i = 0; i < area / 90; i++)
      ell(c, bx + rnd() * bw, by + rnd() * bh, 2 + rnd() * 5, 1.2 + rnd() * 2.5, blot[i % 3]!);
    const lite = new Path2D();
    const dark = new Path2D();
    for (let i = 0; i < area / 34; i++) {
      const x = bx + rnd() * bw;
      const y = by + rnd() * bh;
      const p = rnd() < 0.55 ? lite : dark;
      p.moveTo(x - 1.5, y);
      p.lineTo(x - 2.4, y - 2.8);
      p.moveTo(x, y);
      p.lineTo(x + 0.3, y - 3.6);
      p.moveTo(x + 1.5, y);
      p.lineTo(x + 2.5, y - 2.6);
    }
    stroke(c, 0.75, '#98c25c', lite);
    stroke(c, 0.75, '#3f5d27', dark);
    const fl = ['#f4f0e0', '#f1d34a', '#c78ad8'];
    for (let i = 0; i < area / 260; i++) disc(c, bx + rnd() * bw, by + rnd() * bh, 0.9, fl[i % 3]!);
    rect(c, bx, by, bw, bh, ramp(c, by, by + bh, '255,240,190', 0.14, 0));
  });
  // Eave log (torvvol) holding the turf, birch bark and a hanging grass fringe.
  const eave = curve(g, 0.02);
  trace(c, eave, false);
  stroke(c, 3.2, '#4a3320');
  trace(c, eave, false);
  stroke(c, 1.2, '#7a5838');
  const fringe = new Path2D();
  for (let s = 0; s <= 1; s += 0.012) {
    const [x, y] = g.at(s, 0.03);
    fringe.moveTo(x, y - 1.5);
    fringe.lineTo(x + (rnd() - 0.5) * 2, y + 1.5 + rnd() * 2.5);
  }
  stroke(c, 1, '#57802f', fringe);
  // Rounded turf crest along the ridge.
  const ridge = curve(g, 1);
  trace(c, ridge, false);
  stroke(c, 4, '#4f7330');
  trace(c, ridge, false);
  stroke(c, 1.6, '#8cb556');
}

/** Straw thatch laid in courses, eave first, with crossed ridge riders. */
function thatchRoof(c: Ctx, g: RoofG, col: string, rnd: Rnd, riders = true): void {
  clipped(c, g.poly, () => {
    const [bx, by, bw, bh] = bounds(g.poly);
    rect(c, bx, by, bw, bh, shade(col, 0.6));
    const nr = Math.max(4, Math.round(g.slope / 8));
    const n = Math.round(g.len / 1.6);
    const tones = [shade(col, 0.72), shade(col, 0.92), col, shade(col, 1.18)];
    for (let r = 0; r < nr; r++) {
      const t0 = (r - 0.2) / nr;
      const t1 = t0 + 1.7 / nr;
      trace(c, curve(g, t0 + 0.012), false);
      stroke(c, 1.6, 'rgba(40,26,10,0.35)');
      const paths = tones.map(() => new Path2D());
      for (let i = 0; i <= n; i++) {
        const s = (i + rnd()) / n;
        const [x0, y0] = g.at(s, t0);
        const [x1, y1] = g.at(s, t1);
        const p = paths[Math.floor(rnd() * 4)]!;
        p.moveTo(x1, y1);
        p.lineTo(x0 + (rnd() - 0.5) * 1.6, y0 + rnd() * 1.5);
      }
      paths.forEach((p, i) => stroke(c, 1.1, tones[i]!, p));
    }
    rect(c, bx, by, bw, bh, ramp(c, by, by + bh, '255,240,190', 0.18, 0));
    rect(c, bx, by, bw, bh, ramp(c, by, by + bh, '30,20,8', 0, 0.2));
  });
  // Bound ridge with pairs of crossed riders.
  const ridge = curve(g, 1);
  trace(c, ridge, false);
  stroke(c, 4.5, shade(col, 0.62));
  trace(c, ridge, false);
  stroke(c, 1.5, shade(col, 1.1));
  if (riders)
    for (let s = 0.06; s < 0.97; s += 0.11) {
      const [x, y] = g.at(s, 1);
      line(c, x - 3, y + 2, x + 2.5, y - 4.5, 1.6, '#5a3e24');
      line(c, x + 3, y + 2, x - 2.5, y - 4.5, 1.6, '#5a3e24');
    }
}

/** Terracotta pan-and-cover tiles: cover-tile ribs run up the slope, courses along it. */
function tileRoof(c: Ctx, g: RoofG, col: string, rnd: Rnd, cw = 5.2, antefix = true): void {
  const n = Math.round(g.len / cw);
  clipped(c, g.poly, () => {
    const [bx, by, bw, bh] = bounds(g.poly);
    rect(c, bx, by, bw, bh, shade(col, 0.72));
    const nr = Math.max(3, Math.round(g.slope / 6));
    // Pan tiles: slightly varied courses.
    for (let r = 0; r < nr; r++) {
      const t0 = r / nr;
      const p = new Path2D();
      trace(p, [...curve(g, t0, 0, 1, 6), ...revPts(curve(g, t0 + 1 / nr, 0, 1, 6))]);
      fillP(c, p, shade(col, 0.82 + rnd() * 0.12));
    }
    const rib = new Path2D();
    const hi = new Path2D();
    const sh = new Path2D();
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const [x0, y0] = g.at(s, -0.02);
      const [x1, y1] = g.at(s, 1.02);
      rib.moveTo(x0, y0);
      rib.lineTo(x1, y1);
      hi.moveTo(x0 - cw * 0.18, y0);
      hi.lineTo(x1 - cw * 0.18, y1);
      sh.moveTo(x0 + cw * 0.3, y0);
      sh.lineTo(x1 + cw * 0.3, y1);
    }
    stroke(c, cw * 0.32, shade(col, 0.55), sh);
    stroke(c, cw * 0.5, shade(col, 1.08), rib);
    stroke(c, cw * 0.14, shade(col, 1.4), hi);
    const course = new Path2D();
    for (let r = 1; r < nr; r++) trace(course, curve(g, r / nr), false);
    stroke(c, 0.8, 'rgba(70,22,12,0.5)', course);
    rect(c, bx, by, bw, bh, ramp(c, by, by + bh, '255,236,200', 0.18, 0));
  });
  // Ridge tiles.
  const ridge = curve(g, 1);
  trace(c, ridge, false);
  stroke(c, 3.6, shade(col, 0.7));
  trace(c, ridge, false);
  stroke(c, 1.3, shade(col, 1.25));
  // Palmette antefixes along the eave.
  if (antefix)
    for (let i = 0; i <= n; i += 2) {
      const [x, y] = g.at(i / n, 0);
      c.fillStyle = '#efe6d0';
      c.beginPath();
      c.moveTo(x - 1.8, y + 0.5);
      c.quadraticCurveTo(x - 1.8, y - 3.2, x, y - 3.6);
      c.quadraticCurveTo(x + 1.8, y - 3.2, x + 1.8, y + 0.5);
      c.closePath();
      c.fill();
    }
}

/** Reverse a flat point list pairwise. */
function revPts(pts: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i]!, pts[i + 1]!);
  return out;
}

// ───────────────────────── building volume ─────────────────────────

/**
 * A gabled building seen in three-quarter view: the long front wall faces the viewer and the
 * (sunlit) west gable shows on the left, its depth receding up-left by (dx, dy).
 */
interface Box {
  x0: number;
  x1: number;
  base: number;
  wallH: number;
  dx: number;
  dy: number;
  rise: number;
  bow?: number;
  sag?: number;
  ov?: number;
}

interface BoxG {
  b: Box;
  eave: number;
  ridge: number;
  X(s: number): number;
  top(s: number): number;
  bot(s: number): number;
  front: number[];
  gable: number[];
  roof: RoofG;
  apex: Pt;
}

function boxG(b: Box): BoxG {
  const bow = b.bow ?? 0;
  const ov = b.ov ?? 3;
  const eave = b.base - b.wallH;
  const ridge = eave - b.dy / 2 - b.rise;
  const X = (s: number): number => b.x0 + (b.x1 - b.x0) * s;
  const bw = (s: number): number => bow * 4 * s * (1 - s);
  const top = (s: number): number => eave + bw(s);
  const bot = (s: number): number => b.base + bw(s);
  const front: number[] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) front.push(X(i / N), top(i / N));
  for (let i = N; i >= 0; i--) front.push(X(i / N), bot(i / N));
  const gable = [
    b.x0,
    b.base,
    b.x0,
    eave,
    b.x0 - b.dx / 2,
    ridge,
    b.x0 - b.dx,
    eave - b.dy,
    b.x0 - b.dx,
    b.base - b.dy,
  ];
  const roof = roofG(
    [b.x0, eave + 1],
    [b.x1 + ov, eave + 1],
    [b.x0 - b.dx / 2, ridge],
    [b.x1 + ov - b.dx / 2, ridge],
    bow,
    b.sag ?? 0,
  );
  return { b, eave, ridge, X, top, bot, front, gable, roof, apex: [b.x0 - b.dx / 2, ridge] };
}

/** Draw in the plane of the west gable: local x runs back along the depth, y down from the eave. */
function inGable(c: Ctx, g: BoxG, draw: (lu: number) => void): void {
  const { b } = g;
  const lu = Math.hypot(b.dx, b.dy);
  c.save();
  c.transform(-b.dx / lu, -b.dy / lu, 0, 1, b.x0, g.eave);
  trace(c, [0, b.wallH, 0, 0, lu / 2, -b.rise, lu, 0, lu, b.wallH]);
  c.clip();
  draw(lu);
  c.restore();
}

/** Wall surface kinds shared by the volume painter. */
type WallKind = 'stave' | 'daub' | 'logs' | 'plaster' | 'marble' | 'mud' | 'sandstone';

function wallTex(
  c: Ctx,
  kind: WallKind,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  rnd: Rnd,
): void {
  switch (kind) {
    case 'stave':
      boards(c, x, y, w, h, col, 4.2, rnd);
      break;
    case 'logs':
      rows(c, x, y, w, h, col, 5.2, rnd, true);
      break;
    case 'daub': {
      plaster(c, x, y, w, h, col, rnd);
      // Wattle showing through worn daub.
      const p = new Path2D();
      for (let i = 0; i < (w * h) / 500; i++) {
        const px = x + rnd() * w;
        const py = y + rnd() * h;
        for (let k = 0; k < 3; k++) {
          p.moveTo(px, py + k * 2);
          p.quadraticCurveTo(px + 3, py + k * 2 + (k % 2 ? 1 : -1), px + 6, py + k * 2);
        }
      }
      stroke(c, 0.9, 'rgba(110,78,44,0.7)', p);
      break;
    }
    case 'plaster':
    case 'mud':
      plaster(c, x, y, w, h, col, rnd);
      break;
    case 'marble':
      ashlar(c, x, y, w, h, col, 7, 16, rnd, 0.05);
      break;
    case 'sandstone':
      ashlar(c, x, y, w, h, col, 8, 15, rnd, 0.08);
      break;
  }
}

interface VolumeStyle {
  wall: WallKind;
  wallCol: string;
  gableCol?: string;
  roof: 'shingle' | 'turf' | 'thatch' | 'tile' | 'slate';
  roofCol: string;
  footing?: string;
}

/** Paint walls (gable + front) of a box. Roof is separate so callers can decorate the wall first. */
function boxWalls(c: Ctx, g: BoxG, v: VolumeStyle, rnd: Rnd): void {
  const { b } = g;
  if (b.dx > 0) {
    inGable(c, g, (lu) => {
      wallTex(c, v.wall, 0, -b.rise, lu, b.wallH + b.rise, v.gableCol ?? v.wallCol, rnd);
      rect(c, 0, -b.rise, lu, b.wallH + b.rise, 'rgba(255,236,190,0.12)');
      // Shade under the eaves of the gable.
      rect(c, 0, -2, lu, 7, ramp(c, -2, 5, '20,12,6', 0.28, 0));
    });
    trace(c, g.gable);
    stroke(c, 0.9, INK);
  }
  clipped(c, g.front, () => {
    const y0 = g.eave - 2;
    const h = b.wallH + (b.bow ?? 0) + 4;
    wallTex(c, v.wall, b.x0, y0, b.x1 - b.x0, h, v.wallCol, rnd);
    rect(c, b.x0, y0, b.x1 - b.x0, h, ramp(c, y0, y0 + h, '20,14,24', 0.0, 0.2));
    // Eave shadow band and a darker far end.
    const sh = c.createLinearGradient(0, y0, 0, y0 + 12);
    sh.addColorStop(0, 'rgba(18,12,6,0.55)');
    sh.addColorStop(1, 'rgba(18,12,6,0)');
    rect(c, b.x0, y0, b.x1 - b.x0, 12, sh);
    const ed = c.createLinearGradient(b.x1 - 14, 0, b.x1, 0);
    ed.addColorStop(0, 'rgba(18,12,6,0)');
    ed.addColorStop(1, 'rgba(18,12,6,0.25)');
    rect(c, b.x1 - 14, y0, 14, h, ed);
  });
  if (v.footing) {
    const pts: number[] = [];
    if (b.dx > 0) pts.push(b.x0 - b.dx, b.base - b.dy);
    for (let i = 0; i <= 10; i++) pts.push(g.X(i / 10), g.bot(i / 10) + 1.5);
    footing(c, pts, rnd, v.footing);
  }
}

function boxRoof(c: Ctx, g: BoxG, v: VolumeStyle, rnd: Rnd): void {
  const r = g.roof;
  switch (v.roof) {
    case 'shingle':
    case 'slate':
      if (v.roof === 'slate') shingleRoof(c, r, v.roofCol, rnd, 7.5, 4.2);
      else shingleRoof(c, r, v.roofCol, rnd);
      // Ridge board.
      trace(c, curve(r, 1), false);
      stroke(c, 3.4, '#2e2016');
      trace(c, curve(r, 1), false);
      stroke(c, 1.6, shade(v.roofCol, 1.3));
      break;
    case 'turf':
      turfRoof(c, r, rnd);
      break;
    case 'thatch':
      thatchRoof(c, r, v.roofCol, rnd);
      break;
    case 'tile':
      tileRoof(c, r, v.roofCol, rnd);
      break;
  }
}

// ───────────────────────── details ─────────────────────────

/** Small window with a warm glow; `shutter` adds an open painted shutter on the left. */
function windowLit(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: string,
  shutter?: string,
  arch = false,
): void {
  const o = 1.6;
  c.fillStyle = frame;
  c.beginPath();
  if (arch) {
    c.moveTo(x - o, y + h + o);
    c.lineTo(x - o, y + w / 2);
    c.arc(x + w / 2, y + w / 2, w / 2 + o, Math.PI, 0);
    c.lineTo(x + w + o, y + h + o);
  } else c.rect(x - o, y - o, w + o * 2, h + o * 2);
  c.fill();
  c.fillStyle = glow(c, y, y + h);
  c.beginPath();
  if (arch) {
    c.moveTo(x, y + h);
    c.lineTo(x, y + w / 2);
    c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
    c.lineTo(x + w, y + h);
  } else c.rect(x, y, w, h);
  c.fill();
  line(c, x + w / 2, y + 0.5, x + w / 2, y + h, 0.8, shade(frame, 0.8));
  line(c, x, y + h * 0.5, x + w, y + h * 0.5, 0.6, shade(frame, 0.8));
  if (shutter) {
    const sw = w * 0.55;
    rect(c, x - o - sw, y - o, sw, h + o * 2, vgrad(c, y, y + h, shutter, 1.15, 0.8));
    line(c, x - o - sw * 0.5, y, x - o - sw * 0.5, y + h, 0.5, shade(shutter, 0.6));
    c.strokeStyle = INK;
    c.lineWidth = 0.7;
    c.strokeRect(x - o - sw, y - o, sw, h + o * 2);
  }
  rect(c, x - o - 1, y + h + o, w + o * 2 + 2, 1.6, shade(frame, 1.25));
}

/** Plank door with iron strap hinges and a ring pull. */
function plankDoor(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  rnd: Rnd,
  arch = false,
): void {
  c.save();
  c.beginPath();
  if (arch) {
    c.moveTo(x, y + h);
    c.lineTo(x, y + w / 2);
    c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
    c.lineTo(x + w, y + h);
  } else c.rect(x, y, w, h);
  c.clip();
  boards(c, x, y, w, h, col, Math.max(2.6, w / 5), rnd);
  rect(c, x, y, w, h, ramp(c, y, y + h, '0,0,0', 0.25, 0.05));
  for (const f of [0.3, 0.72]) {
    const yy = y + h * f;
    line(c, x + 0.5, yy, x + w * 0.62, yy, 1.1, IRON);
    c.beginPath();
    c.arc(x + w * 0.62 + 1, yy - 1, 1.2, Math.PI * 0.5, Math.PI * 2.2);
    stroke(c, 0.7, IRON);
  }
  c.restore();
  c.beginPath();
  c.arc(x + w * 0.78, y + h * 0.52, 1.3, 0, Math.PI * 2);
  stroke(c, 0.8, '#c9a24a');
}

/** Norse carved portal: painted interlace posts and lintel around a plank door. */
function nDoor(c: Ctx, cx: number, by: number, w: number, h: number, rnd: Rnd): void {
  const x = cx - w / 2;
  const y = by - h;
  const fw = 3.4;
  rect(c, x - fw - 3, by - 1, w + fw * 2 + 6, 3.2, vgrad(c, by - 1, by + 2, '#8e8c86'));
  rect(c, x - fw, y - fw - 1, w + fw * 2, h + fw + 1, vgrad(c, y, by, '#a2734a', 1.2, 0.8));
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.strokeRect(x - fw, y - fw - 1, w + fw * 2, h + fw + 1);
  const red = new Path2D();
  const blue = new Path2D();
  for (let yy = y; yy < by - 2; yy += 3.4) {
    for (const px of [x - fw, x + w]) {
      red.moveTo(px + 0.7, yy);
      red.lineTo(px + fw - 0.7, yy + 1.7);
      red.lineTo(px + 0.7, yy + 3.4);
      blue.moveTo(px + fw * 0.5 + 0.5, yy + 1.7);
      blue.arc(px + fw * 0.5, yy + 1.7, 0.5, 0, Math.PI * 2);
    }
  }
  for (let xx = x - fw; xx < x + w + fw - 2; xx += 3.4) {
    red.moveTo(xx, y - fw + 0.2);
    red.lineTo(xx + 1.7, y - 1.4);
    red.lineTo(xx + 3.4, y - fw + 0.2);
  }
  stroke(c, 0.8, '#b8402a', red);
  fillP(c, blue, '#2f5c96');
  rect(c, x - 0.5, y - 0.5, w + 1, h + 0.5, '#2a1a10');
  plankDoor(c, x, y, w, h, '#62432a', rnd);
}

/** Round shield: painted field, rim, plank lines and an iron boss. */
function shield(c: Ctx, x: number, y: number, r: number, a: string, b: string, kind: number): void {
  disc(c, x, y, r + 1, '#3a2818');
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  rect(c, x - r, y - r, r * 2, r * 2, a);
  c.fillStyle = b;
  if (kind === 1) c.fillRect(x, y - r, r, r * 2);
  else if (kind === 2) {
    c.fillRect(x - r, y - r, r, r);
    c.fillRect(x, y, r, r);
  } else if (kind === 3) {
    for (let k = 0; k < 4; k++) {
      const a0 = (k * Math.PI) / 2;
      c.beginPath();
      c.moveTo(x, y);
      c.arc(x, y, r, a0, a0 + 0.75);
      c.quadraticCurveTo(x + Math.cos(a0 + 0.2) * r * 0.5, y + Math.sin(a0 + 0.2) * r * 0.5, x, y);
      c.fill();
    }
  } else if (kind === 4) {
    c.fillRect(x - r, y - r * 0.22, r * 2, r * 0.44);
    c.fillRect(x - r * 0.22, y - r, r * 0.44, r * 2);
  }
  const pl = new Path2D();
  for (let i = -r + 2.2; i < r; i += 2.4) {
    pl.moveTo(x + i, y - r);
    pl.lineTo(x + i, y + r);
  }
  stroke(c, 0.35, 'rgba(0,0,0,0.22)', pl);
  const sg = c.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x, y, r * 1.15);
  sg.addColorStop(0, 'rgba(255,250,230,0.3)');
  sg.addColorStop(1, 'rgba(0,0,0,0.3)');
  rect(c, x - r, y - r, r * 2, r * 2, sg);
  c.restore();
  disc(c, x, y, r * 0.3 + 0.4, '#2a2a2c');
  disc(c, x, y, r * 0.3, rgrad(c, x, y, r * 0.3, '#a4a7ae'));
}

function raven(c: Ctx, x: number, y: number, s: number, col = '#1c1a1d'): void {
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(x, y, 3.2 * s, 1.7 * s, -0.15, 0, Math.PI * 2);
  c.fill();
  disc(c, x - 3.3 * s, y - 1 * s, 1.3 * s, col);
  poly(c, [x - 4.4 * s, y - 1.3 * s, x - 6.4 * s, y - 0.4 * s, x - 4.3 * s, y - 0.2 * s], col);
  poly(c, [x - 1.2 * s, y - 1 * s, x + 2.2 * s, y - 5.6 * s, x + 3.6 * s, y - 0.8 * s], col);
  poly(c, [x + 2.6 * s, y, x + 5.8 * s, y + 1.8 * s, x + 2.8 * s, y + 1.5 * s], col);
}

/** Viking raven banner on a spear-tipped pole, flying to the left. */
function ravenBanner(c: Ctx, x: number, top: number, poleH: number, team: string, s = 1): void {
  line(c, x, top + poleH, x, top - 2 * s, 2 * s, '#4a3420');
  poly(
    c,
    [x, top - 9 * s, x - 1.7 * s, top - 3 * s, x + 1.7 * s, top - 3 * s],
    '#c9ccd2',
    INK,
    0.6,
  );
  const L = 24 * s;
  const H = 20 * s;
  const fx = x - 1;
  c.beginPath();
  c.moveTo(fx, top);
  c.lineTo(fx - L * 0.92, top + H * 0.08);
  c.quadraticCurveTo(fx - L * 1.02, top + H * 0.72, fx, top + H);
  c.closePath();
  c.fillStyle = vgrad(c, top, top + H, team, 1.25, 0.72);
  c.fill();
  stroke(c, 0.8, INK);
  const fr = new Path2D();
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const qx = (1 - t) * (1 - t) * (fx - L * 0.92) + 2 * (1 - t) * t * (fx - L * 1.02) + t * t * fx;
    const qy =
      (1 - t) * (1 - t) * (top + H * 0.08) + 2 * (1 - t) * t * (top + H * 0.72) + t * t * (top + H);
    fr.moveTo(qx, qy);
    fr.lineTo(qx - 1.6 * s * (1 - t * 0.6), qy + 1.8 * s * (0.4 + t));
  }
  stroke(c, 0.9 * s, '#e3c56a', fr);
  raven(c, fx - L * 0.45, top + H * 0.42, s * 0.9);
}

/** Cloth banner hanging from a crossbar on a pole (team field, gold trim). */
function clothBanner(
  c: Ctx,
  x: number,
  top: number,
  poleH: number,
  w: number,
  h: number,
  team: string,
  trim = GOLD,
  emblem?: (cx: number, cy: number) => void,
): void {
  line(c, x, top + poleH, x, top - 3, 2.2, '#4a3420');
  disc(c, x, top - 4, 2.2, rgrad(c, x, top - 4, 2.2, GOLD));
  line(c, x - w / 2 - 2, top + 2, x + w / 2 + 2, top + 2, 1.6, '#5a3e24');
  const pts = [
    x - w / 2,
    top + 2,
    x + w / 2,
    top + 2,
    x + w / 2,
    top + h,
    x,
    top + h - 5,
    x - w / 2,
    top + h,
  ];
  poly(c, pts, vgrad(c, top, top + h, team, 1.25, 0.7), INK, 0.8);
  c.strokeStyle = trim;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - w / 2 + 2, top + 4);
  c.lineTo(x - w / 2 + 2, top + h - 2.5);
  c.lineTo(x, top + h - 7);
  c.lineTo(x + w / 2 - 2, top + h - 2.5);
  c.lineTo(x + w / 2 - 2, top + 4);
  c.stroke();
  rect(c, x - w / 2, top + h * 0.45, w, h * 0.12, 'rgba(0,0,0,0.12)');
  emblem?.(x, top + h * 0.42);
}

/** Narrow pennant streaming to the left from a pole top. */
function pennant(c: Ctx, x: number, y: number, len: number, team: string): void {
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x - len * 0.5, y - 2, x - len, y + 3);
  c.quadraticCurveTo(x - len * 0.5, y + 4, x, y + 7);
  c.closePath();
  c.fillStyle = vgrad(c, y, y + 7, team, 1.25, 0.75);
  c.fill();
  stroke(c, 0.7, INK);
}

// ───────────────────────── props ─────────────────────────

function barrel(c: Ctx, x: number, y: number, r = 5): void {
  const h = r * 1.8;
  c.beginPath();
  c.moveTo(x - r * 0.82, y);
  c.quadraticCurveTo(x - r * 1.1, y - h / 2, x - r * 0.82, y - h);
  c.lineTo(x + r * 0.82, y - h);
  c.quadraticCurveTo(x + r * 1.1, y - h / 2, x + r * 0.82, y);
  c.closePath();
  c.fillStyle = hgrad(c, x - r, x + r, '#8e5e36');
  c.fill();
  stroke(c, 0.8, INK);
  const st = new Path2D();
  for (const f of [-0.45, 0, 0.45]) {
    st.moveTo(x + f * r, y - h);
    st.quadraticCurveTo(x + f * r * 1.25, y - h / 2, x + f * r, y);
  }
  stroke(c, 0.5, 'rgba(40,24,10,0.6)', st);
  for (const f of [0.22, 0.78]) line(c, x - r * 1.0, y - h * f, x + r * 1.0, y - h * f, 1.1, IRON);
  ell(c, x, y - h, r * 0.82, 1.6, '#b0814f');
  ell(c, x, y - h, r * 0.82, 1.6, 'rgba(0,0,0,0)');
}

function crate(c: Ctx, x: number, y: number, s: number, col = '#a8763f'): void {
  const d = s * 0.32;
  poly(
    c,
    [x, y - s, x + d, y - s - d, x + s + d, y - s - d, x + s, y - s],
    shade(col, 1.25),
    INK,
    0.7,
  );
  poly(
    c,
    [x + s, y, x + s, y - s, x + s + d, y - s - d, x + s + d, y - d],
    shade(col, 0.7),
    INK,
    0.7,
  );
  rect(c, x, y - s, s, s, col);
  c.strokeStyle = shade(col, 0.55);
  c.lineWidth = 1;
  c.strokeRect(x + 0.8, y - s + 0.8, s - 1.6, s - 1.6);
  line(c, x + 1, y - 1, x + s - 1, y - s + 1, 1, shade(col, 0.55));
  c.strokeStyle = INK;
  c.lineWidth = 0.7;
  c.strokeRect(x, y - s, s, s);
}

function sack(c: Ctx, x: number, y: number, s = 1, col = '#cfb98c'): void {
  c.beginPath();
  c.moveTo(x - 4.5 * s, y);
  c.quadraticCurveTo(x - 5.5 * s, y - 6 * s, x - 1.6 * s, y - 8.5 * s);
  c.lineTo(x + 1.6 * s, y - 8.5 * s);
  c.quadraticCurveTo(x + 5.5 * s, y - 6 * s, x + 4.5 * s, y);
  c.closePath();
  c.fillStyle = hgrad(c, x - 5 * s, x + 5 * s, col);
  c.fill();
  stroke(c, 0.7, INK);
  line(c, x - 1.8 * s, y - 8.5 * s, x + 1.8 * s, y - 8.5 * s, 1.2, shade(col, 0.6));
  poly(c, [x - 1.5 * s, y - 8.6 * s, x, y - 10.5 * s, x + 1.5 * s, y - 8.6 * s], shade(col, 0.9));
  line(c, x - 2 * s, y - 5 * s, x + 0.5 * s, y - 2 * s, 0.6, shade(col, 0.7));
}

/** Firewood stacked between two posts, end grain facing out. */
function woodpile(c: Ctx, x: number, y: number, w: number, h: number, rnd: Rnd, roof = true): void {
  rect(c, x, y - h, w, h, '#3a2818');
  const r = 2.6;
  for (let ry = y - r; ry > y - h + r - 1; ry -= r * 1.75) {
    const off = Math.round((y - ry) / (r * 1.75)) % 2 ? r : 0;
    for (let rx = x + r + off * 0.5; rx < x + w - r * 0.5; rx += r * 1.95) {
      const jx = rx + (rnd() - 0.5) * 0.6;
      const jy = ry + (rnd() - 0.5) * 0.6;
      disc(c, jx, jy, r, '#5e4128');
      disc(c, jx, jy, r * 0.74, shade('#d6ad74', 0.9 + rnd() * 0.2));
      if (rnd() < 0.5) {
        c.beginPath();
        c.arc(jx, jy, r * 0.35, 0, Math.PI * 2);
        stroke(c, 0.4, 'rgba(120,80,40,0.7)');
      }
    }
  }
  line(c, x, y + 1, x, y - h - 2, 2, '#5a3e24');
  line(c, x + w, y + 1, x + w, y - h - 2, 2, '#5a3e24');
  if (roof) {
    poly(
      c,
      [
        x - 3,
        y - h - 1,
        x + w / 2,
        y - h - 5,
        x + w + 3,
        y - h - 1,
        x + w + 3,
        y - h + 1.5,
        x - 3,
        y - h + 1.5,
      ],
      '#6a4a2c',
      INK,
      0.7,
    );
  }
}

/** Logs lying lengthwise in a small pyramid (end grain on the right). */
function logPile(c: Ctx, x: number, y: number, len: number, rnd: Rnd, n = 3): void {
  const r = 3;
  for (let row = 0; row < n; row++)
    for (let i = n - row - 1; i >= 0; i--) {
      const ly = y - r - row * r * 1.6 - i * 1.2;
      const lx = x + row * 1.6 + i * 1.4;
      c.fillStyle = vgrad(c, ly - r, ly + r, '#86603a', 1.25, 0.7);
      c.fillRect(lx, ly - r, len, r * 2);
      line(c, lx + 2, ly - 0.5, lx + len - 4, ly - 0.5, 0.5, 'rgba(50,30,15,0.6)');
      disc(c, lx + len, ly, r, '#5a3c22');
      disc(c, lx + len, ly, r * 0.75, shade('#d9b07a', 0.9 + rnd() * 0.15));
    }
}

function hay(c: Ctx, x: number, y: number, w = 18): void {
  const h = w * 0.62;
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.quadraticCurveTo(x - w / 2 - 1, y - h, x, y - h - 1);
  c.quadraticCurveTo(x + w / 2 + 1, y - h, x + w / 2, y);
  c.closePath();
  c.fillStyle = vgrad(c, y - h, y, '#e1c45e', 1.15, 0.75);
  c.fill();
  stroke(c, 0.8, INK);
  const p = new Path2D();
  for (let i = -3; i <= 3; i++) {
    p.moveTo(x + i * w * 0.12, y - h * 0.85 + Math.abs(i) * 1.2);
    p.lineTo(x + i * w * 0.15, y - 1);
  }
  stroke(c, 0.6, '#a8872e', p);
}

/** Drying rack (hjell) hung with stockfish. */
function fishRack(c: Ctx, x: number, y: number, w: number, h: number): void {
  for (const px of [x, x + w]) {
    line(c, px - 3, y, px, y - h, 1.6, '#6a4a2c');
    line(c, px + 3, y, px, y - h, 1.6, '#5a3e24');
  }
  line(c, x - 1, y - h + 1, x + w + 1, y - h + 1, 1.6, '#7a5634');
  for (let fx = x + 3; fx < x + w - 1; fx += 3.6) {
    const fy = y - h + 2;
    const L = 9 + ((fx * 7) % 3);
    c.fillStyle = (fx * 13) % 2 > 1 ? '#d8d2c0' : '#9c9480';
    c.beginPath();
    c.moveTo(fx - 1.1, fy);
    c.lineTo(fx + 1.1, fy);
    c.lineTo(fx + 1.6, fy + L * 0.75);
    c.lineTo(fx + 2.4, fy + L);
    c.lineTo(fx - 2.4, fy + L);
    c.lineTo(fx - 1.6, fy + L * 0.75);
    c.closePath();
    c.fill();
    stroke(c, 0.6, 'rgba(40,30,20,0.8)');
  }
}

/** Two-wheeled cart, side view. */
function cart(c: Ctx, x: number, y: number, s: number, rnd: Rnd, load?: string): void {
  line(c, x - 2 * s, y - 6 * s, x - 13 * s, y - 2 * s, 1.4 * s, '#6a4a2c');
  rect(c, x - 3 * s, y - 11 * s, 18 * s, 6 * s, '#8a6238');
  rows(c, x - 3 * s, y - 11 * s, 18 * s, 6 * s, '#8a6238', 2 * s, rnd);
  c.strokeStyle = INK;
  c.lineWidth = 0.7;
  c.strokeRect(x - 3 * s, y - 11 * s, 18 * s, 6 * s);
  if (load) {
    c.fillStyle = vgrad(c, y - 16 * s, y - 11 * s, load);
    c.beginPath();
    c.ellipse(x + 6 * s, y - 11 * s, 8 * s, 4 * s, 0, Math.PI, 0);
    c.fill();
    stroke(c, 0.6, INK);
  }
  wheel(c, x + 6 * s, y - 4.2 * s, 4.3 * s);
}

function wheel(c: Ctx, x: number, y: number, r: number): void {
  disc(c, x, y, r + 0.6, '#3a2818');
  disc(c, x, y, r - 0.6, 'rgba(0,0,0,0)');
  c.beginPath();
  c.arc(x, y, r - 0.4, 0, Math.PI * 2);
  stroke(c, 1.4, '#9a6c40');
  const sp = new Path2D();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    sp.moveTo(x, y);
    sp.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  stroke(c, 0.9, '#7a5634', sp);
  disc(c, x, y, r * 0.22, '#5a3e24');
}

/** Runestone with a red-painted serpent band of runes. */
function runestone(c: Ctx, x: number, y: number, h: number, rnd: Rnd): void {
  const w = h * 0.45;
  c.beginPath();
  c.moveTo(x - w * 0.5, y);
  c.quadraticCurveTo(x - w * 0.62, y - h * 0.7, x - w * 0.2, y - h);
  c.quadraticCurveTo(x + w * 0.45, y - h * 1.02, x + w * 0.52, y - h * 0.5);
  c.lineTo(x + w * 0.46, y);
  c.closePath();
  c.fillStyle = hgrad(c, x - w / 2, x + w / 2, '#8e9088', 1.25, 0.65);
  c.fill();
  stroke(c, 0.9, INK);
  for (let i = 0; i < 6; i++)
    ell(c, x + (rnd() - 0.5) * w * 0.7, y - rnd() * h * 0.9, 1.5, 0.8, 'rgba(60,70,50,0.35)');
  // Serpent band: a looping ribbon with rune ticks.
  c.beginPath();
  c.moveTo(x - w * 0.28, y - 2);
  c.quadraticCurveTo(x - w * 0.42, y - h * 0.7, x - w * 0.05, y - h * 0.86);
  c.quadraticCurveTo(x + w * 0.34, y - h * 0.84, x + w * 0.28, y - h * 0.45);
  c.quadraticCurveTo(x + w * 0.22, y - h * 0.18, x - w * 0.05, y - h * 0.3);
  stroke(c, 2.6, '#b8382a');
  stroke(c, 0.6, '#5a1a12');
  disc(c, x - w * 0.06, y - h * 0.3, 1.3, '#b8382a');
  const t = new Path2D();
  for (let k = 0; k < 7; k++) {
    const yy = y - h * 0.15 - k * h * 0.09;
    t.moveTo(x - w * 0.36 + k * 0.4, yy);
    t.lineTo(x - w * 0.36 + k * 0.4 + 1, yy - 1.4);
  }
  stroke(c, 0.5, '#2a1a12', t);
}

function anvil(c: Ctx, x: number, y: number): void {
  rect(c, x - 4, y - 7, 8, 7, vgrad(c, y - 7, y, '#7a5634'));
  ell(c, x, y - 7, 4, 1.4, '#a8804e');
  poly(
    c,
    [
      x - 6,
      y - 12,
      x + 5,
      y - 12,
      x + 9,
      y - 11,
      x + 5,
      y - 9.6,
      x + 2.5,
      y - 9.6,
      x + 2.5,
      y - 7.6,
      x - 3,
      y - 7.6,
      x - 3,
      y - 9.6,
      x - 6,
      y - 9.6,
    ],
    '#4b4d52',
    INK,
    0.7,
  );
  line(c, x - 5.5, y - 11.6, x + 6, y - 11.6, 0.7, '#9da0a8');
  line(c, x - 2, y - 12.6, x + 4, y - 12.4, 1.2, '#ff9a3a');
}

function grindstone(c: Ctx, x: number, y: number): void {
  line(c, x - 6, y, x - 4, y - 9, 1.5, '#6a4a2c');
  line(c, x + 6, y, x + 4, y - 9, 1.5, '#6a4a2c');
  disc(c, x, y - 9, 5.5, rgrad(c, x, y - 9, 5.5, '#9a958a'));
  c.beginPath();
  c.arc(x, y - 9, 5.5, 0, Math.PI * 2);
  stroke(c, 0.7, INK);
  disc(c, x, y - 9, 1, IRON);
  line(c, x, y - 9, x + 7, y - 6, 1, IRON);
}

function trough(c: Ctx, x: number, y: number, w: number): void {
  poly(
    c,
    [x, y - 6, x + w, y - 6, x + w - 1.5, y, x + 1.5, y],
    vgrad(c, y - 6, y, '#7a5634'),
    INK,
    0.7,
  );
  rect(c, x + 1, y - 6, w - 2, 1.8, '#5d93b8');
  line(c, x + 2, y - 5.6, x + w * 0.4, y - 5.6, 0.5, '#bde0f0');
}

function bush(c: Ctx, x: number, y: number, r: number, col: string, rnd: Rnd): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI - Math.PI;
    const bx = x + Math.cos(a) * r * 0.6;
    const by = y - r * 0.5 + Math.sin(a) * r * 0.4;
    disc(c, bx, by, r * (0.5 + rnd() * 0.2), rgrad(c, bx, by, r * 0.6, col));
  }
  disc(c, x, y - r * 0.6, r * 0.6, rgrad(c, x, y - r * 0.6, r * 0.6, shade(col, 1.08)));
}

/** Wooden split-rail fence along a horizontal run. */
function railFence(c: Ctx, x: number, y: number, w: number, h = 9): void {
  line(c, x, y - h * 0.75, x + w, y - h * 0.75, 1.5, '#8a6238');
  line(c, x, y - h * 0.35, x + w, y - h * 0.35, 1.5, '#7a5634');
  for (let px = x; px <= x + w + 0.1; px += 11) {
    line(c, px, y + 1, px, y - h, 2.2, '#5e4128');
    line(c, px - 0.5, y - h, px - 0.5, y, 0.6, '#9a7450');
  }
}

/** Woven wattle fence segment. */
function wattleFence(c: Ctx, x: number, y: number, w: number, h = 7): void {
  rect(c, x, y - h, w, h, vgrad(c, y - h, y, '#8a6a42', 1.15, 0.7));
  const p = new Path2D();
  for (let ry = y - h + 1.2; ry < y; ry += 1.8) {
    for (let px = x + ((ry * 3) % 2); px < x + w; px += 4) {
      p.moveTo(px, ry);
      p.quadraticCurveTo(px + 2, ry - 0.9, px + 4, ry);
    }
  }
  stroke(c, 0.6, '#5e4626', p);
  for (let px = x; px <= x + w + 0.1; px += 8) line(c, px, y + 1, px, y - h - 1.5, 1.3, '#5a3e24');
  c.strokeStyle = INK;
  c.lineWidth = 0.6;
  c.strokeRect(x, y - h, w, h);
}

/** Horse in side view, hooves at y, facing left by default. */
function horse(c: Ctx, x: number, y: number, s: number, coat: string, facing = -1): void {
  c.save();
  c.translate(x, y);
  c.scale(-facing * s, s);
  const far = shade(coat, 0.72);
  const hoof = '#2a1e16';
  // Far legs, body, near legs (local: facing +x).
  for (const [lx, dx] of [
    [-6.5, 1],
    [6.5, -0.5],
  ] as const) {
    line(c, lx, -10, lx + dx, -0.8, 2.4, far);
    line(c, lx + dx, -1.4, lx + dx, -0.2, 2.6, hoof);
  }
  c.beginPath();
  c.moveTo(-10.5, -13);
  c.quadraticCurveTo(-10.5, -18.5, -4, -18);
  c.quadraticCurveTo(1, -17, 6, -18.2);
  c.quadraticCurveTo(11, -18, 10.5, -12.5);
  c.quadraticCurveTo(10, -9, 5, -9);
  c.lineTo(-6, -9);
  c.quadraticCurveTo(-11, -9, -10.5, -13);
  c.closePath();
  c.fillStyle = vgrad(c, -19, -9, coat, 1.3, 0.72);
  c.fill();
  stroke(c, 0.8, INK);
  for (const [lx, dx] of [
    [-8.5, -1.2],
    [4.5, 1.2],
  ] as const) {
    c.beginPath();
    c.moveTo(lx - 1.6, -11);
    c.lineTo(lx + dx - 1.1, -1);
    c.lineTo(lx + dx + 1.1, -1);
    c.lineTo(lx + 1.6, -11);
    c.closePath();
    c.fillStyle = coat;
    c.fill();
    stroke(c, 0.6, INK);
    line(c, lx + dx, -1.4, lx + dx, -0.2, 2.8, hoof);
  }
  // Neck and head.
  poly(c, [5.5, -17, 9, -25, 12.5, -26.5, 14, -23.5, 10.5, -13], coat, INK, 0.8);
  poly(
    c,
    [11, -26.5, 18, -22.5, 18.4, -20.4, 16.4, -19.6, 11.4, -22],
    vgrad(c, -27, -19, coat, 1.2, 0.8),
    INK,
    0.8,
  );
  poly(c, [11, -28.5, 12.4, -25.6, 10.2, -25.8], coat, INK, 0.5);
  // Mane and tail.
  c.beginPath();
  c.moveTo(6, -18);
  c.quadraticCurveTo(7.5, -25, 11.4, -27.6);
  stroke(c, 2.2, hoof);
  c.beginPath();
  c.moveTo(-10.4, -15.5);
  c.quadraticCurveTo(-15, -13, -13.6, -4);
  stroke(c, 2.4, hoof);
  disc(c, 14.4, -23.4, 0.6, '#111');
  c.restore();
}

/** Small ground-level grass tufts and pebbles (for the ground layer). */
function tufts(
  c: Ctx,
  x: number,
  y: number,
  n: number,
  spread: number,
  rnd: Rnd,
  col = '#4e7a2e',
): void {
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const tx = x + (rnd() - 0.5) * spread;
    const ty = y + (rnd() - 0.5) * spread * 0.3;
    p.moveTo(tx - 1.4, ty);
    p.lineTo(tx - 2.2, ty - 2.6);
    p.moveTo(tx, ty);
    p.lineTo(tx + 0.2, ty - 3.4);
    p.moveTo(tx + 1.4, ty);
    p.lineTo(tx + 2.3, ty - 2.4);
  }
  stroke(c, 0.9, col, p);
}

// ───────────────────────── ground ─────────────────────────

interface GroundOpts {
  doors: number[];
  earth: string;
  paved?: string;
}

/** Trodden ground pad with worn paths to the doors, pebbles and grass tufts (no outline). */
function ground(c: Ctx, W: number, OH: number, o: GroundOpts, rnd: Rnd): void {
  const cx = W / 2;
  const cy = OH + W * 0.6;
  const g = c.createRadialGradient(cx, cy, W * 0.08, cx, cy, W * 0.62);
  const e = parseInt(o.earth.slice(1), 16);
  const rgb = `${(e >> 16) & 255},${(e >> 8) & 255},${e & 255}`;
  g.addColorStop(0, `rgba(${rgb},0.62)`);
  g.addColorStop(0.72, `rgba(${rgb},0.4)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, OH, W, W, W * 0.25);
  c.fill();
  const B = OH + W * 0.9;
  for (const dx of o.doors) {
    // Worn path from the door to the edge of the footprint.
    const wob = (rnd() - 0.5) * 10;
    c.fillStyle = `rgba(${rgb},0.75)`;
    c.beginPath();
    c.moveTo(dx - 7, B - 4);
    c.quadraticCurveTo(dx - 9 + wob, OH + W * 0.96, dx - 12 + wob, OH + W);
    c.lineTo(dx + 12 + wob, OH + W);
    c.quadraticCurveTo(dx + 9 + wob, OH + W * 0.96, dx + 7, B - 4);
    c.closePath();
    c.fill();
    if (o.paved) {
      for (let py = B; py < OH + W - 2; py += 4.5)
        for (let px = -1; px <= 1; px++) {
          const sx = dx + px * 5.5 + ((py * 0.6) % 3) + wob * ((py - B) / (W * 0.1));
          ell(c, sx, py, 2.4, 1.6, shade(o.paved, 0.9 + rnd() * 0.2));
        }
    }
  }
  // Pebbles and tufts scattered around the edge of the pad.
  for (let i = 0; i < W / 6; i++) {
    const a = rnd() * Math.PI * 2;
    const r = W * (0.36 + rnd() * 0.12);
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r * 0.75;
    if (py < OH + 4 || py > OH + W - 3 || px < 3 || px > W - 3) continue;
    if (rnd() < 0.45) {
      ell(c, px, py, 1.6 + rnd(), 1.1, 'rgba(70,60,50,0.35)');
      ell(c, px - 0.2, py - 0.4, 1.4 + rnd() * 0.6, 0.9, shade('#a39d90', 0.85 + rnd() * 0.3));
    } else tufts(c, px, py, 2, 6, rnd, rnd() < 0.5 ? '#4b7a2c' : '#6a9a3c');
  }
}

// ───────────────────────── Hrimfolk (Norse) ─────────────────────────

const NR = {
  tar: '#4e3a2a',
  wall: '#6a4c34',
  oak: '#9a6c40',
  carve: '#b4844e',
  daub: '#b39a70',
  shingle: '#9a6a3c',
  tarShingle: '#5c4636',
  thatch: '#c9a55a',
  stone: '#8a8a84',
  red: '#b23f2a',
  blue: '#2f5c96',
};

function unit(x: number, y: number): Pt {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Carved dragon head on the tip of a barge board. `dir` = board direction (unit), facing ±1. */
function dragonHead(c: Ctx, x: number, y: number, dir: Pt, facing: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(Math.atan2(dir[0], -dir[1]));
  c.scale(facing * s, s);
  c.beginPath();
  c.moveTo(-1.7, 1);
  c.lineTo(-1.7, -5.5);
  c.quadraticCurveTo(-2, -10.5, 2, -12);
  c.lineTo(6.6, -11.6);
  c.lineTo(9.6, -10.4);
  c.lineTo(8.8, -9.2);
  c.lineTo(4.8, -9.5);
  c.lineTo(7.8, -7.4);
  c.lineTo(6.6, -6.6);
  c.lineTo(3, -7.2);
  c.quadraticCurveTo(1.7, -5.6, 1.7, -2.5);
  c.lineTo(1.7, 1);
  c.closePath();
  c.fillStyle = hgrad(c, -2, 9, NR.carve, 1.25, 0.75);
  c.fill();
  stroke(c, 0.75 / s, INK);
  // Curling crest behind the head, painted neck band and eye.
  c.beginPath();
  c.moveTo(-1.6, -9.5);
  c.quadraticCurveTo(-5.5, -10.5, -4.6, -13.2);
  c.quadraticCurveTo(-3.4, -14.6, -2.4, -12.8);
  stroke(c, 1.1 / s, NR.carve);
  line(c, -1.6, -4.2, 1.6, -4.8, 1.1, NR.red);
  line(c, -1.6, -2.4, 1.6, -3, 0.8, NR.blue);
  disc(c, 3.6, -10.3, 0.75, '#f3e2a0');
  c.restore();
}

/** Barge board: a carved plank along a roof rake. */
function bargeBoard(c: Ctx, a: Pt, b: Pt, w = 3.2, col: string = NR.carve): void {
  line(c, a[0], a[1], b[0], b[1], w + 1.4, '#2e2016');
  line(c, a[0], a[1], b[0], b[1], w, col);
  line(c, a[0], a[1] - w * 0.25, b[0], b[1] - w * 0.25, w * 0.3, shade(col, 1.3));
}

/** Crossed barge boards ending in dragon heads at both gable apexes of a box. */
function gableDragons(c: Ctx, g: BoxG, s: number, heads = true): void {
  const { b } = g;
  const [ax, ay] = g.apex;
  const fr = unit(ax - b.x0, ay - g.eave);
  const bk = unit(ax - (b.x0 - b.dx), ay - (g.eave - b.dy));
  const L = 7 * s;
  const ends: Array<[Pt, Pt, Pt]> = [
    [[ax, ay], fr, bk],
    [g.roof.at(1, 1), unit(...sub(g.roof.at(1, 1), g.roof.at(1, 0))), bk],
  ];
  for (const [[px, py], f, k] of ends) {
    for (const [d, face] of [
      [k, 1],
      [f, -1],
    ] as const) {
      const tip: Pt = [px + d[0] * L, py + d[1] * L];
      bargeBoard(c, [px - d[0] * 3, py - d[1] * 3], tip, 2.6 * Math.min(1, s));
      if (heads) dragonHead(c, tip[0], tip[1], d, face, s * 0.75);
    }
  }
}

function sub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1]];
}

interface NOpts {
  roof: VolumeStyle['roof'];
  roofCol?: string;
  wall: WallKind;
  wallCol: string;
  dragons?: number;
  vent?: number;
  posts?: number[];
}

/** A Norse building volume: walls, timber posts, decorations, roof, barge boards and dragons. */
function nVolume(c: Ctx, b: Box, o: NOpts, rnd: Rnd, deco?: (g: BoxG) => void): BoxG {
  const g = boxG(b);
  const v: VolumeStyle = {
    wall: o.wall,
    wallCol: o.wallCol,
    roof: o.roof,
    roofCol: o.roofCol ?? NR.shingle,
    footing: NR.stone,
  };
  boxWalls(c, g, v, rnd);
  // Timber frame: corner posts, sill beam and (on daub walls) studs.
  const studs = o.wall === 'daub' ? [0, 0.33, 0.67, 1] : [0, 1];
  for (const s of studs) {
    const x = g.X(s) + (s === 0 ? 1.5 : s === 1 ? -1.5 : 0);
    line(c, x, g.top(s) + 1, x, g.bot(s), 3, '#4a3424');
    line(c, x - 0.6, g.top(s) + 1, x - 0.6, g.bot(s), 0.8, '#7a5838');
  }
  line(c, b.x0 - b.dx + 1, g.eave - b.dy + 2, b.x0 - b.dx + 1, b.base - b.dy, 2.6, '#4a3424');
  const sill: number[] = [];
  for (let i = 0; i <= 10; i++) sill.push(g.X(i / 10), g.bot(i / 10) - 1.5);
  trace(c, sill, false);
  stroke(c, 2.4, '#4a3424');
  for (const s of o.posts ?? []) {
    // Heavy outer posts propping the wall (as on the Trelleborg halls).
    const x = g.X(s);
    poly(
      c,
      [x - 2.6, g.bot(s) + 2.5, x - 2, g.top(s) + 1, x + 2, g.top(s) + 1, x + 2.6, g.bot(s) + 2.5],
      hgrad(c, x - 3, x + 3, '#6a4a30'),
      INK,
      0.7,
    );
    ell(c, x, g.bot(s) + 2.6, 4, 1.6, '#7c7a74');
  }
  deco?.(g);
  boxRoof(c, g, v, rnd);
  // Rakes: turf edges or carved barge boards along the gable.
  const front: Pt = [b.x0, g.eave + 1];
  const back: Pt = [b.x0 - b.dx, g.eave - b.dy + 1];
  if (o.roof === 'turf') {
    for (const [a, z] of [
      [back, g.apex],
      [front, g.apex],
      [g.roof.at(1, 0), g.roof.at(1, 1)],
    ] as const) {
      line(c, a[0], a[1], z[0], z[1], 5, '#4a6e2c');
      line(c, a[0], a[1] - 1, z[0], z[1] - 1, 2, '#86b052');
      line(c, a[0], a[1] + 2.4, z[0], z[1] + 2.4, 1.2, '#cfc4a4');
    }
  } else {
    bargeBoard(c, back, g.apex);
    bargeBoard(c, front, g.apex);
    bargeBoard(c, g.roof.at(1, 0), g.roof.at(1, 1));
  }
  if (o.dragons) gableDragons(c, g, o.dragons);
  if (o.vent !== undefined) {
    const [x, y] = g.roof.at(o.vent, 1);
    if (o.roof === 'shingle' || o.roof === 'slate') {
      // Louvred smoke vent on the ridge.
      rect(c, x - 5, y - 6, 10, 6, '#3a2818');
      rect(c, x - 3.5, y - 4.5, 7, 4.5, glow(c, y - 4.5, y));
      line(c, x - 3.5, y - 2.5, x + 3.5, y - 2.5, 0.8, '#3a2818');
      poly(c, [x - 7, y - 5.5, x, y - 10, x + 7, y - 5.5], o.roofCol ?? NR.shingle, INK, 0.8);
    } else {
      ell(c, x, y + 1, 5, 2.4, '#2a1c12');
      ell(c, x, y + 1.4, 3.2, 1.3, 'rgba(255,170,70,0.85)');
      line(c, x - 6, y, x + 6, y, 1.2, '#4a3424');
    }
  }
  return g;
}

function nTownHall(c: Ctx, team: string, rnd: Rnd): void {
  const posts = [0.12, 0.34, 0.66, 0.88];
  const g = nVolume(
    c,
    { x0: 50, x1: 176, base: 232, wallH: 40, dx: 34, dy: 24, rise: 70, bow: 5, sag: 6, ov: 4 },
    { roof: 'shingle', wall: 'stave', wallCol: NR.wall, dragons: 1.35, vent: 0.66, posts },
    rnd,
    (g) => {
      nDoor(c, g.X(0.5), g.bot(0.5), 20, 28, rnd);
      for (const s of [0.23, 0.77])
        windowLit(c, g.X(s) - 4, g.top(s) + 12, 8, 7, '#3a2618', NR.red);
      const sh: Array<[string, string, number]> = [
        [team, '#f0e6cc', 1],
        ['#c23b2a', '#e8d6a0', 3],
        [team, GOLD, 2],
        ['#2f5c96', '#f0e6cc', 4],
      ];
      posts.forEach((s, i) => shield(c, g.X(s), g.top(s) + 13, 6.5, ...sh[i]!));
      // Small wind-eye window high in the gable.
      inGable(c, g, (lu) => {
        windowLit(c, lu / 2 - 3.5, -30, 7, 6, '#3a2618');
        shield(c, lu / 2, -8, 6, team, '#f0e6cc', 3);
      });
    },
  );
  void g;
  clothBanner(c, 13, 150, 92, 15, 34, team, GOLD, (x, y) => raven(c, x + 1, y, 0.9, '#f3ead2'));
  clothBanner(c, 180, 120, 118, 15, 34, team, GOLD, (x, y) => raven(c, x + 1, y, 0.9, '#f3ead2'));
  woodpile(c, 128, 252, 30, 13, rnd);
  barrel(c, 70, 252, 4.6);
  barrel(c, 80, 254, 4.6);
  sack(c, 160, 254, 0.9);
  fishRack(c, 20, 246, 20, 20);
}

function nHouse(c: Ctx, team: string, rnd: Rnd): void {
  const doorS = 0.62;
  const g = nVolume(
    c,
    { x0: 40, x1: 118, base: 174, wallH: 28, dx: 26, dy: 18, rise: 42, bow: 3, sag: 3, ov: 3 },
    { roof: 'turf', wall: 'daub', wallCol: NR.daub, dragons: 0.9, vent: 0.62 },
    rnd,
    (g) => {
      windowLit(c, g.X(0.2) - 3.5, g.top(0.2) + 9, 7, 6, '#4a3424', NR.red);
      nDoor(c, g.X(doorS), g.bot(doorS) - 1, 12, 19, rnd);
      inGable(c, g, (lu) => windowLit(c, lu / 2 - 3, -20, 6, 5, '#4a3424'));
    },
  );
  // Porch: a small gabled roof on two posts over the door.
  const px = g.X(doorS);
  const pb = g.bot(doorS);
  const pt = g.top(doorS) - 1;
  for (const dx of [-10, 10]) {
    line(c, px + dx, pb + 3, px + dx, pt + 2, 2.4, '#4a3424');
    line(c, px + dx - 0.6, pb + 3, px + dx - 0.6, pt + 2, 0.7, '#8a6440');
  }
  poly(c, [px - 14, pt + 3, px, pt - 12, px + 14, pt + 3], '#6a4a2e', INK, 0.8);
  clipped(c, [px - 12, pt + 2, px, pt - 9.5, px + 12, pt + 2], () =>
    boards(c, px - 12, pt - 10, 24, 13, '#8a6440', 3, rnd),
  );
  line(c, px - 15, pt + 3.5, px, pt - 12, 3.4, '#4a6e2c');
  line(c, px + 15, pt + 3.5, px, pt - 12, 3.4, '#4a6e2c');
  line(c, px - 14, pt + 2.5, px, pt - 13, 1.4, '#8ab454');
  line(c, px + 14, pt + 2.5, px, pt - 13, 1.4, '#8ab454');
  shield(c, px, pt - 2, 4.4, team, '#f0e6cc', 1);
  woodpile(c, 6, 184, 26, 12, rnd);
  barrel(c, 110, 186, 4.2);
  ravenBanner(c, 123, 100, 82, team, 0.8);
}

function nStorehouse(c: Ctx, st: Style, team: string, rnd: Rnd): void {
  const b: Box = { x0: 46, x1: 110, base: 150, wallH: 30, dx: 22, dy: 16, rise: 40, ov: 3 };
  // Posts on flat stones lift the stabbur clear of damp and vermin.
  rect(c, b.x0 - b.dx + 2, b.base - b.dy, b.x1 - b.x0 + b.dx - 2, 18, 'rgba(20,14,8,0.55)');
  for (const [x, y] of [
    [b.x0 - b.dx + 3, b.base - b.dy],
    [b.x1 - 6 - b.dx * 0.5, b.base - b.dy * 0.5],
    [b.x0 + 3, b.base],
    [(b.x0 + b.x1) / 2, b.base],
    [b.x1 - 3, b.base],
  ] as const) {
    rect(c, x - 2.5, y, 5, 24, hgrad(c, x - 2.5, x + 2.5, '#6a4a30'));
    ell(c, x, y + 24, 5, 2.2, '#86857e');
    ell(c, x, y + 23.4, 4, 1.4, '#a19f97');
  }
  const g = nVolume(
    c,
    b,
    { roof: 'slate', roofCol: st.roof, wall: 'logs', wallCol: '#8a6440', dragons: 0.8 },
    rnd,
    (g) => {
      plankDoor(c, g.X(0.5) - 6, b.base - 21, 12, 20, '#6e4a2c', rnd);
      c.strokeStyle = NR.carve;
      c.lineWidth = 1.6;
      c.strokeRect(g.X(0.5) - 7, b.base - 22, 14, 22);
      // Log ends at the notched corners.
      for (let y = g.eave + 2.6; y < b.base; y += 5.2)
        for (const x of [b.x0 - 1, b.x1 + 1]) {
          disc(c, x, y, 2.7, '#5a3c22');
          disc(c, x, y, 2, '#d0a46c');
        }
      inGable(c, g, (lu) => shield(c, lu / 2, -12, 5.5, team, '#f0e6cc', 2));
    },
  );
  void g;
  // Free-standing stair up to the door.
  const sx = (b.x0 + b.x1) / 2;
  for (let i = 0; i < 5; i++) {
    const y = b.base + 4 + i * 5.4;
    rect(c, sx - 8 - i * 0.6, y - 2, 16 + i * 1.2, 3, vgrad(c, y - 2, y + 1, '#9a7048'));
  }
  line(c, sx - 9, b.base + 1, sx - 11.5, b.base + 27, 1.8, '#5a3e24');
  line(c, sx + 9, b.base + 1, sx + 11.5, b.base + 27, 1.8, '#5a3e24');
  // Stacked timber and supplies.
  for (let l = 0; l < 4; l++) {
    const y = 186 - l * 4.6;
    if (l % 2 === 0) {
      rect(c, 6, y - 4, 32, 4, vgrad(c, y - 4, y, '#a77c4c', 1.2, 0.75));
      line(c, 6, y - 2, 38, y - 2, 0.5, 'rgba(60,35,15,0.5)');
    } else
      for (let k = 0; k < 5; k++) {
        rect(c, 7 + k * 6.4, y - 4, 4.6, 4, '#c79d68');
        c.strokeStyle = '#6a4a2c';
        c.lineWidth = 0.6;
        c.strokeRect(7 + k * 6.4, y - 4, 4.6, 4);
      }
  }
  c.strokeStyle = INK;
  c.lineWidth = 0.7;
  c.strokeRect(6, 168.6, 32, 17.4);
  barrel(c, 116, 186, 4.4);
  sack(c, 104, 188, 0.9);
  crate(c, 90, 189, 7);
  ravenBanner(c, 123, 76, 104, team, 0.8);
}

function nBarracks(c: Ctx, team: string, rnd: Rnd): void {
  const g = nVolume(
    c,
    { x0: 46, x1: 146, base: 220, wallH: 38, dx: 30, dy: 22, rise: 58, bow: 3, sag: 4, ov: 4 },
    {
      roof: 'shingle',
      roofCol: NR.tarShingle,
      wall: 'stave',
      wallCol: '#6e5038',
      dragons: 1.15,
      vent: 0.4,
    },
    rnd,
    (g) => {
      nDoor(c, g.X(0.5), g.bot(0.5), 18, 26, rnd);
      const pal: Array<[string, string, number]> = [
        [team, '#f0e6cc', 1],
        ['#d9a43a', '#2a2a2a', 3],
        [team, '#f0e6cc', 4],
        ['#c23b2a', '#f0e6cc', 2],
        [team, GOLD, 3],
        ['#2f5c96', '#e8d6a0', 1],
      ];
      [0.08, 0.21, 0.34, 0.66, 0.79, 0.92].forEach((s, i) =>
        shield(c, g.X(s), g.top(s) + 10, 5.6, ...pal[i]!),
      );
      inGable(c, g, (lu) => {
        line(c, lu / 2 - 9, -8, lu / 2 + 9, 6, 1.6, '#c9ccd2');
        line(c, lu / 2 + 9, -8, lu / 2 - 9, 6, 1.6, '#c9ccd2');
        shield(c, lu / 2, -1, 6.5, team, '#f0e6cc', 2);
      });
    },
  );
  void g;
  // Weapon rack: spears leaning on a rail, an axe and shields stacked at its foot.
  const rx = 154;
  const ry = 232;
  line(c, rx - 2, ry - 18, rx + 30, ry - 18, 2.2, '#6a4a2c');
  line(c, rx, ry + 2, rx, ry - 20, 2.2, '#5a3e24');
  line(c, rx + 28, ry + 2, rx + 28, ry - 20, 2.2, '#5a3e24');
  for (let i = 0; i < 4; i++) {
    const x = rx + 4 + i * 6;
    line(c, x + 7, ry + 2, x - 1, ry - 30, 1.3, '#8a6238');
    poly(c, [x - 2.4, ry - 36, x - 2.6, ry - 29, x + 0.6, ry - 29.6], '#c9ccd4', INK, 0.5);
  }
  line(c, rx + 30, ry + 2, rx + 36, ry - 18, 1.5, '#8a6238');
  poly(
    c,
    [rx + 35, ry - 18, rx + 41, ry - 20, rx + 40, ry - 11, rx + 36.5, ry - 14],
    '#b9bcc4',
    INK,
    0.6,
  );
  shield(c, rx + 6, ry - 3, 6, team, '#f0e6cc', 2);
  shield(c, rx + 18, ry - 2, 6, '#d9a43a', '#2a2a2a', 3);
  // Archery butt and a straw practice dummy.
  const tx = 176;
  const ty = 250;
  line(c, tx - 5, ty, tx - 2, ty - 12, 1.6, '#5a3e24');
  line(c, tx + 5, ty, tx + 2, ty - 12, 1.6, '#5a3e24');
  disc(c, tx, ty - 14, 8, '#d8bd6a');
  disc(c, tx, ty - 14, 5.4, '#c23b2a');
  disc(c, tx, ty - 14, 3.2, '#f0e6cc');
  disc(c, tx, ty - 14, 1.4, '#c23b2a');
  line(c, tx + 1, ty - 15, tx + 8, ty - 19, 0.8, '#5a3e24');
  line(c, tx - 3, ty - 12, tx + 4, ty - 8, 0.8, '#5a3e24');
  const dx = 60;
  const dy = 252;
  line(c, dx, dy, dx, dy - 22, 2.4, '#6a4a2c');
  line(c, dx - 8, dy - 15, dx + 8, dy - 15, 2.2, '#6a4a2c');
  ell(c, dx, dy - 13, 5, 6.5, vgrad(c, dy - 20, dy - 6, '#d8bd6a'));
  disc(c, dx, dy - 23, 4, rgrad(c, dx, dy - 23, 4, '#d8bd6a'));
  shield(c, dx - 7, dy - 11, 4.2, team, '#f0e6cc', 0);
  cart(c, 22, 252, 1, rnd, '#d9b56a');
  ravenBanner(c, 187, 110, 118, team, 0.95);
}

function nStable(c: Ctx, team: string, rnd: Rnd): void {
  const g = nVolume(
    c,
    { x0: 42, x1: 130, base: 208, wallH: 34, dx: 28, dy: 20, rise: 50, ov: 4 },
    { roof: 'thatch', roofCol: NR.thatch, wall: 'stave', wallCol: '#7d5e3e', dragons: 0.95 },
    rnd,
    (g) => {
      // Wide stable doorway with a horse looking out.
      const x = g.X(0.45);
      const by = g.bot(0.45);
      rect(c, x - 13, by - 26, 26, 26, '#4a3424');
      rect(c, x - 11, by - 24, 22, 24, '#1e140c');
      halo(c, x, by - 10, 14, 0.25);
      c.save();
      c.beginPath();
      c.rect(x - 11, by - 24, 22, 24);
      c.clip();
      horse(c, x - 4, by + 8, 1, '#8a5a34', -1);
      c.restore();
      rect(c, x - 11, by - 9, 22, 9, vgrad(c, by - 9, by, '#7a5634'));
      line(c, x - 11, by - 9, x + 11, by - 9, 1.4, '#4a3424');
      line(c, x - 11, by - 9, x + 11, by, 1, '#4a3424');
      for (const s of [0.12, 0.8]) windowLit(c, g.X(s) - 4, g.top(s) + 9, 8, 6, '#4a3424', NR.red);
    },
  );
  void g;
  // Paddock with horses.
  railFence(c, 132, 206, 56, 10);
  hay(c, 146, 220, 16);
  hay(c, 176, 222, 13);
  horse(c, 160, 246, 1.1, '#a8723e', -1);
  trough(c, 136, 250, 18);
  wattleFence(c, 132, 254, 56, 8);
  hay(c, 58, 236, 15);
  hay(c, 74, 240, 15);
  ravenBanner(c, 187, 120, 86, team, 0.9);
}

function nWorkshop(c: Ctx, team: string, rnd: Rnd): void {
  const g = nVolume(
    c,
    { x0: 46, x1: 146, base: 222, wallH: 40, dx: 30, dy: 22, rise: 50, ov: 4 },
    { roof: 'turf', wall: 'stave', wallCol: '#5e4632', vent: 0.66 },
    rnd,
    (g) => {
      // Open front: dark interior lit by the forge.
      const pts: number[] = [];
      for (let i = 0; i <= 10; i++) pts.push(g.X(0.04 + i * 0.092), g.top(0.04 + i * 0.092) + 5);
      for (let i = 10; i >= 0; i--) pts.push(g.X(0.04 + i * 0.092), g.bot(0.04 + i * 0.092) - 1);
      clipped(c, pts, () => {
        rect(c, g.X(0), g.eave, g.b.x1 - g.b.x0, g.b.wallH + 4, '#24180f');
        boards(c, g.X(0), g.eave, g.b.x1 - g.b.x0, g.b.wallH * 0.7, '#3a2a1c', 5, rnd);
        const fx = g.X(0.24);
        halo(c, fx, g.bot(0.24) - 12, 34, 0.55, '255,140,50');
        // Tools hanging on the back wall.
        for (let i = 0; i < 5; i++) {
          const tx = g.X(0.55) + i * 7;
          const ty = g.eave + 10;
          line(c, tx, ty, tx, ty + 10, 1, '#8a8c92');
          if (i % 2) rect(c, tx - 2, ty + 9, 4, 2.5, '#8a8c92');
          else line(c, tx - 1.5, ty + 10, tx + 1.5, ty + 12, 1, '#8a8c92');
        }
      });
      // Stone forge hearth with glowing coals and a clay hood.
      const fx = g.X(0.24);
      const fb = g.bot(0.24);
      ashlarBlock(c, fx - 12, fb - 14, 24, 14, rnd);
      ell(c, fx, fb - 14, 10, 2.6, '#2a1a10');
      for (let i = 0; i < 9; i++)
        disc(c, fx - 8 + i * 2, fb - 14 + (i % 2) * 0.6, 1.3, i % 3 ? '#ff8a2a' : '#ffd36a');
      halo(c, fx, fb - 16, 16, 0.6, '255,150,60');
      poly(
        c,
        [fx - 8, fb - 30, fx + 8, fb - 30, fx + 5, fb - 38, fx - 5, fb - 38],
        '#8a6a4e',
        INK,
        0.7,
      );
      // Bellows.
      poly(c, [fx + 12, fb - 8, fx + 22, fb - 12, fx + 22, fb - 4], '#6e4a2c', INK, 0.7);
      for (const s of [0, 0.36, 0.68, 1]) {
        const x = g.X(s) + (s === 0 ? 2 : s === 1 ? -2 : 0);
        line(c, x, g.top(s) + 2, x, g.bot(s), 3.4, '#4a3424');
        line(c, x - 0.8, g.top(s) + 2, x - 0.8, g.bot(s), 0.9, '#8a6440');
      }
    },
  );
  void g;
  // Anvil, quench tub and grindstone in front.
  anvil(c, 98, 238);
  barrel(c, 116, 240, 4.6);
  ell(c, 116, 231.8, 3.8, 1.3, '#4c7fa0');
  grindstone(c, 134, 244);
  // Bloomery furnace: clay shaft with a glowing tap hole.
  const bx = 166;
  const by = 230;
  poly(
    c,
    [bx - 10, by, bx - 5, by - 30, bx + 5, by - 30, bx + 10, by],
    hgrad(c, bx - 10, bx + 10, '#a8744a'),
    INK,
    0.9,
  );
  const cr = new Path2D();
  cr.moveTo(bx - 4, by - 24);
  cr.lineTo(bx - 2, by - 18);
  cr.lineTo(bx - 4, by - 12);
  cr.moveTo(bx + 4, by - 20);
  cr.lineTo(bx + 2, by - 14);
  stroke(c, 0.6, '#6a4228', cr);
  ell(c, bx, by - 30, 5, 1.6, '#2a1a10');
  flame(c, bx, by - 30, 6);
  c.fillStyle = '#2a1a10';
  c.beginPath();
  c.arc(bx, by - 2, 4, Math.PI, 0);
  c.fill();
  c.fillStyle = glow(c, by - 6, by);
  c.beginPath();
  c.arc(bx, by - 2, 2.8, Math.PI, 0);
  c.fill();
  halo(c, bx, by - 3, 10, 0.5, '255,140,50');
  ell(c, 178, 248, 9, 4, '#262222');
  for (let i = 0; i < 8; i++) disc(c, 172 + rnd() * 12, 246 + rnd() * 3, 1.3, '#3e3a3a');
  ell(c, 152, 252, 6, 2.6, '#7a3e2a');
  logPile(c, 8, 252, 30, rnd);
  wheel(c, 40, 244, 6);
  ravenBanner(c, 187, 140, 90, team, 0.9);
}

/** Small block of rough stone (for hearths and plinths). */
function ashlarBlock(c: Ctx, x: number, y: number, w: number, h: number, rnd: Rnd): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  ashlar(c, x, y, w, h, NR.stone, 4.5, 7, rnd, 0.14);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.strokeRect(x, y, w, h);
}

function nTower(c: Ctx, team: string, rnd: Rnd): void {
  const d: Pt = [-14, -10];
  const legs = [
    [30, 180, 38, 90],
    [98, 180, 90, 90],
  ] as const;
  const leg = (x0: number, y0: number, x1: number, y1: number, col: string): void => {
    line(c, x0, y0, x1, y1, 5, '#2e2016');
    line(c, x0, y0, x1, y1, 3.6, col);
    line(c, x0 - 1, y0, x1 - 1, y1, 1, shade(col, 1.35));
  };
  // Back legs and bracing.
  for (const [x0, y0, x1, y1] of legs) leg(x0 + d[0], y0 + d[1], x1 + d[0], y1 + d[1], '#5a3e26');
  line(c, 30 + d[0], 170, 90 + d[0], 120, 1.8, '#4a3220');
  // Side bracing between front-left and back-left legs.
  line(c, 30, 180, 38 + d[0], 112 + d[1], 2, '#6a4a2c');
  line(c, 30 + d[0], 180 + d[1], 36, 120, 2, '#5a3e26');
  for (const [x0, y0, x1, y1] of legs) leg(x0, y0, x1, y1, '#7a5634');
  // Front X-bracing in two bays.
  for (const [ya, yb] of [
    [176, 134],
    [134, 94],
  ] as const) {
    const xa = (y: number): number => 30 + ((180 - y) / 90) * 8;
    const xb = (y: number): number => 98 - ((180 - y) / 90) * 8;
    line(c, xa(ya), ya, xb(yb), yb, 2.4, '#6e4e30');
    line(c, xb(ya), ya, xa(yb), yb, 2.4, '#6e4e30');
  }
  for (const [x, y] of [
    [30, 180],
    [98, 180],
    [16, 170],
    [84, 170],
  ] as const)
    ell(c, x, y + 1, 5, 2, '#86857e');
  // Ladder.
  line(c, 56, 182, 57, 88, 1.8, '#9a7048');
  line(c, 66, 182, 65, 88, 1.8, '#9a7048');
  const rung = new Path2D();
  for (let y = 176; y > 92; y -= 7) {
    rung.moveTo(56.5, y);
    rung.lineTo(65.5, y);
  }
  stroke(c, 1.3, '#b08458', rung);
  // Lookout cabin: open sides between a plank railing and a shingled pyramid roof.
  const fl = 90;
  const rl = 72;
  const ev = 50;
  poly(c, [28, rl, 28 + d[0], rl + d[1], 28 + d[0], ev + d[1], 28, ev], '#20160e');
  rect(c, 28, ev, 72, rl - ev, '#20160e');
  halo(c, 64, 62, 22, 0.45);
  disc(c, 64, 60, 2.4, '#ffe08a');
  line(c, 64, ev, 64, 57.6, 0.6, IRON);
  // Railing faces.
  inFrame(c, [28, rl], d, [0, 1], (lu) => {
    boards(c, 0, 0, lu, fl - rl + 4, '#8a6440', 4, rnd);
    rect(c, 0, 0, lu, fl - rl + 4, 'rgba(255,236,190,0.12)');
  });
  c.save();
  c.beginPath();
  c.rect(28, rl, 72, fl - rl + 4);
  c.clip();
  boards(c, 28, rl, 72, fl - rl + 4, '#7a5634', 4, rnd);
  c.restore();
  line(c, 26, rl, 100, rl, 2.6, '#5a3e26');
  line(c, 26, fl + 3.5, 100, fl + 3.5, 3, '#4a3424');
  line(c, 28, rl, 28 + d[0], rl + d[1], 2.6, '#6a4a2c');
  for (const x of [32, 64, 96]) line(c, x, ev, x, rl, 3, '#5a3e26');
  line(c, 18, ev - 7, 18, rl - 8, 2.6, '#4a3220');
  const pal: Array<[string, string, number]> = [
    [team, '#f0e6cc', 2],
    ['#c23b2a', '#e8d6a0', 3],
    [team, '#f0e6cc', 1],
  ];
  [44, 64, 84].forEach((x, i) => shield(c, x, 81, 6, ...pal[i]!));
  // Pyramid roof: front face and sunlit west face.
  const apex: Pt = [57, 18];
  const eL: Pt = [24, ev + 2];
  const eR: Pt = [104, ev + 2];
  const eB: Pt = [24 + d[0], ev + 2 + d[1]];
  clipped(c, [eB[0], eB[1], eL[0], eL[1], apex[0], apex[1]], () => {
    const [bx, by, bw, bh] = bounds([eB[0], eB[1], eL[0], eL[1], apex[0], apex[1]]);
    shingleRoof(c, roofG(eB, eL, apex, apex), NR.shingle, rnd);
    rect(c, bx, by, bw, bh, 'rgba(255,236,190,0.12)');
  });
  shingleRoof(c, roofG(eL, eR, apex, apex), shade(NR.shingle, 0.92), rnd);
  bargeBoard(c, eL, apex);
  bargeBoard(c, eR, apex);
  bargeBoard(c, eB, apex);
  line(c, eB[0], eB[1], eL[0], eL[1], 2.2, '#3a2818');
  line(c, eL[0], eL[1], eR[0], eR[1], 2.2, '#3a2818');
  dragonHead(c, eL[0] - 1, eL[1] + 1, unit(-1, -0.4), -1, 0.7);
  dragonHead(c, eR[0] + 1, eR[1] + 1, unit(1, -0.4), 1, 0.7);
  ravenBanner(c, apex[0], 8, 12, team, 0.75);
}

function nTemple(c: Ctx, team: string, rnd: Rnd): void {
  const cx = 96;
  // Ambulatory (svalgang) arcade wall.
  c.save();
  c.beginPath();
  c.rect(22, 212, 148, 25);
  c.clip();
  boards(c, 22, 212, 148, 25, '#4e3a2a', 4, rnd);
  c.restore();
  for (let x = 30; x < 166; x += 13) {
    if (Math.abs(x + 3.5 - cx) < 16) continue;
    c.fillStyle = '#1c130c';
    c.beginPath();
    c.moveTo(x, 232);
    c.lineTo(x, 222);
    c.arc(x + 3.5, 222, 3.5, Math.PI, 0);
    c.lineTo(x + 7, 232);
    c.fill();
    line(c, x - 2.5, 233, x - 2.5, 216, 1.6, '#8a6440');
  }
  line(c, 22, 235.5, 170, 235.5, 2.6, '#3a2818');
  footing(c, [20, 238, 172, 238], rnd, NR.stone);
  // Svalgang lean-to roof.
  shingleRoof(c, roofG([12, 216], [180, 216], [34, 194], [158, 194]), NR.tarShingle, rnd);
  bargeBoard(c, [12, 216], [34, 194]);
  bargeBoard(c, [180, 216], [158, 194]);
  line(c, 12, 216, 180, 216, 2, '#2e2016');
  // Nave gable: boarded front wall and roof slopes receding behind it.
  const eL: Pt = [34, 184];
  const eR: Pt = [158, 184];
  const ap: Pt = [cx, 128];
  const depth = 24;
  const back = (p: Pt): Pt => [p[0], p[1] - depth];
  inFrame(c, ap, [0, -depth], sub(eL, ap), (lu, lv) => {
    shingleRoof(c, flatRoof(lu, lv), shade(NR.tarShingle, 1.15), rnd);
  });
  inFrame(c, ap, [0, -depth], sub(eR, ap), (lu, lv) => {
    shingleRoof(c, flatRoof(lu, lv), shade(NR.tarShingle, 0.85), rnd);
  });
  bargeBoard(c, back(eL), back(ap), 2.2);
  bargeBoard(c, back(eR), back(ap), 2.2);
  clipped(
    c,
    [eL[0] + 3, eL[1], ap[0], ap[1] + 3, eR[0] - 3, eR[1], eR[0] - 3, 196, eL[0] + 3, 196],
    () => {
      boards(c, 30, 128, 132, 70, '#5a4230', 4.2, rnd);
      rect(c, 30, 128, 132, 70, ramp(c, 128, 196, '20,12,6', 0.1, 0.35));
    },
  );
  // Round wind-eye with spokes and a carved portal-like band.
  disc(c, cx, 160, 8.5, '#3a2818');
  disc(c, cx, 160, 6.5, glow(c, 154, 166));
  const sp = new Path2D();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    sp.moveTo(cx + Math.cos(a) * 6.5, 160 + Math.sin(a) * 6.5);
    sp.lineTo(cx - Math.cos(a) * 6.5, 160 - Math.sin(a) * 6.5);
  }
  stroke(c, 0.8, '#3a2818', sp);
  bargeBoard(c, eL, ap, 3.6);
  bargeBoard(c, eR, ap, 3.6);
  dragonHead(c, eL[0] - 1, eL[1] + 1, unit(-1, -0.5), -1, 0.8);
  dragonHead(c, eR[0] + 1, eR[1] + 1, unit(1, -0.5), 1, 0.8);
  // Ridge turret: wall, skirt roof with dragons, belfry and spire.
  const tb = 114;
  c.save();
  c.beginPath();
  c.rect(cx - 13, tb - 18, 26, 22);
  c.clip();
  boards(c, cx - 13, tb - 18, 26, 22, '#4e3a2a', 3.6, rnd);
  c.restore();
  shingleRoof(
    c,
    roofG([cx - 24, tb - 14], [cx + 24, tb - 14], [cx - 11, tb - 28], [cx + 11, tb - 28]),
    NR.tarShingle,
    rnd,
  );
  bargeBoard(c, [cx - 24, tb - 14], [cx - 11, tb - 28], 2.2);
  bargeBoard(c, [cx + 24, tb - 14], [cx + 11, tb - 28], 2.2);
  dragonHead(c, cx - 25, tb - 13, unit(-1, -0.6), -1, 0.62);
  dragonHead(c, cx + 25, tb - 13, unit(1, -0.6), 1, 0.62);
  c.save();
  c.beginPath();
  c.rect(cx - 9, tb - 40, 18, 14);
  c.clip();
  boards(c, cx - 9, tb - 40, 18, 14, '#4e3a2a', 3, rnd);
  c.restore();
  for (const x of [cx - 6, cx + 1.5]) {
    c.fillStyle = '#1c130c';
    c.beginPath();
    c.moveTo(x, tb - 28);
    c.lineTo(x, tb - 34);
    c.arc(x + 2.25, tb - 34, 2.25, Math.PI, 0);
    c.lineTo(x + 4.5, tb - 28);
    c.fill();
  }
  shingleRoof(
    c,
    roofG([cx - 14, tb - 38], [cx + 14, tb - 38], [cx, 28], [cx, 28]),
    shade(NR.tarShingle, 1.05),
    rnd,
    5.2,
    4,
  );
  bargeBoard(c, [cx - 14, tb - 38], [cx, 28], 2);
  bargeBoard(c, [cx + 14, tb - 38], [cx, 28], 2);
  line(c, cx, 29, cx, 12, 1.4, IRON);
  disc(c, cx, 24, 2, rgrad(c, cx, 24, 2, GOLD));
  pennant(c, cx - 0.5, 12, 20, team);
  // Gable-apex crossed boards with dragons in front of the turret.
  const fl = unit(ap[0] - eL[0], ap[1] - eL[1]);
  const fr = unit(ap[0] - eR[0], ap[1] - eR[1]);
  for (const [d, face] of [
    [fl, 1],
    [fr, -1],
  ] as const) {
    const tip: Pt = [ap[0] + d[0] * 11, ap[1] + d[1] * 11];
    bargeBoard(c, [ap[0] - d[0] * 4, ap[1] - d[1] * 4], tip, 2.8);
    dragonHead(c, tip[0], tip[1], d, face, 0.95);
  }
  // Carved portal, torches, shields and runestones.
  const dw = 18;
  rect(c, cx - dw / 2 - 4, 210, dw + 8, 27, vgrad(c, 210, 237, NR.carve, 1.2, 0.8));
  const red = new Path2D();
  for (let y = 214; y < 236; y += 3.4) {
    for (const x of [cx - dw / 2 - 4, cx + dw / 2]) {
      red.moveTo(x + 0.6, y);
      red.lineTo(x + 3.4, y + 1.7);
      red.lineTo(x + 0.6, y + 3.4);
    }
  }
  stroke(c, 0.8, NR.red, red);
  c.fillStyle = '#2a1a10';
  c.beginPath();
  c.moveTo(cx - dw / 2, 237);
  c.lineTo(cx - dw / 2, 222);
  c.arc(cx, 222, dw / 2, Math.PI, 0);
  c.lineTo(cx + dw / 2, 237);
  c.fill();
  plankDoor(c, cx - dw / 2 + 1, 214, dw - 2, 23, '#62432a', rnd, true);
  for (const x of [cx - 22, cx + 22]) {
    line(c, x, 244, x, 226, 1.8, '#4a3424');
    rect(c, x - 2, 224, 4, 3, IRON);
    halo(c, x, 220, 12, 0.5);
    flame(c, x, 224, 7);
  }
  shield(c, 50, 225, 6, team, '#f0e6cc', 3);
  shield(c, 142, 225, 6, team, '#f0e6cc', 3);
  runestone(c, 14, 252, 30, rnd);
  runestone(c, 178, 252, 26, rnd);
}

// ───────────────────────── Aurelian (Greek) ─────────────────────────

const GR = {
  marble: '#ece4d2',
  white: '#f2ebdc',
  tile: '#b8513c',
  blue: '#335f92',
  red: '#a8382e',
  bronze: '#b3803e',
  olive: '#7d8a46',
  wood: '#8a6238',
};

/** Fluted Doric (or Ionic) column from `top` to `bot`. */
function column(
  c: Ctx,
  x: number,
  top: number,
  bot: number,
  w: number,
  col: string,
  ionic = false,
): void {
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, shade(col, 1.12));
  g.addColorStop(0.35, shade(col, 1.04));
  g.addColorStop(0.75, shade(col, 0.82));
  g.addColorStop(1, shade(col, 0.62));
  // Slight entasis: a touch narrower at the top.
  poly(c, [x - w / 2, bot, x - w * 0.42, top, x + w * 0.42, top, x + w / 2, bot], g);
  const fl = new Path2D();
  for (const f of [-0.25, 0, 0.25]) {
    fl.moveTo(x + f * w, top + 2);
    fl.lineTo(x + f * w * 1.1, bot - 1);
  }
  stroke(c, 0.6, 'rgba(90,80,60,0.35)', fl);
  if (ionic) {
    rect(c, x - w * 0.6, top - 1.5, w * 1.2, 2, shade(col, 0.95));
    for (const s of [-1, 1]) {
      disc(c, x + s * w * 0.55, top - 0.5, w * 0.24, shade(col, 0.92));
      disc(c, x + s * w * 0.55, top - 0.5, w * 0.1, shade(col, 0.6));
    }
    rect(c, x - w * 0.6, bot - 1.6, w * 1.2, 1.8, shade(col, 0.88));
  } else {
    poly(
      c,
      [x - w * 0.45, top, x + w * 0.45, top, x + w * 0.62, top - 2, x - w * 0.62, top - 2],
      shade(col, 0.92),
    );
    rect(c, x - w * 0.66, top - 3.6, w * 1.32, 1.8, shade(col, 1.05));
  }
  c.strokeStyle = 'rgba(60,50,40,0.5)';
  c.lineWidth = 0.5;
  c.beginPath();
  c.moveTo(x + w / 2, bot);
  c.lineTo(x + w * 0.42, top);
  c.stroke();
}

/** Painted Doric frieze: architrave, triglyphs and metopes, red taenia and cornice. */
function frieze(
  c: Ctx,
  x0: number,
  x1: number,
  y: number,
  h: number,
  team: string,
  rnd: Rnd,
): void {
  const ah = h * 0.36;
  rect(c, x0, y + h - ah, x1 - x0, ah, vgrad(c, y + h - ah, y + h, GR.marble, 1.05, 0.85));
  rect(c, x0, y + h - ah - 1, x1 - x0, 1.2, GR.red);
  const fh = h - ah - 2.4;
  const fy = y + 1.4;
  rect(c, x0, fy, x1 - x0, fh, '#e6dcc4');
  const tw = Math.max(2.4, fh * 0.45);
  const step = tw * 2.6;
  for (let x = x0 + 1; x < x1 - tw; x += step) {
    rect(c, x, fy, tw, fh, GR.blue);
    line(c, x + tw * 0.33, fy + 0.5, x + tw * 0.33, fy + fh - 0.5, 0.5, '#1d3554');
    line(c, x + tw * 0.66, fy + 0.5, x + tw * 0.66, fy + fh - 0.5, 0.5, '#1d3554');
    const mx = x + tw + (step - tw) / 2;
    if (mx < x1 - 2) {
      if (rnd() < 0.5) disc(c, mx, fy + fh / 2, fh * 0.26, team);
      else rect(c, mx - fh * 0.2, fy + fh * 0.25, fh * 0.4, fh * 0.5, GR.red);
    }
  }
  rect(c, x0 - 1.5, y - 1, x1 - x0 + 3, 2.6, vgrad(c, y - 1, y + 1.6, GR.marble, 1.15, 0.8));
  line(c, x0 - 1.5, y + 1.6, x1 + 1.5, y + 1.6, 0.6, 'rgba(60,40,20,0.5)');
}

/** Relief figures for a pediment (pale on blue), tallest in the middle. */
function reliefs(c: Ctx, x0: number, x1: number, base: number, rise: number, rnd: Rnd): void {
  const cx = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const step = Math.max(6.5, rise * 0.42);
  for (let x = cx - Math.floor((half - 4) / step) * step; x < x1 - 3; x += step) {
    const h = rise * (1 - Math.abs(x - cx) / half) * 0.8;
    if (h < 4) {
      // Reclining figure in the corners.
      if (h > 1.5) ell(c, x, base - 1.2, 2.8, 1.2, '#efe7d4');
      continue;
    }
    const col = Math.abs(x - cx) < 1 ? '#e2c46a' : '#efe7d4';
    const r = Math.min(1.8, h * 0.13);
    const lean = (x < cx ? 1 : -1) * h * 0.08;
    disc(c, x + lean, base - h + r, r, col);
    poly(
      c,
      [
        x + lean - r * 0.9,
        base - h + r * 2,
        x + lean + r * 0.9,
        base - h + r * 2,
        x + r * 1.4,
        base - 0.5,
        x - r * 1.4,
        base - 0.5,
      ],
      col,
    );
    if (rnd() < 0.5)
      line(
        c,
        x + lean,
        base - h + r * 2.6,
        x + lean + (x < cx ? -1 : 1) * r * 2.4,
        base - h + r * 1.4,
        0.7,
        col,
      );
  }
}

/** A frontal pediment: tympanum, raking cornice and acroteria. */
function pediment(
  c: Ctx,
  x0: number,
  x1: number,
  base: number,
  rise: number,
  team: string,
  rnd: Rnd,
): void {
  const cx = (x0 + x1) / 2;
  poly(
    c,
    [x0, base, cx, base - rise, x1, base],
    vgrad(c, base - rise, base, GR.marble, 1.1, 0.88),
    INK,
    0.8,
  );
  const ins = 3.2;
  const tri = [x0 + ins * 2.2, base - 1.2, cx, base - rise + ins, x1 - ins * 2.2, base - 1.2];
  poly(c, tri, vgrad(c, base - rise, base, GR.blue, 1.2, 0.85));
  clipped(c, tri, () => reliefs(c, x0 + ins * 2, x1 - ins * 2, base - 1.2, rise - ins, rnd));
  line(c, x0 - 1, base + 0.5, cx, base - rise - 0.5, 1.2, shade(GR.marble, 1.15));
  line(c, cx, base - rise - 0.5, x1 + 1, base + 0.5, 1.2, shade(GR.marble, 0.85));
  rect(
    c,
    x0 - 1.5,
    base - 0.6,
    x1 - x0 + 3,
    2.2,
    vgrad(c, base - 0.6, base + 1.6, GR.marble, 1.1, 0.75),
  );
  acroterion(c, cx, base - rise - 0.5, 1.2);
  acroterion(c, x0 + 1, base - 0.5, 0.8);
  acroterion(c, x1 - 1, base - 0.5, 0.8);
  void team;
}

function acroterion(c: Ctx, x: number, y: number, s: number): void {
  c.fillStyle = rgrad(c, x, y - 3 * s, 4 * s, GOLD);
  c.beginPath();
  c.moveTo(x - 3.2 * s, y);
  c.quadraticCurveTo(x - 4 * s, y - 4 * s, x, y - 6.5 * s);
  c.quadraticCurveTo(x + 4 * s, y - 4 * s, x + 3.2 * s, y);
  c.closePath();
  c.fill();
  stroke(c, 0.6, INK);
  line(c, x, y - 0.5, x, y - 5 * s, 0.5, '#8a6a20');
}

function amphora(c: Ctx, x: number, y: number, s: number, col = '#b8643a'): void {
  c.beginPath();
  c.moveTo(x - 1.4 * s, y);
  c.quadraticCurveTo(x - 4.6 * s, y - 4 * s, x - 3.6 * s, y - 8 * s);
  c.quadraticCurveTo(x - 2.6 * s, y - 10 * s, x - 1.2 * s, y - 10.5 * s);
  c.lineTo(x - 1.2 * s, y - 13 * s);
  c.lineTo(x + 1.2 * s, y - 13 * s);
  c.lineTo(x + 1.2 * s, y - 10.5 * s);
  c.quadraticCurveTo(x + 2.6 * s, y - 10 * s, x + 3.6 * s, y - 8 * s);
  c.quadraticCurveTo(x + 4.6 * s, y - 4 * s, x + 1.4 * s, y);
  c.closePath();
  c.fillStyle = hgrad(c, x - 4.5 * s, x + 4.5 * s, col, 1.3, 0.65);
  c.fill();
  stroke(c, 0.7, INK);
  rect(c, x - 3.8 * s, y - 7.6 * s, 7.6 * s, 1.6 * s, '#2a1c14');
  for (const d of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + d * 1.2 * s, y - 12.3 * s);
    c.quadraticCurveTo(x + d * 3.6 * s, y - 12.6 * s, x + d * 3.2 * s, y - 9.6 * s);
    stroke(c, 0.8 * s, shade(col, 0.8));
  }
}

function potPlant(c: Ctx, x: number, y: number, rnd: Rnd): void {
  poly(
    c,
    [x - 3.6, y - 6, x + 3.6, y - 6, x + 2.6, y, x - 2.6, y],
    hgrad(c, x - 4, x + 4, '#b5603a'),
    INK,
    0.6,
  );
  rect(c, x - 4.2, y - 7.2, 8.4, 1.6, '#c87046');
  bush(c, x, y - 6, 5, '#5f8a3a', rnd);
}

function olive(c: Ctx, x: number, y: number, s: number, rnd: Rnd): void {
  c.beginPath();
  c.moveTo(x - 2.4 * s, y);
  c.quadraticCurveTo(x - 0.5 * s, y - 6 * s, x - 2.4 * s, y - 12 * s);
  c.lineTo(x + 1.2 * s, y - 12 * s);
  c.quadraticCurveTo(x + 2 * s, y - 6 * s, x + 2.6 * s, y);
  c.closePath();
  c.fillStyle = hgrad(c, x - 3 * s, x + 3 * s, '#7a6650');
  c.fill();
  stroke(c, 0.6, INK);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const bx = x + Math.cos(a) * 7 * s;
    const by = y - 17 * s + Math.sin(a) * 4.5 * s;
    disc(c, bx, by, (3.6 + rnd() * 1.4) * s, rgrad(c, bx, by, 4.5 * s, GR.olive));
  }
  disc(c, x, y - 18 * s, 5 * s, rgrad(c, x, y - 18 * s, 5 * s, shade(GR.olive, 1.1)));
  const lv = new Path2D();
  for (let i = 0; i < 16; i++) {
    const lx = x + (rnd() - 0.5) * 16 * s;
    const ly = y - 17 * s + (rnd() - 0.5) * 9 * s;
    lv.moveTo(lx, ly);
    lv.lineTo(lx + 1.4, ly - 0.6);
  }
  stroke(c, 0.6, '#c8d0a4', lv);
}

function cypress(c: Ctx, x: number, y: number, h: number): void {
  c.beginPath();
  c.moveTo(x, y - h);
  c.quadraticCurveTo(x + h * 0.2, y - h * 0.5, x + h * 0.1, y - 2);
  c.lineTo(x - h * 0.1, y - 2);
  c.quadraticCurveTo(x - h * 0.2, y - h * 0.5, x, y - h);
  c.closePath();
  c.fillStyle = hgrad(c, x - h * 0.15, x + h * 0.15, '#3f6a34', 1.3, 0.6);
  c.fill();
  stroke(c, 0.7, INK);
  line(c, x, y, x, y - 4, 1.6, '#5a4030');
}

function brazier(c: Ctx, x: number, y: number, s = 1): void {
  line(c, x - 4 * s, y, x - 1 * s, y - 8 * s, 1.2, GR.bronze);
  line(c, x + 4 * s, y, x + 1 * s, y - 8 * s, 1.2, GR.bronze);
  line(c, x, y, x, y - 8 * s, 1.2, shade(GR.bronze, 0.8));
  poly(
    c,
    [x - 5 * s, y - 10 * s, x + 5 * s, y - 10 * s, x + 3 * s, y - 7 * s, x - 3 * s, y - 7 * s],
    hgrad(c, x - 5 * s, x + 5 * s, GR.bronze),
    INK,
    0.6,
  );
  halo(c, x, y - 13 * s, 12 * s, 0.5);
  flame(c, x, y - 10 * s, 8 * s);
}

/** Bronze hoplite shield (aspis) with a team field and a white emblem. */
function aspis(c: Ctx, x: number, y: number, r: number, team: string, emblem: number): void {
  disc(c, x, y, r + 1, '#5a3a1a');
  disc(c, x, y, r + 0.4, rgrad(c, x, y, r, GR.bronze));
  disc(c, x, y, r * 0.8, rgrad(c, x, y, r * 0.8, team));
  c.strokeStyle = '#f2ead6';
  c.lineWidth = Math.max(0.9, r * 0.16);
  c.beginPath();
  if (emblem === 0) {
    c.moveTo(x - r * 0.4, y + r * 0.45);
    c.lineTo(x, y - r * 0.45);
    c.lineTo(x + r * 0.4, y + r * 0.45);
  } else if (emblem === 1) {
    c.arc(x, y, r * 0.38, 0, Math.PI * 2);
  } else {
    c.moveTo(x - r * 0.45, y);
    c.lineTo(x + r * 0.45, y);
    c.moveTo(x, y - r * 0.45);
    c.lineTo(x, y + r * 0.45);
  }
  c.stroke();
}

/** Grape-vine pergola: two posts, a beam and a leafy canopy with grape bunches. */
function pergola(c: Ctx, x0: number, x1: number, top: number, base: number, rnd: Rnd): void {
  for (const x of [x0, x1]) {
    line(c, x, base, x, top, 2.4, '#7a5634');
    line(c, x - 0.6, base, x - 0.6, top, 0.7, '#a07a50');
  }
  line(c, x0 - 3, top, x1 + 3, top, 2.2, '#6a4a2c');
  for (let x = x0 - 2; x <= x1 + 2; x += 4.5) {
    const y = top - 2 + (rnd() - 0.5) * 3;
    disc(c, x, y, 3.6 + rnd() * 1.2, rgrad(c, x, y, 4.2, '#5e8c36'));
  }
  for (let x = x0 + 2; x < x1; x += 7 + rnd() * 3) {
    const y = top + 2 + rnd() * 2;
    for (let k = 0; k < 5; k++)
      disc(c, x + (k % 2) * 1.5, y + Math.floor(k / 2) * 1.4, 0.9, '#5e2458');
  }
  line(c, x0, base - 2, x0 + 1, top + 4, 1, '#5e8c36');
}

/** Small bronze statue of a spear-bearer on a marble plinth. */
function statue(c: Ctx, x: number, y: number, s: number): void {
  rect(c, x - 5 * s, y - 8 * s, 10 * s, 8 * s, vgrad(c, y - 8 * s, y, GR.marble, 1.1, 0.8));
  c.strokeStyle = INK;
  c.lineWidth = 0.6;
  c.strokeRect(x - 5 * s, y - 8 * s, 10 * s, 8 * s);
  const b = '#6e8a78';
  line(c, x - 1.2 * s, y - 8 * s, x - 0.4 * s, y - 14 * s, 1.6 * s, b);
  line(c, x + 1.4 * s, y - 8 * s, x + 0.4 * s, y - 14 * s, 1.6 * s, b);
  poly(
    c,
    [
      x - 2 * s,
      y - 14 * s,
      x + 2 * s,
      y - 14 * s,
      x + 1.8 * s,
      y - 20 * s,
      x - 1.8 * s,
      y - 20 * s,
    ],
    b,
  );
  disc(c, x, y - 21.6 * s, 1.6 * s, b);
  line(c, x + 2.6 * s, y - 9 * s, x + 2.6 * s, y - 27 * s, 0.8 * s, '#4a5a50');
  line(c, x + 1.6 * s, y - 18.5 * s, x + 2.6 * s, y - 16 * s, 1 * s, b);
}

/** Greek gabled volume: walls, details, terracotta roof and a pediment on the west gable. */
function gVolume(
  c: Ctx,
  b: Box,
  wall: WallKind,
  wallCol: string,
  team: string,
  rnd: Rnd,
  deco?: (g: BoxG) => void,
): BoxG {
  const g = boxG(b);
  const v: VolumeStyle = { wall, wallCol, roof: 'tile', roofCol: GR.tile, footing: '#b6ae9c' };
  boxWalls(c, g, v, rnd);
  // Painted dado band and stone socle.
  clipped(c, g.front, () => {
    rect(c, b.x0, b.base - 6, b.x1 - b.x0, 6, vgrad(c, b.base - 6, b.base, '#c9bea6', 1.05, 0.8));
    line(c, b.x0, b.base - 6, b.x1, b.base - 6, 0.8, 'rgba(70,50,30,0.6)');
    rect(c, b.x0, g.eave, b.x1 - b.x0, 2.5, team);
  });
  deco?.(g);
  boxRoof(c, g, v, rnd);
  // West pediment: tympanum in the gable plane with raking cornices.
  inGable(c, g, (lu) => {
    const ins = 3;
    trace(c, [ins * 2, -1, lu / 2, -b.rise + ins, lu - ins * 2, -1]);
    c.fillStyle = vgrad(c, -b.rise, 0, GR.blue, 1.25, 0.9);
    c.fill();
    reliefs(c, ins * 2, lu - ins * 2, -1, b.rise - ins, rnd);
    rect(c, 0, -1.5, lu, 3, vgrad(c, -1.5, 1.5, GR.marble, 1.1, 0.8));
  });
  const front: Pt = [b.x0, g.eave + 1];
  const back: Pt = [b.x0 - b.dx, g.eave - b.dy + 1];
  for (const [a, z] of [
    [back, g.apex],
    [front, g.apex],
    [g.roof.at(1, 0), g.roof.at(1, 1)],
  ] as const) {
    line(c, a[0], a[1], z[0], z[1], 3, '#8f8676');
    line(c, a[0], a[1] - 0.6, z[0], z[1] - 0.6, 1.8, GR.marble);
  }
  acroterion(c, g.apex[0], g.apex[1] - 0.5, 1);
  acroterion(c, ...g.roof.at(1, 1), 0.9);
  acroterion(c, back[0], back[1], 0.7);
  return g;
}

function gTownHall(c: Ctx, team: string, rnd: Rnd): void {
  const cols = [0.04, 0.17, 0.3, 0.7, 0.83, 0.96];
  const g = gVolume(
    c,
    { x0: 46, x1: 178, base: 226, wallH: 56, dx: 30, dy: 20, rise: 22, ov: 5 },
    'marble',
    GR.marble,
    team,
    rnd,
    (g) => {
      // Deep stoa: shaded back wall behind the colonnade, with doors and lit windows.
      rect(c, g.b.x0, g.eave + 9, g.b.x1 - g.b.x0, g.b.wallH - 9, 'rgba(40,30,30,0.32)');
      for (const s of [0.1, 0.23, 0.77, 0.9])
        windowLit(c, g.X(s) - 3.5, g.eave + 22, 7, 10, '#6a5a48', undefined, true);
      frieze(c, g.b.x0, g.b.x1, g.eave, 10, team, rnd);
      for (const s of cols) column(c, g.X(s), g.eave + 10, g.b.base - 5, 7, GR.marble);
      // Long team banners hung between the columns.
      for (const s of [0.105, 0.895]) {
        const x = g.X(s);
        poly(
          c,
          [
            x - 4,
            g.eave + 11,
            x + 4,
            g.eave + 11,
            x + 4,
            g.eave + 36,
            x,
            g.eave + 32,
            x - 4,
            g.eave + 36,
          ],
          vgrad(c, g.eave + 11, g.eave + 36, team, 1.25, 0.75),
          INK,
          0.6,
        );
        line(c, x - 2.5, g.eave + 15, x + 2.5, g.eave + 15, 0.8, GOLD);
        line(c, x - 2.5, g.eave + 28, x + 2.5, g.eave + 28, 0.8, GOLD);
      }
    },
  );
  // Stepped stylobate along the front.
  for (let i = 0; i < 3; i++) {
    const y = g.b.base - 4 + i * 3;
    rect(
      c,
      g.b.x0 - 2 - i * 2,
      y,
      g.b.x1 - g.b.x0 + 4 + i * 4,
      3,
      vgrad(c, y, y + 3, GR.marble, 1.15, 0.78),
    );
  }
  // Central portico with its own pediment facing the viewer.
  const px0 = 88;
  const px1 = 136;
  const pb = g.b.base - 5;
  const top = 168;
  rect(c, px0 + 3, top, px1 - px0 - 6, pb - top, vgrad(c, top, pb, '#5a463a', 1.1, 0.7));
  halo(c, (px0 + px1) / 2, pb - 10, 18, 0.55);
  rect(c, (px0 + px1) / 2 - 7, pb - 22, 14, 22, '#3a2a20');
  for (const k of [-1, 1])
    rect(
      c,
      (px0 + px1) / 2 + (k < 0 ? -6.4 : 0.4),
      pb - 21,
      6,
      21,
      vgrad(c, pb - 21, pb, GR.bronze, 1.2, 0.7),
    );
  for (let i = 0; i < 4; i++)
    column(c, px0 + 5 + i * ((px1 - px0 - 10) / 3), top, pb, 6.5, GR.marble, true);
  frieze(c, px0 - 2, px1 + 2, top - 9, 9, team, rnd);
  pediment(c, px0 - 4, px1 + 4, top - 9, 20, team, rnd);
  for (let i = 0; i < 3; i++) {
    const y = pb + i * 3;
    rect(
      c,
      px0 - 4 - i * 2,
      y,
      px1 - px0 + 8 + i * 4,
      3,
      vgrad(c, y, y + 3, GR.marble, 1.15, 0.78),
    );
  }
  statue(c, 24, 250, 1);
  olive(c, 177, 252, 0.85, rnd);
  amphora(c, 62, 252, 0.9);
  amphora(c, 70, 254, 0.8, '#a85a34');
  clothBanner(c, 12, 140, 104, 14, 34, team, GOLD, (x, y) => disc(c, x, y, 3, GOLD));
}

function gHouse(c: Ctx, team: string, rnd: Rnd): void {
  const g = gVolume(
    c,
    { x0: 40, x1: 112, base: 174, wallH: 46, dx: 24, dy: 16, rise: 16, ov: 4 },
    'plaster',
    GR.white,
    team,
    rnd,
    (g) => {
      // Upper floor windows with team shutters, ground floor window and door.
      for (const s of [0.22, 0.62]) windowLit(c, g.X(s) - 3.5, g.eave + 8, 7, 9, '#8a7a62', team);
      line(c, g.b.x0, g.eave + 22, g.b.x1, g.eave + 22, 1.4, '#c9b896');
      windowLit(c, g.X(0.2) - 3.5, g.eave + 28, 7, 8, '#8a7a62', team);
      const dx = g.X(0.6);
      rect(c, dx - 8, g.b.base - 21, 16, 21, '#b0a48a');
      rect(
        c,
        dx - 9.5,
        g.b.base - 23.5,
        19,
        3,
        vgrad(c, g.b.base - 24, g.b.base - 20, GR.marble, 1.1, 0.8),
      );
      plankDoor(c, dx - 6, g.b.base - 19, 12, 19, shade(team, 0.75), rnd);
      inGable(c, g, (lu) => windowLit(c, lu / 2 - 3, 8, 6, 8, '#8a7a62', team));
    },
  );
  void g;
  pergola(c, 98, 124, 150, 184, rnd);
  amphora(c, 112, 186, 0.8);
  potPlant(c, 76, 186, rnd);
  olive(c, 16, 184, 0.85, rnd);
}

function gStorehouse(c: Ctx, team: string, rnd: Rnd): void {
  const g = gVolume(
    c,
    { x0: 44, x1: 116, base: 172, wallH: 36, dx: 24, dy: 16, rise: 16, ov: 4 },
    'marble',
    '#e2d8c2',
    team,
    rnd,
    (g) => {
      // Open front: dark interior with stacked amphorae and sacks between square piers.
      rect(
        c,
        g.b.x0 + 3,
        g.eave + 6,
        g.b.x1 - g.b.x0 - 6,
        g.b.wallH - 8,
        vgrad(c, g.eave, g.b.base, '#3e3028', 1.1, 0.8),
      );
      for (let row = 0; row < 2; row++)
        for (let x = g.b.x0 + 9 + row * 4; x < g.b.x1 - 6; x += 8)
          amphora(c, x, g.b.base - 3 - row * 11, 0.75, row ? '#a85a34' : '#b8643a');
      for (const s of [0, 0.33, 0.67, 1]) {
        const x = g.X(s) + (s === 0 ? 3 : s === 1 ? -3 : 0);
        rect(c, x - 3, g.eave + 4, 6, g.b.wallH - 4, hgrad(c, x - 3, x + 3, '#e8dfca'));
      }
      frieze(c, g.b.x0, g.b.x1, g.eave, 7, team, rnd);
    },
  );
  void g;
  crate(c, 8, 186, 9, '#b08050');
  amphora(c, 26, 186, 0.85);
  amphora(c, 33, 188, 0.75, '#a85a34');
  sack(c, 104, 186, 0.9);
  clothBanner(c, 119, 92, 92, 10, 26, team);
}

function gBarracks(c: Ctx, team: string, rnd: Rnd): void {
  const g = gVolume(
    c,
    { x0: 46, x1: 150, base: 222, wallH: 44, dx: 30, dy: 20, rise: 20, ov: 5 },
    'plaster',
    '#ece0c4',
    team,
    rnd,
    (g) => {
      const dx = g.X(0.5);
      rect(c, dx - 11, g.b.base - 28, 22, 28, '#b0a48a');
      pediment(c, dx - 14, dx + 14, g.b.base - 28, 9, team, rnd);
      plankDoor(c, dx - 9, g.b.base - 26, 18, 26, shade(team, 0.7), rnd);
      for (const s of [0.14, 0.86]) windowLit(c, g.X(s) - 4, g.eave + 9, 8, 10, '#8a7a62', team);
      [0.28, 0.36, 0.64, 0.72].forEach((s, i) => aspis(c, g.X(s), g.eave + 15, 6.4, team, i % 3));
    },
  );
  void g;
  // Spear rack, helmet on a post and a sandy training ground.
  ell(c, 172, 238, 18, 9, 'rgba(220,200,150,0.55)');
  line(c, 154, 216, 154, 248, 1.8, GR.wood);
  line(c, 184, 216, 184, 248, 1.8, GR.wood);
  line(c, 152, 222, 186, 222, 1.8, GR.wood);
  for (let i = 0; i < 6; i++) {
    const x = 157 + i * 5;
    line(c, x, 250, x + 2, 196, 1.2, '#9a7048');
    poly(c, [x + 2.2, 190, x + 0.8, 197, x + 3.4, 197], '#d0c8b4', INK, 0.4);
  }
  const hx = 166;
  line(c, hx, 254, hx, 238, 1.8, GR.wood);
  c.fillStyle = rgrad(c, hx, 234, 5, GR.bronze);
  c.beginPath();
  c.moveTo(hx - 4.5, 238);
  c.quadraticCurveTo(hx - 5, 229, hx, 229);
  c.quadraticCurveTo(hx + 5, 229, hx + 4.5, 238);
  c.lineTo(hx + 1.5, 238);
  c.lineTo(hx + 1.5, 234);
  c.lineTo(hx - 1.5, 234);
  c.lineTo(hx - 1.5, 238);
  c.closePath();
  c.fill();
  stroke(c, 0.6, INK);
  c.fillStyle = team;
  c.beginPath();
  c.ellipse(hx, 228, 6, 2.6, 0, Math.PI, 0);
  c.fill();
  aspis(c, 22, 246, 7, team, 0);
  amphora(c, 36, 250, 0.8);
  clothBanner(c, 12, 150, 96, 14, 32, team, GOLD, (x, y) => disc(c, x, y, 3, GOLD));
}

function gStable(c: Ctx, team: string, rnd: Rnd): void {
  const g = gVolume(
    c,
    { x0: 42, x1: 130, base: 208, wallH: 36, dx: 28, dy: 18, rise: 18, ov: 4 },
    'sandstone',
    '#d8cdb4',
    team,
    rnd,
    (g) => {
      for (const s of [0.2, 0.5, 0.8]) {
        const x = g.X(s);
        rect(c, x - 9, g.b.base - 24, 18, 24, '#4a3a2a');
        rect(c, x - 8, g.b.base - 23, 16, 23, '#1e160e');
        c.save();
        c.beginPath();
        c.rect(x - 8, g.b.base - 23, 16, 23);
        c.clip();
        horse(
          c,
          x - 4,
          g.b.base + 5,
          0.95,
          s === 0.5 ? '#e4ddd0' : s < 0.5 ? '#9a6a3e' : '#5e3e28',
          -1,
        );
        c.restore();
        rect(c, x - 8, g.b.base - 10, 16, 10, vgrad(c, g.b.base - 10, g.b.base, GR.wood));
        line(c, x - 8, g.b.base - 10, x + 8, g.b.base - 10, 1.2, '#4a3424');
      }
    },
  );
  void g;
  railFence(c, 134, 210, 54, 10);
  horse(c, 164, 240, 1.15, '#d8d0c4', -1);
  hay(c, 146, 224, 15);
  trough(c, 168, 252, 18);
  railFence(c, 134, 254, 54, 10);
  cypress(c, 20, 236, 44);
  clothBanner(c, 181, 140, 64, 10, 24, team);
}

function gWorkshop(c: Ctx, team: string, rnd: Rnd): void {
  const g = gVolume(
    c,
    { x0: 44, x1: 132, base: 218, wallH: 40, dx: 28, dy: 18, rise: 18, ov: 4 },
    'plaster',
    '#ece2cc',
    team,
    rnd,
    (g) => {
      const dx = g.X(0.62);
      rect(c, dx - 10, g.b.base - 24, 20, 24, '#3a2a20');
      halo(c, dx, g.b.base - 8, 14, 0.5, '255,150,60');
      windowLit(c, g.X(0.2) - 4, g.eave + 10, 8, 9, '#8a7a62', team);
      // Shelf of drying pots on the wall.
      line(c, g.X(0.08), g.eave + 26, g.X(0.4), g.eave + 26, 1.4, GR.wood);
      for (let x = g.X(0.1); x < g.X(0.38); x += 6) amphora(c, x, g.eave + 25.5, 0.55, '#c07a4a');
    },
  );
  // Striped awning in team colours over the door.
  const ax = g.X(0.62);
  const ay = g.eave + 14;
  for (let i = 0; i < 6; i++) {
    const x = ax - 15 + i * 5;
    poly(c, [x, ay, x + 5, ay, x + 6, ay + 8, x + 1, ay + 8], i % 2 ? '#f2ead6' : team);
  }
  line(c, ax - 15, ay, ax + 15, ay, 1, INK);
  line(c, ax - 14, ay + 8, ax - 14, g.b.base, 1.2, GR.wood);
  line(c, ax + 16, ay + 8, ax + 16, g.b.base, 1.2, GR.wood);
  // Domed pottery kiln with a glowing mouth.
  const kx = 30;
  const ky = 246;
  c.fillStyle = rgrad(c, kx, ky - 12, 16, '#b07850');
  c.beginPath();
  c.moveTo(kx - 15, ky);
  c.quadraticCurveTo(kx - 15, ky - 24, kx, ky - 24);
  c.quadraticCurveTo(kx + 15, ky - 24, kx + 15, ky);
  c.closePath();
  c.fill();
  stroke(c, 0.9, INK);
  c.fillStyle = '#2a1a10';
  c.beginPath();
  c.arc(kx, ky, 5.5, Math.PI, 0);
  c.fill();
  c.fillStyle = glow(c, ky - 5, ky);
  c.beginPath();
  c.arc(kx, ky, 4, Math.PI, 0);
  c.fill();
  halo(c, kx, ky - 2, 12, 0.5, '255,140,50');
  ell(c, kx, ky - 23.5, 3.5, 1.2, '#2a1a10');
  // Wooden crane lifting a stone block.
  const cx = 160;
  line(c, cx - 10, 250, cx + 2, 150, 3, '#7a5634');
  line(c, cx + 14, 250, cx + 2, 150, 3, '#6a4a2c');
  line(c, cx - 6, 216, cx + 10, 216, 1.6, '#6a4a2c');
  line(c, cx + 2, 150, cx - 22, 162, 2.2, '#7a5634');
  line(c, cx - 20, 162, cx - 20, 196, 0.8, '#d8c385');
  wheel(c, cx + 2, 236, 9);
  rect(c, cx - 27, 196, 14, 10, vgrad(c, 196, 206, '#e2dac8', 1.1, 0.8));
  c.strokeStyle = INK;
  c.lineWidth = 0.7;
  c.strokeRect(cx - 27, 196, 14, 10);
  for (let k = 0; k < 3; k++) {
    const y = 252 - k * 7;
    rect(c, 176, y - 7, 14, 7, vgrad(c, y - 7, y, '#ddd4c0', 1.1, 0.8));
    c.strokeRect(176, y - 7, 14, 7);
  }
  amphora(c, 64, 252, 0.8);
  amphora(c, 72, 254, 0.75, '#a85a34');
}

function gTower(c: Ctx, team: string, rnd: Rnd): void {
  const g = gVolume(
    c,
    { x0: 46, x1: 100, base: 178, wallH: 118, dx: 18, dy: 12, rise: 16, ov: 3 },
    'marble',
    '#e2d9c6',
    team,
    rnd,
    (g) => {
      // String courses, slit windows and an upper chamber with shuttered windows.
      for (const y of [g.eave + 24, g.eave + 64]) {
        line(c, g.b.x0, y, g.b.x1, y, 1.8, '#c4baa4');
        line(c, g.b.x0, y + 1.2, g.b.x1, y + 1.2, 0.6, 'rgba(60,40,20,0.4)');
      }
      for (const s of [0.3, 0.7])
        windowLit(c, g.X(s) - 4, g.eave + 8, 8, 10, '#7a6a52', team, true);
      for (const s of [0.25, 0.75]) {
        rect(c, g.X(s) - 1.4, g.eave + 36, 2.8, 12, '#2a2018');
        rect(c, g.X(s) - 1.4, g.eave + 76, 2.8, 12, '#2a2018');
      }
      plankDoor(c, g.X(0.5) - 7, g.b.base - 20, 14, 20, shade(team, 0.75), rnd, true);
      inGable(c, g, (lu) => {
        rect(c, lu / 2 - 1.2, 40, 2.4, 12, '#2a2018');
        rect(c, lu / 2 - 1.2, 80, 2.4, 12, '#2a2018');
      });
    },
  );
  const [rx, ry] = g.roof.at(0.5, 1);
  line(c, rx, ry, rx, ry - 20, 1.4, '#5a3e24');
  pennant(c, rx - 0.5, ry - 20, 18, team);
  amphora(c, 112, 186, 0.8);
  potPlant(c, 26, 184, rnd);
}

function gTemple(c: Ctx, team: string, rnd: Rnd): void {
  const cx = 96;
  const x0 = 20;
  const x1 = 172;
  // Roof slopes recede behind the front pediment.
  const pb = 146;
  const ap: Pt = [cx, 112];
  const depth = 24;
  inFrame(c, ap, [0, -depth], [x0 - 4 - cx, pb - ap[1]], (lu, lv) =>
    tileRoof(c, flatRoof(lu, lv), GR.tile, rnd, 5.2, false),
  );
  inFrame(c, ap, [0, -depth], [x1 + 4 - cx, pb - ap[1]], (lu, lv) =>
    tileRoof(c, flatRoof(lu, lv), shade(GR.tile, 0.85), rnd, 5.2, false),
  );
  line(c, x0 - 4, pb - depth, cx, ap[1] - depth, 2.4, shade(GR.marble, 0.9));
  line(c, x1 + 4, pb - depth, cx, ap[1] - depth, 2.4, shade(GR.marble, 0.8));
  acroterion(c, cx, ap[1] - depth, 0.9);
  // Crepidoma.
  for (let i = 0; i < 3; i++) {
    const y = 228 + i * 3.4;
    rect(
      c,
      x0 - 8 + (2 - i) * 3 - 6,
      y,
      x1 - x0 + 16 - (2 - i) * 6 + 12,
      3.4,
      vgrad(c, y, y + 3.4, GR.marble, 1.15, 0.75),
    );
  }
  // Dark cella with the gilded cult statue.
  rect(c, x0 + 6, 160, x1 - x0 - 12, 68, vgrad(c, 160, 228, '#4a3a32', 1.1, 0.65));
  halo(c, cx, 206, 30, 0.6);
  rect(c, cx - 8, 216, 16, 12, vgrad(c, 216, 228, GR.marble, 1.1, 0.8));
  poly(
    c,
    [cx - 4, 216, cx + 4, 216, cx + 3, 196, cx - 3, 196],
    vgrad(c, 196, 216, GOLD, 1.3, 0.75),
  );
  disc(c, cx, 193, 3, rgrad(c, cx, 193, 3, GOLD));
  line(c, cx + 5, 214, cx + 5, 186, 1, '#d9b050');
  // Team banners hung in the outer bays.
  for (const x of [x0 + 21, x1 - 21]) {
    poly(
      c,
      [x - 5, 161, x + 5, 161, x + 5, 196, x, 191, x - 5, 196],
      vgrad(c, 161, 196, team, 1.25, 0.75),
      INK,
      0.6,
    );
    line(c, x - 3, 166, x + 3, 166, 0.8, GOLD);
    disc(c, x, 176, 2.4, GOLD);
  }
  for (let i = 0; i < 6; i++) column(c, x0 + 7 + i * ((x1 - x0 - 14) / 5), 162, 228, 10, GR.marble);
  frieze(c, x0, x1, pb, 16, team, rnd);
  pediment(c, x0 - 4, x1 + 4, pb, pb - ap[1], team, rnd);
  for (const x of [x0 + 2, x1 - 2]) brazier(c, x, 252, 1);
  olive(c, 12, 254, 0.7, rnd);
  olive(c, 180, 254, 0.7, rnd);
}

function gShrine(c: Ctx, team: string, rnd: Rnd): void {
  const cx = 64;
  const base = 170;
  const rx = 42;
  const ry = 11;
  // Circular stepped podium.
  for (let i = 0; i < 3; i++) {
    const y = base + 8 - i * 4;
    ell(c, cx, y, rx + 8 - i * 3, ry + 3 - i, shade(GR.marble, 0.7 - i * 0.04));
    ell(
      c,
      cx,
      y - 2,
      rx + 8 - i * 3,
      ry + 3 - i,
      vgrad(c, y - ry - 4, y + ry, GR.marble, 1.1, 0.85),
    );
  }
  const top = 112;
  // Back columns and inner sanctum with the eternal flame.
  ell(c, cx, base - 2, rx - 6, ry - 3, '#4a3a32');
  rect(c, cx - rx + 6, top, (rx - 6) * 2, base - 2 - top, vgrad(c, top, base, '#4a3a32', 1.1, 0.7));
  for (let k = 0; k < 6; k++) {
    const a = Math.PI + (k + 0.5) * (Math.PI / 6);
    column(
      c,
      cx + Math.cos(a) * (rx - 4),
      top,
      base - 4 + Math.sin(a) * ry * 0.8,
      5,
      shade(GR.marble, 0.75),
    );
  }
  halo(c, cx, base - 20, 30, 0.75);
  rect(c, cx - 6, base - 12, 12, 9, vgrad(c, base - 12, base - 3, GR.marble, 1.1, 0.8));
  flame(c, cx, base - 12, 18);
  // Front columns.
  for (let k = 0; k < 7; k++) {
    const a = (k / 6) * Math.PI;
    const x = cx - Math.cos(a) * rx;
    column(c, x, top, base + Math.sin(a) * ry * 0.9, 6.5, GR.marble, true);
  }
  // Ring entablature with a team-coloured garland swag.
  c.fillStyle = vgrad(c, top - 10, top + ry, GR.marble, 1.1, 0.85);
  c.beginPath();
  c.ellipse(cx, top - 4, rx + 4, ry, 0, 0, Math.PI);
  c.lineTo(cx - rx - 4, top - 11);
  c.ellipse(cx, top - 11, rx + 4, ry, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  stroke(c, 0.8, INK);
  c.beginPath();
  c.ellipse(cx, top - 7, rx + 4, ry, 0, 0.1, Math.PI - 0.1);
  stroke(c, 2, GR.blue);
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI;
    const a1 = ((k + 1) / 6) * Math.PI;
    const xa = cx - Math.cos(a0) * rx;
    const xb = cx - Math.cos(a1) * rx;
    const ya = top - 3 + Math.sin(a0) * ry;
    const yb = top - 3 + Math.sin(a1) * ry;
    c.beginPath();
    c.moveTo(xa, ya);
    c.quadraticCurveTo((xa + xb) / 2, Math.max(ya, yb) + 6, xb, yb);
    stroke(c, 2, team);
  }
  // Conical tiled roof.
  const apex: Pt = [cx, 66];
  c.save();
  c.beginPath();
  c.moveTo(cx - rx - 6, top - 11);
  c.lineTo(apex[0], apex[1]);
  c.lineTo(cx + rx + 6, top - 11);
  c.ellipse(cx, top - 11, rx + 6, ry, 0, 0, Math.PI);
  c.closePath();
  c.clip();
  {
    rect(
      c,
      cx - rx - 6,
      apex[1],
      (rx + 6) * 2,
      top - apex[1] + ry,
      hgrad(c, cx - rx, cx + rx, GR.tile, 1.25, 0.7),
    );
    const rib = new Path2D();
    for (let k = -6; k <= 6; k++) {
      rib.moveTo(apex[0], apex[1]);
      rib.lineTo(cx + k * 8, top - 11 + ry * Math.cos((k / 7) * (Math.PI / 2)));
    }
    stroke(c, 1.6, shade(GR.tile, 1.15), rib);
    const course = new Path2D();
    for (let t = 0.2; t < 1; t += 0.16)
      course.ellipse(cx, apex[1] + (top - 11 - apex[1]) * t, (rx + 6) * t, ry * t, 0, 0, Math.PI);
    stroke(c, 0.8, 'rgba(70,22,12,0.5)', course);
  }
  c.restore();
  c.beginPath();
  c.ellipse(cx, top - 11, rx + 6, ry, 0, 0, Math.PI);
  stroke(c, 2, shade(GR.tile, 0.7));
  acroterion(c, apex[0], apex[1] + 1, 1.1);
  brazier(c, 18, 186, 0.9);
  brazier(c, 110, 186, 0.9);
  potPlant(c, 36, 190, rnd);
  potPlant(c, 92, 190, rnd);
}

// ───────────────────────── Sahrun (Egyptian) ─────────────────────────

const EG = {
  sand: '#d9b97a',
  mud: '#c8a676',
  plaster: '#ece0c6',
  blue: '#2f5fa0',
  red: '#b4492e',
  green: '#3f8f6a',
  palm: '#4f7d2e',
  trunk: '#8a6a44',
  skin: '#a0522d',
};

/** Flat-roofed block with battered (inward-leaning) walls, seen in three-quarter view. */
interface EBox {
  x0: number;
  x1: number;
  base: number;
  h: number;
  bat: number;
  dx: number;
  dy: number;
}

interface EBoxG {
  b: EBox;
  top: number;
  deck: number;
  front: number[];
  side: number[];
  /** x of the front face at height y (left / right edges). */
  lx(y: number): number;
  rx(y: number): number;
  /** Point on the roof deck: u across the front (0..1), v back into the depth (0..1). */
  onDeck(u: number, v: number): Pt;
}

function eBoxG(b: EBox): EBoxG {
  const top = b.base - b.h;
  const lx = (y: number): number => b.x0 + (b.bat * (b.base - y)) / b.h;
  const rx = (y: number): number => b.x1 - (b.bat * (b.base - y)) / b.h;
  return {
    b,
    top,
    deck: top - 6,
    front: [b.x0, b.base, b.x1, b.base, b.x1 - b.bat, top, b.x0 + b.bat, top],
    side: [
      b.x0,
      b.base,
      b.x0 + b.bat,
      top,
      b.x0 + b.bat - b.dx,
      top - b.dy,
      b.x0 - b.dx,
      b.base - b.dy,
    ],
    lx,
    rx,
    onDeck(u: number, v: number): Pt {
      const L = b.x0 + b.bat;
      const R = b.x1 - b.bat;
      return [L + (R - L) * u - b.dx * v, this.deck - b.dy * v];
    },
  };
}

/** Hieroglyph columns: suns, water, birds, ankhs, eyes and reeds. */
function glyphs(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  rnd: Rnd,
  cw = 5,
): void {
  const p = new Path2D();
  const f = new Path2D();
  for (let gx = x + cw / 2; gx < x + w - 1; gx += cw) {
    p.moveTo(gx + cw / 2, y);
    p.lineTo(gx + cw / 2, y + h);
    for (let gy = y + 2.5; gy < y + h - 2; gy += 4.6) {
      const k = Math.floor(rnd() * 7);
      switch (k) {
        case 0:
          f.moveTo(gx + 1.2, gy);
          f.arc(gx, gy, 1.2, 0, Math.PI * 2);
          break;
        case 1:
          p.moveTo(gx - 1.8, gy);
          p.lineTo(gx - 0.9, gy - 0.8);
          p.lineTo(gx, gy);
          p.lineTo(gx + 0.9, gy - 0.8);
          p.lineTo(gx + 1.8, gy);
          break;
        case 2:
          f.moveTo(gx - 1.6, gy + 1.2);
          f.lineTo(gx + 0.8, gy - 1.4);
          f.lineTo(gx + 1.8, gy - 1);
          f.lineTo(gx + 1, gy + 1.2);
          f.closePath();
          break;
        case 3:
          p.moveTo(gx + 0.8, gy - 1.2);
          p.arc(gx, gy - 1.2, 0.8, 0, Math.PI * 2);
          p.moveTo(gx, gy - 0.4);
          p.lineTo(gx, gy + 1.8);
          p.moveTo(gx - 1.2, gy + 0.3);
          p.lineTo(gx + 1.2, gy + 0.3);
          break;
        case 4:
          f.moveTo(gx + 1.8, gy);
          f.ellipse(gx, gy, 1.8, 0.8, 0, 0, Math.PI * 2);
          break;
        case 5:
          p.moveTo(gx, gy - 1.6);
          p.lineTo(gx, gy + 1.6);
          p.moveTo(gx, gy - 1.6);
          p.lineTo(gx + 1, gy - 0.6);
          break;
        default:
          f.moveTo(gx - 1.6, gy + 1);
          f.arc(gx, gy + 1, 1.6, Math.PI, 0);
          f.closePath();
      }
    }
  }
  stroke(c, 0.6, col, p);
  fillP(c, f, col);
}

/** Painted striding pharaoh in sunk relief (facing ±1). */
function pharaoh(c: Ctx, x: number, y: number, h: number, facing: number): void {
  const s = h / 30;
  c.save();
  c.translate(x, y);
  c.scale(facing * s, s);
  line(c, -1.2, -12, -4, 0, 2.6, EG.skin);
  line(c, 1.2, -12, 4.5, 0, 2.6, shade(EG.skin, 0.85));
  poly(c, [-3.2, -15, 3.2, -15, 4.2, -9, -3.6, -9], '#f2ead6');
  poly(c, [-2.6, -15, 2.6, -15, 2.2, -23, -2.2, -23], EG.skin);
  disc(c, 0.4, -25.4, 2.4, EG.skin);
  poly(c, [-2.2, -26.5, 2.6, -26.5, 3.4, -30, 0.4, -31.5, -2.6, -30], EG.blue);
  line(c, 2, -22, 6.5, -27.5, 1.6, EG.skin);
  line(c, 6.5, -27.5, 6.8, -31, 1, '#e8b830');
  line(c, -2, -22, -5, -17, 1.6, shade(EG.skin, 0.9));
  rect(c, -2.6, -22.5, 5.2, 1.6, '#e8b830');
  c.restore();
}

/** Red sun disc with spread gold-and-blue wings. */
function wingedDisk(c: Ctx, x: number, y: number, w: number): void {
  for (const s of [-1, 1]) {
    c.fillStyle = vgrad(c, y - 3, y + 3, '#e8b830', 1.2, 0.8);
    c.beginPath();
    c.moveTo(x + s * 2, y - 1.5);
    c.quadraticCurveTo(x + s * w * 0.3, y - 3.5, x + s * w * 0.5, y - 2);
    c.lineTo(x + s * w * 0.42, y + 2.4);
    c.quadraticCurveTo(x + s * w * 0.25, y + 1.2, x + s * 2, y + 2);
    c.closePath();
    c.fill();
    const fe = new Path2D();
    for (let k = 1; k < 6; k++) {
      const fx = x + (s * w * 0.5 * k) / 6;
      fe.moveTo(fx, y - 1.8);
      fe.lineTo(fx + s * 1.2, y + 1.8);
    }
    stroke(c, 0.6, EG.blue, fe);
  }
  disc(c, x, y, Math.max(2.4, w * 0.09), rgrad(c, x, y, w * 0.09, '#d8402a'));
}

/** Papyrus column with bindings and an open (bell) capital. */
function papyrusCol(c: Ctx, x: number, top: number, bot: number, w: number): void {
  const cap = w * 1.4;
  rect(
    c,
    x - w / 2,
    top + cap * 0.8,
    w,
    bot - top - cap * 0.8,
    hgrad(c, x - w / 2, x + w / 2, EG.sand, 1.2, 0.68),
  );
  for (let k = 0; k < 3; k++)
    line(
      c,
      x - w / 2,
      top + cap + 2 + k * 2,
      x + w / 2,
      top + cap + 2 + k * 2,
      0.9,
      k === 1 ? EG.red : EG.blue,
    );
  poly(
    c,
    [
      x - w * 0.45,
      top + cap,
      x + w * 0.45,
      top + cap,
      x + cap * 0.75,
      top + 2,
      x - cap * 0.75,
      top + 2,
    ],
    vgrad(c, top, top + cap, EG.green, 1.25, 0.8),
    INK,
    0.6,
  );
  const sp = new Path2D();
  for (const f of [-0.5, -0.17, 0.17, 0.5]) {
    sp.moveTo(x + f * w * 0.8, top + cap);
    sp.lineTo(x + f * cap * 1.3, top + 3);
  }
  stroke(c, 0.6, EG.blue, sp);
  rect(c, x - w * 0.55, top - 1, w * 1.1, 3.2, vgrad(c, top - 1, top + 2, EG.sand, 1.15, 0.8));
  rect(c, x - w / 2, bot - 2, w, 2, shade(EG.sand, 0.85));
}

function palm(c: Ctx, x: number, y: number, h: number, rnd: Rnd): void {
  const lean = h * 0.08;
  const tx = x + lean;
  const ty = y - h;
  // Segmented trunk.
  for (let k = 0; k < h / 4; k++) {
    const t = k / (h / 4);
    const px = x + lean * t;
    const py = y - k * 4;
    const w = 3.2 - t * 0.9;
    poly(
      c,
      [
        px - w,
        py,
        px + w,
        py,
        px + w * 0.9 + lean / (h / 4),
        py - 4.4,
        px - w * 0.9 + lean / (h / 4),
        py - 4.4,
      ],
      hgrad(c, px - w, px + w, EG.trunk, 1.25, 0.7),
    );
    line(c, px - w, py - 0.5, px + w, py - 1.6, 0.6, shade(EG.trunk, 0.6));
  }
  // Arching fronds all round the crown, then dates.
  const fronds: Array<[number, number]> = [];
  for (let k = 0; k < 9; k++)
    fronds.push([-Math.PI + (k / 8) * Math.PI + (rnd() - 0.5) * 0.2, 0.9 + rnd() * 0.25]);
  fronds.push([Math.PI * 0.18, 0.7], [Math.PI * 0.82, 0.7]);
  // Back fronds first (pointing up/back), darker.
  fronds.sort((a, b) => Math.sin(a[0]) - Math.sin(b[0]));
  for (const [a, f] of fronds) {
    const L = h * 0.36 * f;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ex = tx + ca * L;
    const ey = ty + sa * L * 0.35 + L * 0.42;
    const mx = tx + ca * L * 0.55;
    const my = ty + sa * L * 0.3 - L * 0.22;
    const col = sa < -0.3 ? shade(EG.palm, 0.8) : sa > 0.3 ? shade(EG.palm, 1.15) : EG.palm;
    const lf = new Path2D();
    for (let t = 0.12; t < 1; t += 0.07) {
      const qx = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * mx + t * t * ex;
      const qy = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * my + t * t * ey;
      const ll = 5.5 * (1 - t * 0.55);
      lf.moveTo(qx, qy);
      lf.lineTo(qx - ll * 0.45 + ca * 1.5, qy + ll);
      lf.moveTo(qx, qy);
      lf.lineTo(qx + ll * 0.45 + ca * 1.5, qy + ll * 0.9);
    }
    stroke(c, 1.5, shade(col, 0.7), lf);
    stroke(c, 0.8, col, lf);
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(mx, my, ex, ey);
    stroke(c, 1.3, '#3a5a20');
  }
  for (let k = 0; k < 6; k++)
    disc(c, tx - 2.5 + (k % 3) * 2.4, ty + 2.5 + Math.floor(k / 3) * 2, 1.3, '#c8702a');
}

function jar(c: Ctx, x: number, y: number, s: number, col = '#b8754a'): void {
  c.beginPath();
  c.moveTo(x - 2 * s, y);
  c.quadraticCurveTo(x - 5 * s, y - 5 * s, x - 2.4 * s, y - 9 * s);
  c.lineTo(x + 2.4 * s, y - 9 * s);
  c.quadraticCurveTo(x + 5 * s, y - 5 * s, x + 2 * s, y);
  c.closePath();
  c.fillStyle = hgrad(c, x - 5 * s, x + 5 * s, col, 1.3, 0.65);
  c.fill();
  stroke(c, 0.6, INK);
  rect(c, x - 2.6 * s, y - 10 * s, 5.2 * s, 1.4 * s, shade(col, 0.85));
  line(c, x - 3.8 * s, y - 5.5 * s, x + 3.8 * s, y - 5.5 * s, 0.7 * s, EG.blue);
}

/** Recumbent sphinx on a plinth (facing ±1). */
function sphinx(c: Ctx, x: number, y: number, s: number, facing: number): void {
  rect(c, x - 11 * s, y - 5 * s, 22 * s, 5 * s, vgrad(c, y - 5 * s, y, EG.sand, 1.1, 0.75));
  c.strokeStyle = INK;
  c.lineWidth = 0.6;
  c.strokeRect(x - 11 * s, y - 5 * s, 22 * s, 5 * s);
  c.save();
  c.translate(x, y - 5 * s);
  c.scale(facing * s, s);
  poly(
    c,
    [-9, 0, 6, 0, 10, -1, 10, -2.4, 5, -2.4, 3, -6, -6, -6.5, -9, -3],
    vgrad(c, -7, 0, '#e2c48a', 1.15, 0.8),
    INK,
    0.6,
  );
  poly(c, [2.6, -5.5, 2.4, -12, 6.4, -12.5, 7.2, -8, 6, -5.5], '#e2c48a', INK, 0.6);
  poly(c, [1.4, -6, 2, -12.8, 4.4, -14, 7.2, -12.6, 7, -9, 5, -10, 4.2, -6], EG.blue);
  line(c, 2.4, -11.5, 2.2, -6.5, 0.6, '#e8b830');
  line(c, -9, -2, -11, -4, 1, '#c8a46a');
  c.restore();
}

/** Tall rounded-top cowhide shield (team colour with white patches). */
function eShield(c: Ctx, x: number, y: number, h: number, team: string): void {
  const w = h * 0.55;
  c.beginPath();
  c.moveTo(x - w / 2, y + h / 2);
  c.lineTo(x - w / 2, y - h / 2 + w / 2);
  c.arc(x, y - h / 2 + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w / 2, y + h / 2);
  c.closePath();
  c.fillStyle = vgrad(c, y - h / 2, y + h / 2, team, 1.25, 0.75);
  c.fill();
  stroke(c, 1, '#5a3a1a');
  ell(c, x - w * 0.15, y - h * 0.05, w * 0.18, h * 0.1, 'rgba(250,245,230,0.85)');
  ell(c, x + w * 0.18, y + h * 0.22, w * 0.14, h * 0.08, 'rgba(250,245,230,0.85)');
  disc(c, x, y - h * 0.28, w * 0.12, '#e8b830');
}

/** Military standard: pole with a gilded fan carrying the team colour. */
function standard(c: Ctx, x: number, top: number, h: number, team: string): void {
  line(c, x, top + h, x, top + 6, 1.8, '#5a3e24');
  c.beginPath();
  c.moveTo(x, top + 8);
  c.arc(x, top + 8, 7, Math.PI * 1.05, Math.PI * 1.95);
  c.closePath();
  c.fillStyle = vgrad(c, top, top + 8, team, 1.25, 0.8);
  c.fill();
  stroke(c, 1, '#e8b830');
  line(c, x - 3, top + 11, x + 3, top + 11, 1.4, '#e8b830');
  line(c, x - 2, top + 13, x - 4, top + 20, 1, team);
  line(c, x + 2, top + 13, x + 4, top + 20, 1, team);
}

/** War chariot, side view, body in the team colour. */
function chariot(c: Ctx, x: number, y: number, s: number, team: string): void {
  line(c, x - 2 * s, y - 7 * s, x - 22 * s, y - 9 * s, 1.4 * s, '#7a5634');
  poly(
    c,
    [x - 3 * s, y - 6 * s, x + 7 * s, y - 6 * s, x + 8 * s, y - 15 * s, x + 2 * s, y - 15 * s],
    vgrad(c, y - 15 * s, y - 6 * s, team, 1.25, 0.75),
    INK,
    0.7,
  );
  line(c, x - 3 * s, y - 15 * s, x + 8 * s, y - 15 * s, 1.2, '#e8b830');
  wheel(c, x + 4 * s, y - 5 * s, 5 * s);
}

interface EOpts {
  mat: 'mud' | 'sandstone';
  col: string;
  crenel?: boolean;
  plain?: boolean;
}

/** Paint a battered block: lit side, front face, torus mouldings, cornice and roof deck. */
function eVolume(c: Ctx, b: EBox, o: EOpts, rnd: Rnd, deco?: (g: EBoxG) => void): EBoxG {
  const g = eBoxG(b);
  const tex = (x: number, y: number, w: number, h: number, col: string): void => {
    if (o.mat === 'sandstone') ashlar(c, x, y, w, h, col, 7, 14, rnd, 0.07);
    else {
      plaster(c, x, y, w, h, col, rnd);
      const br = new Path2D();
      for (let k = 0; k < (w * h) / 150; k++) {
        const bx = x + rnd() * w;
        const by = y + rnd() * h;
        br.rect(bx, by, 5, 2.4);
      }
      stroke(c, 0.6, 'rgba(120,80,40,0.38)', br);
    }
  };
  if (b.dx > 0) {
    clipped(c, g.side, () =>
      inFrame(c, [b.x0, g.top], [-b.dx, -b.dy], [0, 1], (lu) => {
        tex(-b.bat - 6, -6, lu + b.bat + 12, b.h + 12, shade(o.col, 1.06));
        rect(c, -b.bat - 6, -6, lu + b.bat + 12, b.h + 12, 'rgba(255,236,190,0.1)');
      }),
    );
    trace(c, g.side);
    stroke(c, 0.9, INK);
  }
  clipped(c, g.front, () => {
    tex(b.x0, g.top, b.x1 - b.x0, b.h, o.col);
    rect(c, b.x0, g.top, b.x1 - b.x0, b.h, ramp(c, g.top, b.base, '30,16,10', 0, 0.22));
    const ed = c.createLinearGradient(b.x1 - 16, 0, b.x1, 0);
    ed.addColorStop(0, 'rgba(30,16,10,0)');
    ed.addColorStop(1, 'rgba(30,16,10,0.22)');
    rect(c, b.x1 - 16, g.top, 16, b.h, ed);
  });
  trace(c, g.front);
  stroke(c, 0.9, INK);
  deco?.(g);
  // Torus mouldings on the corners and under the cornice.
  const torus = (x0: number, y0: number, x1: number, y1: number): void => {
    line(c, x0, y0, x1, y1, 2.6, shade(o.col, 0.8));
    line(c, x0, y0, x1, y1, 1.6, shade(o.col, 1.15));
    const n = Math.hypot(x1 - x0, y1 - y0) / 4;
    const p = new Path2D();
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      p.moveTo(px - 1.2, py - 1);
      p.lineTo(px + 1.2, py + 1);
    }
    stroke(c, 0.6, EG.red, p);
  };
  torus(b.x0 + 0.8, b.base, b.x0 + b.bat + 0.8, g.top);
  torus(b.x1 - 0.8, b.base, b.x1 - b.bat - 0.8, g.top);
  torus(b.x0 + b.bat, g.top + 0.5, b.x1 - b.bat, g.top + 0.5);
  const L = b.x0 + b.bat;
  const R = b.x1 - b.bat;
  const ch = o.plain ? 3 : 6;
  const roofDeck = (d: number, ins: number): void => {
    const dk = [L - ins, d, R + ins, d, R + ins - b.dx, d - b.dy, L - ins - b.dx, d - b.dy];
    poly(c, dk, vgrad(c, d - b.dy, d, shade(o.col, 1.12), 1.05, 0.92), INK, 0.8);
    if (b.dy > 6) {
      clipped(c, dk, () => {
        const st = new Path2D();
        for (let k = 0; k < (R - L) / 6; k++) {
          const sx = L + rnd() * (R - L) - rnd() * b.dx;
          const sy = d - 2 - rnd() * (b.dy - 3);
          st.moveTo(sx, sy);
          st.lineTo(sx + 4 + rnd() * 6, sy);
        }
        stroke(c, 0.7, 'rgba(120,80,40,0.25)', st);
        // Parapet shadow along the back and side.
        line(
          c,
          L - ins - b.dx + 1,
          d - b.dy + 1.5,
          R + ins - b.dx,
          d - b.dy + 1.5,
          2,
          'rgba(60,40,20,0.25)',
        );
      });
      // Roof hatch.
      const hx = R - 12 - b.dx * 0.5;
      const hy = d - b.dy * 0.5;
      poly(c, [hx - 4, hy + 2, hx + 4, hy + 2, hx + 2, hy - 2, hx - 6, hy - 2], '#3a2818');
    }
    line(c, L - ins + 1, d - 0.8, R + ins - 1, d - 0.8, 1.2, shade(o.col, 1.25));
  };
  if (o.crenel) {
    // Rounded crenellations (as on Nubian forts) along the front and side parapets.
    roofDeck(g.top - 3, 1);
    rect(c, L - 1, g.top - 3, R - L + 2, 3, vgrad(c, g.top - 3, g.top, o.col, 1.1, 0.85));
    const merlon = (x: number, y: number, col: string): void => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y - 3.5);
      c.arc(x + 2.5, y - 3.5, 2.5, Math.PI, 0);
      c.lineTo(x + 5, y);
      c.closePath();
      c.fill();
      stroke(c, 0.5, INK);
    };
    const n = Math.max(2, Math.round(Math.hypot(b.dx, b.dy) / 7));
    for (let k = n; k >= 1; k--)
      merlon(L - 1 - (b.dx * k) / n - 2.5, g.top - 3 - (b.dy * k) / n, shade(o.col, 1.1));
    for (let x = L; x < R - 3; x += 7) merlon(x, g.top - 3, shade(o.col, 1.02));
    g.deck = g.top - 3;
  } else {
    // Cavetto cornice with painted palm-leaf stripes, on the front and the sunlit side.
    const cor = [L - 1, g.top, R + 1, g.top, R + 4, g.top - ch, L - 4, g.top - ch];
    poly(c, cor, shade(o.col, 0.9));
    if (!o.plain)
      clipped(c, cor, () => {
        const cols = [EG.blue, EG.red, EG.green, EG.red];
        for (let x = L - 4, k = 0; x < R + 4; x += 3, k++) {
          rect(c, x, g.top - ch, 2.2, ch, cols[k % 4]!);
        }
        rect(
          c,
          L - 4,
          g.top - ch,
          R - L + 8,
          ch,
          ramp(c, g.top - ch, g.top, '255,240,200', 0.25, 0),
        );
      });
    rect(
      c,
      L - 5,
      g.top - ch - 1.6,
      R - L + 10,
      1.8,
      vgrad(c, g.top - ch - 2, g.top - ch, o.col, 1.2, 0.85),
    );
    if (b.dx > 0)
      poly(
        c,
        [
          L - 1,
          g.top,
          L - 1 - b.dx,
          g.top - b.dy,
          L - 5 - b.dx,
          g.top - b.dy - ch - 1.6,
          L - 5,
          g.top - ch - 1.6,
        ],
        shade(o.col, 1.12),
        INK,
        0.6,
      );
    trace(c, cor);
    stroke(c, 0.7, INK);
    g.deck = g.top - ch - 1.6;
  }
  // Roof deck seen from above.
  if (!o.crenel) roofDeck(g.deck, 5);
  return g;
}

function eTownHall(c: Ctx, team: string, rnd: Rnd): void {
  // Hypostyle hall behind the pylon: roof deck and clerestory.
  const hall = eVolume(
    c,
    { x0: 56, x1: 140, base: 200, h: 46, bat: 2, dx: 18, dy: 12 },
    { mat: 'sandstone', col: EG.sand },
    rnd,
    (g) => {
      for (let x = g.b.x0 + 8; x < g.b.x1 - 6; x += 12) {
        rect(c, x, g.top + 4, 6, 10, '#2a1c12');
        rect(c, x + 1, g.top + 5, 4, 9, glow(c, g.top + 5, g.top + 14));
        line(c, x + 3, g.top + 5, x + 3, g.top + 14, 0.6, '#6a4a2a');
      }
    },
  );
  void hall;
  // Central gate building.
  eVolume(
    c,
    { x0: 64, x1: 128, base: 238, h: 58, bat: 2, dx: 0, dy: 0 },
    { mat: 'sandstone', col: EG.sand },
    rnd,
    (g) => {
      glyphs(c, g.b.x0 + 4, g.top + 6, 14, 26, '#3a5a8a', rnd);
      glyphs(c, g.b.x1 - 18, g.top + 6, 14, 26, '#3a5a8a', rnd);
      rect(c, 82, 200, 28, 38, '#8a6a3e');
      rect(c, 85, 204, 22, 34, '#2a1c12');
      halo(c, 96, 226, 16, 0.55);
      plankDoor(c, 86, 206, 9.5, 32, '#7a5030', rnd);
      plankDoor(c, 96.5, 206, 9.5, 32, '#7a5030', rnd);
      rect(c, 80, 196, 32, 5, vgrad(c, 196, 201, EG.sand, 1.2, 0.8));
      wingedDisk(c, 96, 190, 34);
    },
  );
  // Pylon towers with reliefs, flagpole recesses and team pennants.
  for (const [x0, x1, face] of [
    [12, 68, 1],
    [124, 180, -1],
  ] as const) {
    const pg = eVolume(
      c,
      { x0, x1, base: 238, h: 92, bat: 8, dx: x0 < 96 ? 10 : 0, dy: x0 < 96 ? 7 : 0 },
      { mat: 'sandstone', col: EG.sand },
      rnd,
      (g) => {
        const cx = (g.b.x0 + g.b.x1) / 2;
        pharaoh(c, cx + face * 6, 222, 34, face);
        glyphs(c, cx - face * 10 - 6, 172, 12, 46, '#3a5a8a', rnd);
        rect(c, g.lx(160) + 2, 156, g.rx(160) - g.lx(160) - 4, 3, team);
      },
    );
    for (const px of [x0 + 14, x1 - 14]) {
      line(c, px, 240, px, 104, 2.2, '#6a4a2c');
      line(c, px - 0.7, 240, px - 0.7, 104, 0.6, '#a07a50');
      rect(c, px - 2, 140, 4, 2, '#e8b830');
      pennant(c, px - 0.6, 104, 16, team);
    }
    void pg;
  }
  jar(c, 74, 252, 1);
  jar(c, 120, 252, 1, '#a8643a');
}

function eHouse(c: Ctx, team: string, rnd: Rnd): void {
  const g = eVolume(
    c,
    { x0: 36, x1: 112, base: 176, h: 40, bat: 3, dx: 20, dy: 14 },
    { mat: 'mud', col: EG.plaster, plain: true },
    rnd,
    (g) => {
      const dx = g.b.x0 + (g.b.x1 - g.b.x0) * 0.6;
      rect(c, dx - 8, g.b.base - 22, 16, 22, EG.red);
      rect(c, dx - 6, g.b.base - 20, 12, 20, '#2a1c12');
      plankDoor(c, dx - 5.5, g.b.base - 19, 11, 19, '#8a6238', rnd);
      rect(c, dx - 10, g.b.base - 26, 20, 4, EG.blue);
      rect(c, dx - 10, g.b.base - 27.2, 20, 1.4, '#e8b830');
      for (const x of [g.b.x0 + 12, g.b.x0 + 26]) {
        rect(c, x - 4, g.top + 8, 8, 6, '#2a1c12');
        rect(c, x - 3, g.top + 9, 6, 4, glow(c, g.top + 9, g.top + 13));
        for (let k = 1; k < 3; k++)
          line(c, x - 3 + k * 2, g.top + 9, x - 3 + k * 2, g.top + 13, 0.6, '#5a3e24');
      }
      rect(c, g.b.x0 + 2, g.top + 2, g.b.x1 - g.b.x0 - 4, 2, team);
    },
  );
  // Roof terrace: striped linen awning, wind catcher and storage jars.
  const d = g.deck;
  const ax0 = 34;
  const ax1 = 66;
  for (const [x, y] of [
    [ax0, d - 2],
    [ax1, d - 2],
    [ax0 - 8, d - 11],
    [ax1 - 8, d - 11],
  ] as const)
    line(c, x, y, x, y - 14, 1.2, '#6a4a2c');
  for (let i = 0; i < 8; i++) {
    const x = ax0 + (i * (ax1 - ax0)) / 8;
    poly(
      c,
      [x, d - 16, x + (ax1 - ax0) / 8, d - 16, x - 8 + (ax1 - ax0) / 8, d - 25, x - 8, d - 25],
      i % 2 ? '#f2ead6' : team,
    );
  }
  trace(c, [ax0, d - 16, ax1, d - 16, ax1 - 8, d - 25, ax0 - 8, d - 25]);
  stroke(c, 0.7, INK);
  const wx = 92;
  rect(c, wx - 6, d - 22, 12, 18, hgrad(c, wx - 6, wx + 6, EG.plaster, 1.1, 0.8));
  poly(
    c,
    [wx - 7, d - 22, wx + 7, d - 22, wx + 4, d - 30, wx - 4, d - 30],
    shade(EG.plaster, 0.9),
    INK,
    0.6,
  );
  rect(c, wx - 4, d - 20, 8, 6, '#2a1c12');
  c.strokeStyle = INK;
  c.lineWidth = 0.7;
  c.strokeRect(wx - 6, d - 22, 12, 18);
  jar(c, 74, d - 4, 0.9);
  jar(c, 80, d - 6, 0.8, '#a8643a');
  // Steps up the side and a beehive bread oven.
  for (let i = 0; i < 5; i++)
    rect(
      c,
      112 + i * 0.5,
      176 - i * 7,
      8,
      3,
      vgrad(c, 176 - i * 7, 179 - i * 7, EG.mud, 1.15, 0.8),
    );
  c.fillStyle = rgrad(c, 116, 182, 8, '#b88a5a');
  c.beginPath();
  c.moveTo(108, 188);
  c.quadraticCurveTo(108, 176, 116, 176);
  c.quadraticCurveTo(124, 176, 124, 188);
  c.closePath();
  c.fill();
  stroke(c, 0.8, INK);
  disc(c, 116, 185, 2.4, '#ff9a3a');
  palm(c, 27, 188, 66, rnd);
}

function eStorehouse(c: Ctx, team: string, rnd: Rnd): void {
  // Beehive grain silos behind a battered courtyard wall.
  for (const [x, r, h] of [
    [34, 15, 38],
    [94, 15, 38],
    [64, 17, 46],
  ] as const) {
    const by = 162;
    c.fillStyle = hgrad(c, x - r, x + r, EG.plaster, 1.15, 0.72);
    c.beginPath();
    c.moveTo(x - r, by);
    c.lineTo(x - r, by - h * 0.45);
    c.quadraticCurveTo(x - r, by - h, x, by - h);
    c.quadraticCurveTo(x + r, by - h, x + r, by - h * 0.45);
    c.lineTo(x + r, by);
    c.closePath();
    c.fill();
    stroke(c, 0.9, INK);
    ell(c, x, by - h + 2, 3.4, 1.5, '#5a3e24');
    rect(c, x - 3, by - 12, 6, 8, '#3a2818');
    line(c, x - r + 2, by - h * 0.55, x + r - 2, by - h * 0.55, 0.6, 'rgba(120,90,50,0.4)');
  }
  // Ladder against the tall silo.
  line(c, 76, 162, 70, 120, 1.4, '#8a6238');
  line(c, 82, 162, 76, 120, 1.4, '#8a6238');
  for (let y = 158; y > 122; y -= 6)
    line(c, 76 - (162 - y) * 0.14, y, 82 - (162 - y) * 0.14, y, 1, '#a07a50');
  eVolume(
    c,
    { x0: 8, x1: 120, base: 178, h: 20, bat: 2, dx: 0, dy: 0 },
    { mat: 'mud', col: EG.mud, plain: true },
    rnd,
    (g) => {
      rect(c, 54, 160, 20, 18, '#3a2818');
      rect(c, 56, 162, 16, 16, vgrad(c, 162, 178, '#a8843e', 1.1, 0.7));
      rect(c, g.b.x0 + 4, g.top + 4, 30, 2, team);
      rect(c, g.b.x1 - 34, g.top + 4, 30, 2, team);
    },
  );
  for (const [x, y, s] of [
    [24, 190, 1],
    [34, 191, 0.9],
    [100, 190, 1],
  ] as const)
    sack(c, x, y, s, '#d9c48c');
  ell(c, 64, 188, 9, 2.6, '#d8b450');
  jar(c, 112, 190, 0.9);
  line(c, 122, 192, 122, 112, 1.8, '#6a4a2c');
  pennant(c, 121.4, 112, 16, team);
}

function eBarracks(c: Ctx, team: string, rnd: Rnd): void {
  const g = eVolume(
    c,
    { x0: 44, x1: 150, base: 222, h: 52, bat: 5, dx: 26, dy: 18 },
    { mat: 'mud', col: EG.mud, crenel: true },
    rnd,
    (g) => {
      rect(c, 84, 194, 26, 28, '#7a5a34');
      rect(c, 87, 197, 20, 25, '#2a1c12');
      plankDoor(c, 88, 198, 18, 24, '#8a6238', rnd);
      rect(c, 82, 190, 30, 4, EG.blue);
      for (const x of [58, 70, 124, 136]) eShield(c, x, g.top + 26, 16, team);
      for (const x of [64, 130]) rect(c, x - 1, g.top + 6, 2, 9, '#2a1c12');
      // Projecting palm-log beam ends.
      for (let x = g.lx(g.top + 3) + 3; x < g.rx(g.top + 3) - 2; x += 8)
        disc(c, x, g.top + 3, 1.6, '#7a5634');
    },
  );
  void g;
  // Rooftop lookout shelter in team colours.
  {
    const [ax, ay] = g.onDeck(0.12, 0.25);
    for (const [px, py] of [
      [ax, ay],
      [ax + 22, ay],
      [ax - 8, ay - 9],
      [ax + 14, ay - 9],
    ] as const)
      line(c, px, py, px, py - 11, 1.2, '#6a4a2c');
    for (let i = 0; i < 6; i++) {
      const x = ax + (i * 22) / 6;
      poly(
        c,
        [x, ay - 11, x + 22 / 6, ay - 11, x + 22 / 6 - 8, ay - 20, x - 8, ay - 20],
        i % 2 ? '#f2ead6' : team,
      );
    }
    trace(c, [ax, ay - 11, ax + 22, ay - 11, ax + 14, ay - 20, ax - 8, ay - 20]);
    stroke(c, 0.7, INK);
    jar(c, ...g.onDeck(0.7, 0.4), 0.8);
    jar(c, ...g.onDeck(0.76, 0.3), 0.7, '#a8643a');
  }
  // Training yard: archery target, spear rack and standards.
  ell(c, 172, 236, 18, 9, 'rgba(230,205,150,0.55)');
  line(c, 166, 250, 168, 232, 1.6, '#5a3e24');
  line(c, 178, 250, 176, 232, 1.6, '#5a3e24');
  disc(c, 172, 230, 8, '#d8bd6a');
  disc(c, 172, 230, 5.4, EG.red);
  disc(c, 172, 230, 3, '#f0e6cc');
  line(c, 154, 214, 154, 246, 1.8, '#6a4a2c');
  line(c, 154, 220, 160, 220, 1.6, '#6a4a2c');
  for (let i = 0; i < 4; i++) {
    const x = 156 + i * 4;
    line(c, x, 248, x + 1, 198, 1.2, '#9a7048');
    poly(c, [x + 1.2, 192, x - 0.2, 199, x + 2.4, 199], '#d6c49a', INK, 0.4);
  }
  standard(c, 32, 150, 100, team);
  standard(c, 181, 160, 92, team);
  jar(c, 22, 252, 1);
  eShield(c, 40, 244, 14, team);
}

function eStable(c: Ctx, team: string, rnd: Rnd): void {
  const g = eVolume(
    c,
    { x0: 42, x1: 130, base: 206, h: 40, bat: 3, dx: 24, dy: 16 },
    { mat: 'mud', col: EG.mud, plain: true },
    rnd,
    (g) => {
      // Portico of palm-trunk posts in front of the dark stalls.
      rect(
        c,
        g.b.x0 + 6,
        g.top + 6,
        g.b.x1 - g.b.x0 - 12,
        g.b.h - 6,
        vgrad(c, g.top, g.b.base, '#3a2818', 1.1, 0.8),
      );
      c.save();
      c.beginPath();
      c.rect(g.b.x0 + 6, g.top + 6, g.b.x1 - g.b.x0 - 12, g.b.h - 6);
      c.clip();
      horse(c, 72, g.b.base + 4, 1, '#7a4e2e', -1);
      horse(c, 104, g.b.base + 4, 1, '#d8ccb8', -1);
      c.restore();
      for (let x = g.b.x0 + 8; x <= g.b.x1 - 6; x += 20) {
        rect(c, x - 2.5, g.top + 4, 5, g.b.h - 4, hgrad(c, x - 2.5, x + 2.5, EG.trunk, 1.25, 0.7));
        const p = new Path2D();
        for (let y = g.top + 6; y < g.b.base; y += 3) {
          p.moveTo(x - 2.5, y);
          p.lineTo(x + 2.5, y + 1.2);
        }
        stroke(c, 0.5, shade(EG.trunk, 0.6), p);
      }
      rect(c, g.b.x0 + 4, g.top + 2, g.b.x1 - g.b.x0 - 8, 3, team);
    },
  );
  void g;
  // Fodder bundles drying on the roof.
  for (const [u, v] of [
    [0.2, 0.35],
    [0.34, 0.5],
    [0.62, 0.3],
  ] as const)
    hay(c, ...g.onDeck(u, v), 12);
  chariot(c, 168, 236, 1.3, team);
  trough(c, 140, 250, 18);
  hay(c, 60, 236, 14);
  sack(c, 76, 238, 0.9, '#d9c48c');
  palm(c, 26, 222, 60, rnd);
  standard(c, 181, 150, 90, team);
}

function eWorkshop(c: Ctx, team: string, rnd: Rnd): void {
  const g = eVolume(
    c,
    { x0: 46, x1: 130, base: 210, h: 42, bat: 3, dx: 24, dy: 16 },
    { mat: 'mud', col: EG.mud, plain: true },
    rnd,
    (g) => {
      rect(c, 76, 186, 22, 24, '#2a1c12');
      halo(c, 87, 200, 14, 0.4, '255,150,60');
      rect(c, 74, 182, 26, 4, EG.blue);
      glyphs(c, g.b.x0 + 8, g.top + 8, 18, 22, '#6a4a2a', rnd);
    },
  );
  void g;
  for (let k = 0; k < 4; k++)
    jar(c, ...g.onDeck(0.15 + k * 0.1, 0.45), 0.7, k % 2 ? '#a8643a' : '#c07a4a');
  for (let k = 0; k < 3; k++) {
    const [rx, ry] = g.onDeck(0.68, 0.25 + k * 0.2);
    rect(c, rx - 8, ry - 3, 16, 3, vgrad(c, ry - 3, ry, '#c8b060', 1.2, 0.8));
    line(c, rx - 4, ry - 3, rx - 4, ry, 0.8, '#7a6030');
    line(c, rx + 4, ry - 3, rx + 4, ry, 0.8, '#7a6030');
  }
  // Linen awning in team colours over the work yard.
  const ax0 = 98;
  const ax1 = 168;
  for (const x of [ax0 + 2, ax1 - 2]) line(c, x, 238, x, 206, 1.6, '#6a4a2c');
  for (let i = 0; i < 7; i++) {
    const x = ax0 + (i * (ax1 - ax0)) / 7;
    poly(
      c,
      [x, 206, x + (ax1 - ax0) / 7, 206, x + (ax1 - ax0) / 7 - 6, 196, x - 6, 196],
      i % 2 ? '#f2ead6' : team,
    );
  }
  trace(c, [ax0, 206, ax1, 206, ax1 - 6, 196, ax0 - 6, 196]);
  stroke(c, 0.7, INK);
  // Unfinished sphinx on a sledge, dressed blocks and a kiln.
  rect(c, 112, 244, 46, 3, '#7a5634');
  line(c, 110, 247, 160, 247, 1.6, '#5a3e24');
  sphinx(c, 136, 244, 1.6, 1);
  line(c, 112, 245, 96, 252, 0.9, '#d8c385');
  for (let k = 0; k < 3; k++) {
    const y = 252 - k * 7;
    rect(c, 20 + (k % 2) * 3, y - 7, 18, 7, vgrad(c, y - 7, y, EG.sand, 1.15, 0.8));
    c.strokeStyle = INK;
    c.lineWidth = 0.7;
    c.strokeRect(20 + (k % 2) * 3, y - 7, 18, 7);
  }
  const kx = 176;
  const ky = 250;
  poly(
    c,
    [kx - 9, ky, kx - 7, ky - 22, kx + 7, ky - 22, kx + 9, ky],
    hgrad(c, kx - 9, kx + 9, '#a8744a'),
    INK,
    0.8,
  );
  c.fillStyle = glow(c, ky - 6, ky);
  c.beginPath();
  c.arc(kx, ky, 4, Math.PI, 0);
  c.fill();
  halo(c, kx, ky - 3, 10, 0.5, '255,140,50');
  ell(c, kx, ky - 22, 7, 2, '#3a2818');
  jar(c, 62, 252, 0.9);
  jar(c, 70, 254, 0.8, '#a8643a');
}

function eTower(c: Ctx, team: string, rnd: Rnd): void {
  const g = eVolume(
    c,
    { x0: 40, x1: 96, base: 178, h: 112, bat: 7, dx: 16, dy: 11 },
    { mat: 'mud', col: EG.mud, crenel: true },
    rnd,
    (g) => {
      for (const y of [g.top + 14, g.top + 50, g.top + 84]) {
        const cx = (g.lx(y) + g.rx(y)) / 2;
        rect(c, cx - 1.6, y, 3.2, 12, '#2a1c12');
      }
      rect(c, 62, 156, 12, 22, '#2a1c12');
      plankDoor(c, 63, 158, 10, 20, '#8a6238', rnd);
      rect(c, 60, 152, 16, 4, EG.blue);
      for (let x = g.lx(g.top + 5) + 3; x < g.rx(g.top + 5) - 2; x += 7)
        disc(c, x, g.top + 5, 1.6, '#7a5634');
      rect(c, g.lx(g.top + 22), g.top + 22, g.rx(g.top + 22) - g.lx(g.top + 22), 2.6, team);
    },
  );
  line(c, 60, g.deck - 4, 60, 10, 1.8, '#6a4a2c');
  pennant(c, 59.4, 10, 18, team);
  jar(c, 106, 186, 0.9);
  palm(c, 17, 186, 42, rnd);
}

function eTemple(c: Ctx, team: string, rnd: Rnd): void {
  const g = eVolume(
    c,
    { x0: 18, x1: 174, base: 234, h: 84, bat: 4, dx: 14, dy: 10 },
    { mat: 'sandstone', col: EG.sand },
    rnd,
    (g) => {
      // Columned facade: dark pronaos, papyrus columns and relief-carved screen walls.
      rect(
        c,
        g.lx(g.top + 12),
        g.top + 12,
        g.rx(g.top + 12) - g.lx(g.top + 12),
        g.b.h - 12,
        vgrad(c, g.top, g.b.base, '#3a2618', 1.1, 0.75),
      );
      halo(c, 96, 214, 26, 0.6);
      rect(c, 88, 200, 16, 34, '#2a1c12');
      rect(c, 90, 202, 12, 32, glow(c, 202, 234));
      const cols = [30, 54, 78, 114, 138, 162];
      cols.forEach((x, i) => {
        if (i < cols.length - 1 && i !== 2) {
          const nx = cols[i + 1]!;
          rect(c, x + 4, 208, nx - x - 8, 26, vgrad(c, 208, 234, EG.sand, 1.1, 0.85));
          pharaoh(c, (x + nx) / 2 + (i < 2 ? -3 : 3), 233, 22, i < 2 ? 1 : -1);
          rect(c, x + 4, 206, nx - x - 8, 3, EG.blue);
        }
        papyrusCol(c, x, g.top + 14, g.b.base, 8);
      });
      rect(
        c,
        g.lx(g.top + 4),
        g.top + 4,
        g.rx(g.top + 4) - g.lx(g.top + 4),
        8,
        vgrad(c, g.top + 4, g.top + 12, EG.sand, 1.15, 0.85),
      );
      wingedDisk(c, 96, g.top + 8, 52);
      glyphs(c, 24, g.top + 4, 40, 7, '#3a5a8a', rnd, 4);
      glyphs(c, 128, g.top + 4, 40, 7, '#3a5a8a', rnd, 4);
    },
  );
  void g;
  for (const x of [23, 184]) {
    line(c, x, 238, x, 112, 2.2, '#6a4a2c');
    pennant(c, x - 0.6, 112, 18, team);
  }
  sphinx(c, 30, 252, 1.1, 1);
  sphinx(c, 162, 252, 1.1, -1);
}

function eMonument(c: Ctx, team: string, rnd: Rnd): void {
  const cx = 64;
  // Stepped pedestal.
  rect(c, 30, 168, 68, 10, vgrad(c, 168, 178, EG.sand, 1.1, 0.75));
  rect(c, 37, 156, 54, 12, vgrad(c, 156, 168, EG.sand, 1.15, 0.8));
  rect(c, 37, 160, 54, 3, team);
  glyphs(c, 39, 163, 50, 5, '#3a5a8a', rnd, 4);
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.strokeRect(30, 168, 68, 10);
  c.strokeRect(37, 156, 54, 12);
  // Obelisk: sunlit and shaded faces, carved column of glyphs, gilded pyramidion.
  const by = 156;
  const ty = 30;
  poly(c, [cx - 11, by, cx, by, cx, ty, cx - 7, ty], hgrad(c, cx - 11, cx, EG.sand, 1.2, 0.95));
  poly(
    c,
    [cx, by, cx + 11, by, cx + 7, ty, cx, ty],
    hgrad(c, cx, cx + 11, shade(EG.sand, 0.82), 1, 0.8),
  );
  trace(c, [cx - 11, by, cx + 11, by, cx + 7, ty, cx - 7, ty]);
  stroke(c, 0.9, INK);
  glyphs(c, cx - 7.5, ty + 10, 6, by - ty - 18, '#6a4a2a', rnd, 5.5);
  glyphs(c, cx + 1.5, ty + 10, 5, by - ty - 18, 'rgba(70,45,25,0.7)', rnd, 4.5);
  poly(c, [cx - 7, ty, cx, ty - 16, cx, ty], vgrad(c, ty - 16, ty, GOLD, 1.35, 0.85));
  poly(c, [cx, ty, cx, ty - 16, cx + 7, ty], shade(GOLD, 0.75));
  trace(c, [cx - 7, ty, cx, ty - 16, cx + 7, ty]);
  stroke(c, 0.8, INK);
  halo(c, cx - 2, ty - 8, 10, 0.4, '255,240,180');
  // Sphinx guardians, offering braziers and team pennants.
  sphinx(c, 16, 190, 0.85, 1);
  sphinx(c, 112, 190, 0.85, -1);
  for (const x of [26, 102]) {
    line(c, x, 176, x, 164, 1.2, '#7a5634');
    poly(c, [x - 4, 164, x + 4, 164, x + 2.5, 160, x - 2.5, 160], '#b3803e', INK, 0.5);
    halo(c, x, 156, 8, 0.45);
    flame(c, x, 161, 6);
  }
  for (const x of [19, 120]) {
    line(c, x, 182, x, 112, 1.6, '#6a4a2c');
    pennant(c, x - 0.5, 112, 14, team);
  }
}

// ───────────────────────── farm ─────────────────────────

type Crop = 'ripe' | 'young' | 'stubble' | 'vine' | 'flax';

function crops(c: Ctx, x: number, y: number, w: number, h: number, kind: Crop, rnd: Rnd): void {
  const rowH = kind === 'vine' ? 10 : 6.5;
  // Furrows: dark troughs and sunlit ridges.
  const dark = new Path2D();
  const lite = new Path2D();
  for (let ry = y + 3; ry < y + h; ry += rowH) {
    dark.moveTo(x, ry + 2.2);
    dark.lineTo(x + w, ry + 2.2);
    lite.moveTo(x, ry);
    lite.lineTo(x + w, ry);
  }
  stroke(c, 2.2, 'rgba(60,40,20,0.55)', dark);
  stroke(c, 1, 'rgba(200,160,110,0.35)', lite);
  const a = new Path2D();
  const b = new Path2D();
  const d = new Path2D();
  for (let ry = y + 7; ry < y + h - 1; ry += rowH) {
    for (let cx = x + 2 + rnd() * 2; cx < x + w - 2; cx += kind === 'vine' ? 9 : 3.4) {
      const sway = (rnd() - 0.3) * 1.6;
      switch (kind) {
        case 'ripe': {
          const t = 6.5 + rnd() * 2.5;
          a.moveTo(cx, ry + 1);
          a.lineTo(cx + sway, ry - t);
          b.moveTo(cx + sway + 1, ry - t);
          b.ellipse(cx + sway, ry - t, 1, 2.2, 0.2, 0, Math.PI * 2);
          d.moveTo(cx + sway, ry - t - 2);
          d.lineTo(cx + sway + 1.2, ry - t - 4.4);
          break;
        }
        case 'young':
          if (rnd() < 0.3) break;
          a.moveTo(cx, ry + 1);
          a.lineTo(cx - 1.6, ry - 2.6);
          a.moveTo(cx, ry + 1);
          a.lineTo(cx + 1.7, ry - 2.4);
          b.moveTo(cx, ry + 1);
          b.lineTo(cx + 0.2, ry - 3.4);
          break;
        case 'stubble':
          a.moveTo(cx, ry + 0.5);
          a.lineTo(cx + sway * 0.4, ry - 1.6);
          break;
        case 'flax':
          a.moveTo(cx, ry + 1);
          a.lineTo(cx + sway, ry - 6);
          if (rnd() < 0.5) {
            b.moveTo(cx + sway + 1, ry - 6.5);
            b.arc(cx + sway, ry - 6.5, 1, 0, Math.PI * 2);
          }
          break;
        case 'vine': {
          a.moveTo(cx, ry + 1);
          a.lineTo(cx, ry - 7);
          for (let k = 0; k < 3; k++) {
            const lx = cx - 3 + k * 3 + rnd();
            const ly = ry - 6 + rnd() * 2;
            b.moveTo(lx + 2.6, ly);
            b.arc(lx, ly, 2.6, 0, Math.PI * 2);
          }
          if (rnd() < 0.7) {
            const gx = cx + (rnd() - 0.5) * 4;
            for (let k = 0; k < 4; k++) {
              d.moveTo(gx + (k % 2) * 1.4 + 0.8, ry - 3 + Math.floor(k / 2) * 1.4);
              d.arc(gx + (k % 2) * 1.4, ry - 3 + Math.floor(k / 2) * 1.4, 0.8, 0, Math.PI * 2);
            }
          }
          break;
        }
      }
    }
    if (kind === 'vine') {
      // Training wire between the stakes.
      a.moveTo(x, ry - 6);
      a.lineTo(x + w, ry - 6);
    }
  }
  switch (kind) {
    case 'ripe':
      stroke(c, 1.1, '#b8932e', a);
      fillP(c, b, '#ead070');
      stroke(c, 0.5, '#d8b850', d);
      break;
    case 'young':
      stroke(c, 1.2, '#78ad42', a);
      stroke(c, 1.1, '#9ccc5c', b);
      break;
    case 'stubble':
      stroke(c, 0.9, '#c8a858', a);
      break;
    case 'flax':
      stroke(c, 1, '#6e9a3e', a);
      fillP(c, b, '#7ea0e8');
      break;
    case 'vine':
      stroke(c, 1, '#6a4a2c', a);
      fillP(c, b, '#5f8f34');
      fillP(c, d, '#6a2a5e');
      break;
  }
}

function stook(c: Ctx, x: number, y: number): void {
  poly(c, [x - 5, y, x, y - 10, x + 5, y], vgrad(c, y - 10, y, '#e2c25a', 1.15, 0.75), INK, 0.7);
  const p = new Path2D();
  for (const dx of [-3, -1, 1, 3]) {
    p.moveTo(x, y - 9);
    p.lineTo(x + dx, y);
  }
  stroke(c, 0.5, '#a8872e', p);
  line(c, x - 2.6, y - 5, x + 2.6, y - 5, 1, '#8a6a22');
}

function farm(c: Ctx, W: number, OH: number, fid: FactionDef['id'], team: string, rnd: Rnd): void {
  const x0 = 5;
  const y0 = OH + 5;
  const x1 = W - 5;
  const y1 = OH + W - 5;
  const soil = fid === 'sahrun' ? '#8e6c3c' : fid === 'aurelian' ? '#8c6640' : '#7a5836';
  c.fillStyle = vgrad(c, y0, y1, soil, 1.1, 0.85);
  c.beginPath();
  c.roundRect(x0, y0, x1 - x0, y1 - y0, 6);
  c.fill();
  const mx = Math.round(W * 0.5);
  const my = Math.round(OH + W * 0.5);
  const right: [Crop, Crop] =
    fid === 'aurelian'
      ? ['vine', 'stubble']
      : fid === 'sahrun'
        ? ['young', 'flax']
        : ['young', 'stubble'];
  const plots: Array<[number, number, number, number, Crop]> = [
    [x0 + 4, y0 + 4, mx - x0 - 6, y1 - y0 - 8, 'ripe'],
    [mx + 2, y0 + 4, x1 - mx - 6, my - y0 - 5, right[0]],
    [mx + 2, my + 2, x1 - mx - 6, y1 - my - 6, right[1]],
  ];
  for (const [px, py, pw, ph, kind] of plots) {
    c.save();
    c.beginPath();
    c.rect(px, py, pw, ph);
    c.clip();
    rect(c, px, py, pw, ph, shade(soil, 0.95 + rnd() * 0.1));
    crops(c, px, py, pw, ph, kind, rnd);
    c.restore();
  }
  // Grassy balks between plots.
  line(c, mx, y0 + 3, mx, y1 - 3, 2.4, '#6a8a3a');
  line(c, mx + 1, my, x1 - 3, my, 2.4, '#6a8a3a');
  if (right[1] === 'stubble') {
    stook(c, mx + 14, my + 22);
    stook(c, mx + 30, my + 38);
    stook(c, mx + 44, my + 20);
  }
  // Boundary: wattle fence, dry-stone wall or irrigation dike with a canal.
  if (fid === 'hrimfolk') {
    c.strokeStyle = '#6e5232';
    c.lineWidth = 2.6;
    c.setLineDash([3, 1.5]);
    c.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    c.setLineDash([]);
    for (let px = x0 + 1; px <= x1; px += 12) {
      disc(c, px, y0 + 1, 1.6, '#4a3424');
      disc(c, px, y1 - 1, 1.6, '#4a3424');
    }
  } else if (fid === 'aurelian') {
    const pts = [x0 + 2, y0 + 3, x1 - 2, y0 + 3, x1 - 2, y1 - 1, x0 + 2, y1 - 1, x0 + 2, y0 + 3];
    footing(c, pts, rnd, '#b0aa9c', 3);
  } else {
    c.strokeStyle = '#b08a56';
    c.lineWidth = 3;
    c.strokeRect(x0 + 1.5, y0 + 1.5, x1 - x0 - 3, y1 - y0 - 3);
    rect(c, x0 + 1, y0 + 1, x1 - x0 - 2, 5, '#3f7fa8');
    line(c, x0 + 4, y0 + 2.6, x1 - 8, y0 + 2.6, 0.7, '#bfe4f4');
    tufts(c, x0 + 12, y0 + 7, 4, 10, rnd, '#4a7a2c');
    tufts(c, x1 - 14, y0 + 7, 4, 10, rnd, '#4a7a2c');
  }
  // Scarecrow in the team's colours.
  const sx = W * 0.76;
  const sy = OH + W * 0.42;
  line(c, sx, sy + 12, sx, sy - 10, 2, '#6a4a2c');
  line(c, sx - 9, sy - 4, sx + 9, sy - 4, 1.8, '#6a4a2c');
  poly(
    c,
    [sx - 5, sy - 5, sx + 5, sy - 5, sx + 6.5, sy + 5, sx - 6.5, sy + 5],
    vgrad(c, sy - 5, sy + 5, team, 1.2, 0.75),
    INK,
    0.7,
  );
  disc(c, sx, sy - 9, 3.2, '#e2c25a');
  poly(c, [sx - 5.5, sy - 10, sx, sy - 15, sx + 5.5, sy - 10], '#a8823e', INK, 0.6);
  line(c, sx - 9, sy - 4, sx - 10.5, sy - 1, 1, '#e2c25a');
  line(c, sx + 9, sy - 4, sx + 10.5, sy - 1, 1, '#e2c25a');
}

// ───────────────────────── entry points ─────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const EARTH: Record<FactionDef['id'], string> = {
  hrimfolk: '#7c5e3c',
  aurelian: '#a08660',
  sahrun: '#c4a46a',
};
const PAVE: Record<FactionDef['id'], string> = {
  hrimfolk: '#8e8a80',
  aurelian: '#d8d0bc',
  sahrun: '#d6bc84',
};

/** Draw one building body; returns the x positions of its doors (for worn ground paths). */
function body(c: Ctx, def: BuildingDef, f: FactionDef, team: string, rnd: Rnd): number[] {
  const W = def.size * TILE_PX;
  const st = f.style;
  const a = def.art;
  if (f.id === 'aurelian') {
    if (a === 'hall') gTownHall(c, team, rnd);
    else if (a === 'house') gHouse(c, team, rnd);
    else if (a === 'storehouse') gStorehouse(c, team, rnd);
    else if (a === 'barracks') gBarracks(c, team, rnd);
    else if (a === 'stable') gStable(c, team, rnd);
    else if (a === 'workshop') gWorkshop(c, team, rnd);
    else if (a === 'tower') gTower(c, team, rnd);
    else if (a === 'temple') gTemple(c, team, rnd);
    else if (a === 'shrine') gShrine(c, team, rnd);
    else eMonument(c, team, rnd);
    return DOORS.aurelian[a] ?? [W / 2];
  }
  if (f.id === 'sahrun') {
    if (a === 'hall') eTownHall(c, team, rnd);
    else if (a === 'house') eHouse(c, team, rnd);
    else if (a === 'storehouse') eStorehouse(c, team, rnd);
    else if (a === 'barracks') eBarracks(c, team, rnd);
    else if (a === 'stable') eStable(c, team, rnd);
    else if (a === 'workshop') eWorkshop(c, team, rnd);
    else if (a === 'tower') eTower(c, team, rnd);
    else if (a === 'temple') eTemple(c, team, rnd);
    else if (a === 'monument') eMonument(c, team, rnd);
    else gShrine(c, team, rnd);
    return DOORS.sahrun[a] ?? [W / 2];
  }
  if (a === 'hall') nTownHall(c, team, rnd);
  else if (a === 'house') nHouse(c, team, rnd);
  else if (a === 'storehouse') nStorehouse(c, st, team, rnd);
  else if (a === 'barracks') nBarracks(c, team, rnd);
  else if (a === 'stable') nStable(c, team, rnd);
  else if (a === 'workshop') nWorkshop(c, team, rnd);
  else if (a === 'tower') nTower(c, team, rnd);
  else if (a === 'temple') nTemple(c, team, rnd);
  else if (a === 'shrine') gShrine(c, team, rnd);
  else eMonument(c, team, rnd);
  return DOORS.hrimfolk[a] ?? [W / 2];
}

/** Door x positions per faction and art kind (where the worn paths lead). */
const DOORS: Record<FactionDef['id'], Partial<Record<BuildingDef['art'], number[]>>> = {
  hrimfolk: {
    hall: [113],
    house: [88],
    storehouse: [78],
    barracks: [96],
    stable: [82],
    workshop: [98],
    tower: [61],
    temple: [96],
  },
  aurelian: {
    hall: [112],
    house: [83],
    storehouse: [80],
    barracks: [98],
    stable: [86],
    workshop: [96],
    tower: [73],
    temple: [96],
    shrine: [64],
  },
  sahrun: {
    hall: [96],
    house: [82],
    storehouse: [64],
    barracks: [97],
    stable: [86],
    workshop: [87],
    tower: [68],
    temple: [96],
    monument: [64],
  },
};

/**
 * Draw a building at ART_RES. Canvas = footprint plus BUILDING_OVERHANG tiles above. The footprint
 * top-left is at (0, overhang) in world pixels (multiply by ART_RES for texture pixels).
 */
export function drawBuilding(def: BuildingDef, f: FactionDef, team: string): HTMLCanvasElement {
  const W = def.size * TILE_PX;
  const OH = Math.round(BUILDING_OVERHANG * TILE_PX);
  const H = W + OH;
  // Body (outlined) and ground layer are drawn separately so the outline skips the ground.
  const [bodyCv, c] = createSoftCanvas(W * ART_RES, H * ART_RES);
  c.scale(ART_RES, ART_RES);
  const rnd = seeded(hash(`${f.id}:${def.id}`));
  const [out, oc] = createSoftCanvas(W * ART_RES, H * ART_RES);
  oc.scale(ART_RES, ART_RES);
  if (def.art === 'farm') farm(c, W, OH, f.id, team, rnd);
  else {
    const doors = body(c, def, f, team, rnd);
    ground(oc, W, OH, { doors, earth: EARTH[f.id], paved: PAVE[f.id] }, seeded(hash(def.id)));
    softShadow(oc, W * 0.55, OH + W * 0.8, W * 0.46, W * 0.14, 0.26);
  }
  oc.setTransform(1, 0, 0, 1, 0, 0);
  if (def.art !== 'farm') sunlight(bodyCv, (OH + W * 0.9) * ART_RES, 3.5, true);
  oc.drawImage(outlined(bodyCv, 3), 0, 0);
  bodies.set(out, bodyCv);
  return out;
}

const bodies = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/**
 * Cast shadow for a building canvas from `drawBuilding` (same top-left origin), or null for flat
 * buildings. The building is treated as standing on the front edge of its footprint.
 */
export function buildingShadow(
  def: BuildingDef,
  building: HTMLCanvasElement,
): HTMLCanvasElement | null {
  const b = bodies.get(building);
  if (!b || def.art === 'farm') return null;
  const W = def.size * TILE_PX;
  const OH = Math.round(BUILDING_OVERHANG * TILE_PX);
  return castShadow(b, (OH + W * 0.9) * ART_RES, 0.34);
}

/** Construction site: staked outline, timber frame, ropes and material piles (drawn at ART_RES). */
export function drawFoundation(size: number): HTMLCanvasElement {
  const W = size * TILE_PX;
  const [cv, c] = createCanvas(W * ART_RES, W * ART_RES);
  c.scale(ART_RES, ART_RES);
  const rnd = seeded(size * 977);
  c.fillStyle = 'rgba(130,98,58,0.6)';
  c.beginPath();
  c.roundRect(3, 3, W - 6, W - 6, 6);
  c.fill();
  c.strokeStyle = '#6b4a2e';
  c.lineWidth = 3;
  c.strokeRect(6, 6, W - 12, W - 12);
  for (let i = 1; i < size * 2; i++)
    line(
      c,
      6 + (i * (W - 12)) / (size * 2),
      6,
      6 + (i * (W - 12)) / (size * 2),
      W - 6,
      1.2,
      'rgba(90,60,30,0.6)',
    );
  // Corner stakes with a taut builder's line.
  c.setLineDash([2, 2]);
  c.strokeStyle = 'rgba(240,230,200,0.8)';
  c.lineWidth = 0.8;
  c.strokeRect(4, 4, W - 8, W - 8);
  c.setLineDash([]);
  for (const [x, y] of [
    [4, 4],
    [W - 4, 4],
    [4, W - 4],
    [W - 4, W - 4],
  ] as const)
    disc(c, x, y, 2, '#5a3e24');
  // Stone pile and a stack of planks.
  for (let k = 0; k < 5; k++) {
    const x = 12 + (k % 3) * 6;
    const y = W - 12 - Math.floor(k / 3) * 5;
    disc(c, x, y, 3.5, rgrad(c, x, y, 3.5, shade('#9a958c', 0.9 + rnd() * 0.2)));
  }
  for (let k = 0; k < 3; k++)
    rect(c, W - 30, 10 + k * 3.4, 22, 3, vgrad(c, 10 + k * 3.4, 13 + k * 3.4, '#b08454'));
  return cv;
}
