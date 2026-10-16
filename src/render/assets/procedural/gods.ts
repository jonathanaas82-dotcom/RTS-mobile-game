import {
  createCanvas,
  createSoftCanvas,
  dgrad,
  mix,
  outlined,
  rgrad,
  seeded,
  shade,
  sunlight,
  vgrad,
} from './draw';

/**
 * Painted god busts (head and shoulders) for the codex medallions, the pre-match god cards and
 * the age-up choice. Each god has its own painter working in a 100×100 design box on three
 * layers: a backdrop (motifs behind the figure, no outline), the figure (outlined and sunlit like
 * the unit sprites) and an effects layer on top (glows, sparks, snow).
 */

type Ctx = CanvasRenderingContext2D;
type Fill = string | CanvasGradient;
type Painter = (c: Ctx, bg: Ctx, fx: Ctx) => void;

interface Head {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

const H: Head = { x: 50, y: 40, rx: 13, ry: 16 };
const HF: Head = { x: 50, y: 40, rx: 12.2, ry: 15.6 };
const INK = 'rgba(34,22,14,0.62)';
const GOLD = '#e2b13c';
const IRON = '#737b88';
const SKIN_N = '#efc8a4';
const SKIN_A = '#dcaa80';
const SKIN_S = '#b57a4c';
/** Device pixels per design unit of the bust being drawn (for blur radii). */
let PX = 1;

// ───────────────────────── primitives ─────────────────────────

function path(p: Path2D | string): Path2D {
  return typeof p === 'string' ? new Path2D(p) : p;
}

/** Fill a path and give it a thin ink edge (the cel look of the unit sprites). */
function shape(c: Ctx, p: Path2D | string, f: Fill, ink = 0.6): Path2D {
  const pp = path(p);
  c.fillStyle = f;
  c.fill(pp);
  if (ink > 0) {
    c.strokeStyle = INK;
    c.lineWidth = ink;
    c.lineJoin = 'round';
    c.stroke(pp);
  }
  return pp;
}

function strokeP(c: Ctx, p: Path2D | string, col: Fill, w: number): void {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke(path(p));
}

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: Fill): void {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** A stroke over a slightly wider dark one, so a staff or limb stays separate from what's behind. */
function inked(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: Fill): void {
  line(c, x0, y0, x1, y1, w + 1.1, INK);
  line(c, x0, y0, x1, y1, w, col);
}

function disc(c: Ctx, x: number, y: number, r: number, f: Fill): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = f;
  c.fill();
}

function oval(c: Ctx, x: number, y: number, rx: number, ry: number, f: Fill, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = f;
  c.fill();
}

function ovalPath(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

function glow(c: Ctx, x: number, y: number, r: number, col: string, a = 0.6): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function clipped(c: Ctx, p: Path2D, draw: () => void): void {
  c.save();
  c.clip(p);
  draw();
  c.restore();
}

// ───────────────────────── body ─────────────────────────

/** Shoulders and chest down to the bottom of the box. `w` widens, `y0` is the shoulder line. */
function torsoPath(w = 1, y0 = 68, neckW = 8): Path2D {
  const L = (d: number): number => 50 - d * w;
  const R = (d: number): number => 50 + d * w;
  return new Path2D(
    `M${L(50)} 102 C${L(50)} 86 ${L(45)} ${y0 + 2} ${L(28)} ${y0 - 1} ` +
      `Q${50 - neckW - 5} ${y0 - 4} ${50 - neckW} 53 L${50 + neckW} 53 ` +
      `Q${50 + neckW + 5} ${y0 - 4} ${R(28)} ${y0 - 1} C${R(45)} ${y0 + 2} ${R(50)} 86 ${R(50)} 102 Z`,
  );
}

function torso(c: Ctx, col: string, w = 1, y0 = 68, neckW = 8): Path2D {
  return shape(c, torsoPath(w, y0, neckW), vgrad(c, y0 - 6, 102, col, 1.18, 0.7), 0.7);
}

function neck(c: Ctx, skin: string, w = 6.5, top = 46): void {
  const p = shape(
    c,
    `M${50 - w} ${top} L${50 + w} ${top} L${50 + w + 1.2} 64 Q50 67 ${50 - w - 1.2} 64 Z`,
    vgrad(c, top, 64, shade(skin, 0.86), 1.1, 0.8),
    0.5,
  );
  clipped(c, p, () => {
    const g = c.createLinearGradient(0, top, 0, top + 10);
    g.addColorStop(0, 'rgba(70,30,20,0.42)');
    g.addColorStop(1, 'rgba(70,30,20,0)');
    c.fillStyle = g;
    c.fillRect(0, top, 100, 12);
    line(c, 50 + w * 0.5, 53, 50 + w * 0.3, 62, 0.6, 'rgba(90,40,25,0.25)');
  });
}

/** Two cloak panels over the shoulders, open down the middle from `gap` at the collar. */
function cloak(c: Ctx, col: string, w = 1, y0 = 68, gap = 9, open = 14): void {
  const L = (d: number): number => 50 - d * w;
  const R = (d: number): number => 50 + d * w;
  const f = vgrad(c, y0 - 6, 102, col, 1.2, 0.62);
  shape(
    c,
    `M${L(51)} 102 C${L(51)} 85 ${L(46)} ${y0 + 1} ${L(29)} ${y0 - 2} Q${50 - gap - 5} ${y0 - 5} ${50 - gap} ${y0 - 7} ` +
      `Q${50 - gap - 2} ${y0 + 10} ${50 - open} 102 Z`,
    f,
    0.7,
  );
  shape(
    c,
    `M${R(51)} 102 C${R(51)} 85 ${R(46)} ${y0 + 1} ${R(29)} ${y0 - 2} Q${50 + gap + 5} ${y0 - 5} ${50 + gap} ${y0 - 7} ` +
      `Q${50 + gap + 2} ${y0 + 10} ${50 + open} 102 Z`,
    f,
    0.7,
  );
  // Fold lines.
  for (const s of [-1, 1]) {
    strokeP(
      c,
      `M${50 + s * 30 * w} ${y0 + 2} Q${50 + s * 33 * w} ${y0 + 16} ${50 + s * 30 * w} 101`,
      shade(col, 0.7),
      0.8,
    );
    strokeP(
      c,
      `M${50 + s * 40 * w} ${y0 + 5} Q${50 + s * 44 * w} ${y0 + 18} ${50 + s * 42 * w} 101`,
      shade(col, 0.72),
      0.7,
    );
  }
}

/** Tufts of fur along a polyline. */
function fur(
  c: Ctx,
  pts: ReadonlyArray<readonly [number, number]>,
  r: number,
  col: string,
  seed = 7,
): void {
  const rnd = seeded(seed);
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.8)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      spots.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r * (0.85 + rnd() * 0.35)]);
    }
  }
  const last = pts[pts.length - 1]!;
  spots.push([last[0], last[1], r]);
  for (const [x, y, rr] of spots) disc(c, x + 0.4, y + 0.6, rr, shade(col, 0.55));
  for (const [x, y, rr] of spots) disc(c, x, y, rr, rgrad(c, x, y, rr, col));
  c.strokeStyle = shade(col, 0.62);
  c.lineWidth = 0.45;
  c.beginPath();
  for (const [x, y, rr] of spots)
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      c.moveTo(x + Math.cos(a) * rr * 0.2, y + Math.sin(a) * rr * 0.2);
      c.lineTo(x + Math.cos(a) * rr * 0.85, y + Math.sin(a) * rr * 0.85);
    }
  c.stroke();
}

/** Riveted mail texture inside a path. */
function mail(c: Ctx, p: Path2D, dark: string, y0 = 52): void {
  clipped(c, p, () => {
    c.lineWidth = 0.38;
    c.strokeStyle = dark;
    for (let y = y0, row = 0; y < 102; y += 1.5, row++) {
      c.beginPath();
      for (let x = row % 2 ? 0.8 : 0; x < 101; x += 1.6) {
        c.moveTo(x + 0.75, y);
        c.arc(x, y, 0.75, 0, Math.PI);
      }
      c.stroke();
    }
  });
}

function brooch(c: Ctx, x: number, y: number, r: number, gem = '#b5302a'): void {
  disc(c, x + 0.3, y + 0.5, r + 0.5, 'rgba(30,18,10,0.5)');
  disc(c, x, y, r, rgrad(c, x, y, r, GOLD));
  c.strokeStyle = shade(GOLD, 0.6);
  c.lineWidth = 0.4;
  c.beginPath();
  c.arc(x, y, r * 0.72, 0, Math.PI * 2);
  c.stroke();
  disc(c, x, y, r * 0.38, rgrad(c, x, y, r * 0.38, gem));
  disc(c, x - r * 0.12, y - r * 0.15, r * 0.12, 'rgba(255,255,255,0.8)');
}

/** A clenched fist (back of the hand towards the viewer). */
function fist(
  c: Ctx,
  x: number,
  y: number,
  k: number,
  col: string,
  from?: readonly [number, number],
  sleeve?: string,
): void {
  if (from) {
    // Forearm (bare or sleeved) reaching the fist from below.
    const [fx0, fy0] = from;
    const arm = sleeve ?? col;
    inked(
      c,
      fx0,
      fy0,
      x,
      y + 3 * k,
      6.4 * k,
      dgrad(c, Math.min(fx0, x) - 4, y, Math.max(fx0, x) + 4, fy0, arm),
    );
    if (!sleeve) line(c, fx0 - 1.2, fy0, x - 1.2 * k, y + 4 * k, 1.2 * k, rgba('#ffffff', 0.12));
    else {
      const t = 0.35;
      const cx = x + (fx0 - x) * t;
      const cy = y + 3 * k + (fy0 - y - 3 * k) * t;
      line(c, cx - 3.4 * k, cy, cx + 3.4 * k, cy + 0.6, 1.4 * k, shade(arm, 0.7));
    }
  }
  const s = (v: number): number => v * k;
  // Back of the hand with four knuckle bumps along the top.
  const p = new Path2D(
    `M${x - s(5)} ${y + s(3.2)} L${x - s(5.2)} ${y - s(2)} ` +
      `Q${x - s(5.2)} ${y - s(4.4)} ${x - s(3.8)} ${y - s(4.4)} Q${x - s(2.6)} ${y - s(5.4)} ${x - s(1.3)} ${y - s(4.6)} ` +
      `Q${x} ${y - s(5.6)} ${x + s(1.3)} ${y - s(4.6)} Q${x + s(2.6)} ${y - s(5.4)} ${x + s(3.8)} ${y - s(4.4)} ` +
      `Q${x + s(5.4)} ${y - s(4.2)} ${x + s(5.2)} ${y - s(1.6)} L${x + s(5)} ${y + s(3)} Q${x} ${y + s(5)} ${x - s(5)} ${y + s(3.2)} Z`,
  );
  shape(c, p, dgrad(c, x - s(5), y - s(5), x + s(5), y + s(5), col), 0.6);
  c.strokeStyle = shade(col, 0.6);
  c.lineWidth = 0.45;
  c.beginPath();
  for (const dx of [-2.5, 0, 2.5]) {
    c.moveTo(x + s(dx), y - s(4.6));
    c.lineTo(x + s(dx * 0.9), y - s(1.2));
  }
  c.stroke();
  // Curled fingers' middle joints and the thumb across the front.
  strokeP(
    c,
    `M${x - s(5)} ${y - s(1)} Q${x} ${y + s(0.2)} ${x + s(5)} ${y - s(1)}`,
    shade(col, 0.62),
    0.5,
  );
  shape(
    c,
    ovalPath(x - s(0.8), y + s(1.8), s(3.8), s(1.5), -0.12),
    dgrad(c, x - s(4), y, x + s(3), y + s(3), shade(col, 1.06)),
    0.45,
  );
  for (const dx of [-3.8, -1.3, 1.3, 3.8])
    disc(c, x + s(dx) - s(0.4), y - s(4.4), s(0.5), rgba('#ffffff', 0.22));
}

// ───────────────────────── head ─────────────────────────

type EyeKind = 'open' | 'patch' | 'closed' | 'glow' | 'dead' | 'none';

interface FaceOpts {
  skin: string;
  iris?: string;
  brow?: string;
  female?: boolean;
  /** 0 = calm, 1 = scowling brows. */
  fierce?: number;
  kohl?: boolean;
  lips?: string;
  mouth?: 'calm' | 'stern' | 'smile' | 'none';
  left?: EyeKind;
  right?: EyeKind;
  glow?: string;
  age?: number;
  ears?: boolean;
  browW?: number;
}

function facePath(h: Head, female = false): Path2D {
  const { x, y, rx, ry } = h;
  const k = female ? 0.42 : 0.52;
  const p = new Path2D();
  p.moveTo(x - rx, y - 2);
  p.bezierCurveTo(x - rx, y - ry * 1.28, x + rx, y - ry * 1.28, x + rx, y - 2);
  p.bezierCurveTo(x + rx, y + ry * 0.5, x + rx * k, y + ry, x, y + ry);
  p.bezierCurveTo(x - rx * k, y + ry, x - rx, y + ry * 0.5, x - rx, y - 2);
  return p;
}

function face(c: Ctx, h: Head, o: FaceOpts): Path2D {
  const { x, y, rx, ry } = h;
  const skin = o.skin;
  const fp = facePath(h, o.female);
  if (o.ears !== false)
    for (const s of [-1, 1]) {
      const ex = x + s * (rx - 0.2);
      shape(c, ovalPath(ex, y + 1.5, 2.4, 3.8), shade(skin, s < 0 ? 0.95 : 0.84), 0.5);
      strokeP(
        c,
        `M${ex + s * 0.6} ${y - 0.8} Q${ex + s * 1.4} ${y + 1.5} ${ex + s * 0.4} ${y + 3.6}`,
        shade(skin, 0.62),
        0.5,
      );
    }
  const g = c.createRadialGradient(x - 4, y - 5, 1, x, y, ry * 1.25);
  g.addColorStop(0, shade(skin, 1.14));
  g.addColorStop(0.55, skin);
  g.addColorStop(1, shade(skin, 0.78));
  c.fillStyle = g;
  c.fill(fp);
  clipped(c, fp, () => {
    const sg = c.createLinearGradient(x - rx, 0, x + rx, 0);
    sg.addColorStop(0, 'rgba(255,238,215,0.1)');
    sg.addColorStop(0.55, 'rgba(90,40,30,0)');
    sg.addColorStop(1, 'rgba(90,40,30,0.3)');
    c.fillStyle = sg;
    c.fillRect(x - rx, y - ry * 1.3, rx * 2, ry * 2.4);
    for (const s of [-1, 1]) oval(c, x + s * 5.4, y - 0.2, 4.2, 2.8, 'rgba(110,50,40,0.13)');
    for (const s of [-1, 1]) disc(c, x + s * 7, y + 6, 3, 'rgba(225,110,90,0.17)');
    if (o.age) {
      c.strokeStyle = `rgba(100,50,35,${0.3 * o.age})`;
      c.lineWidth = 0.5;
      c.beginPath();
      for (const dy of [-8, -10.2]) {
        c.moveTo(x - 6, y + dy);
        c.quadraticCurveTo(x, y + dy - 1, x + 6, y + dy);
      }
      for (const s of [-1, 1]) {
        c.moveTo(x + s * 3.4, y + 5.5);
        c.quadraticCurveTo(x + s * 5.4, y + 8.5, x + s * 4.6, y + 11);
        c.moveTo(x + s * 8.6, y - 0.5);
        c.lineTo(x + s * 10, y + 0.8);
      }
      c.stroke();
    }
  });
  c.strokeStyle = INK;
  c.lineWidth = 0.6;
  c.stroke(fp);
  // Eyes and brows.
  const ey = y + 0.5;
  eye(c, x - 5.4, ey, o.left ?? 'open', o, -1);
  eye(c, x + 5.4, ey, o.right ?? 'open', o, 1);
  const brow = o.brow ?? '#4a3020';
  const fierce = o.fierce ?? 0.2;
  const bw = o.browW ?? (o.female ? 0.85 : 1.45);
  for (const s of [-1, 1]) {
    if ((s < 0 ? o.left : o.right) === 'patch') continue;
    const ex = x + s * 5.4;
    const by = y - 3.6;
    strokeP(
      c,
      `M${ex - s * 2.8} ${by + fierce * 1.3} Q${ex + s * 0.4} ${by - 1.4 + fierce * 0.5} ${ex + s * 3.4} ${by - 0.1}`,
      brow,
      bw,
    );
  }
  // Nose.
  strokeP(
    c,
    `M${x + 1.1} ${y + 0.8} Q${x + 2} ${y + 4} ${x + 2.2} ${y + 6.2}`,
    'rgba(110,50,35,0.32)',
    0.9,
  );
  strokeP(c, `M${x - 0.6} ${y + 2} L${x - 0.4} ${y + 5.8}`, 'rgba(255,240,220,0.3)', 0.7);
  strokeP(
    c,
    `M${x - 2.4} ${y + 6.6} Q${x - 1.5} ${y + 8.3} ${x} ${y + 7.8} Q${x + 1.5} ${y + 8.3} ${x + 2.4} ${y + 6.6}`,
    shade(skin, 0.58),
    0.7,
  );
  // Mouth.
  const my = y + ry * 0.66;
  const m = o.mouth ?? 'calm';
  if (m === 'none') return fp;
  const up = m === 'smile' ? -0.9 : m === 'stern' ? 0.7 : 0;
  if (o.female) {
    const lips = o.lips ?? mix(skin, '#b0443c', 0.55);
    shape(
      c,
      `M${x - 3.2} ${my + up} Q${x - 1.5} ${my - 1.4} ${x} ${my - 0.6} Q${x + 1.5} ${my - 1.4} ${x + 3.2} ${my + up} Q${x} ${my + 0.4} ${x - 3.2} ${my + up} Z`,
      shade(lips, 0.9),
      0,
    );
    shape(
      c,
      `M${x - 3} ${my + up + 0.1} Q${x} ${my + 3} ${x + 3} ${my + up + 0.1} Q${x} ${my + 0.6} ${x - 3} ${my + up + 0.1} Z`,
      shade(lips, 1.12),
      0,
    );
    strokeP(
      c,
      `M${x - 3.2} ${my + up} Q${x} ${my + 0.7} ${x + 3.2} ${my + up}`,
      shade(lips, 0.45),
      0.55,
    );
  } else {
    strokeP(
      c,
      `M${x - 3.4} ${my + up} Q${x} ${my + 0.8 - up * 0.3} ${x + 3.4} ${my + up}`,
      '#5a2a1e',
      0.85,
    );
    oval(c, x, my + 1.6, 2.2, 0.8, shade(skin, 0.86));
  }
  return fp;
}

function eye(c: Ctx, ex: number, ey: number, kind: EyeKind, o: FaceOpts, side: -1 | 1): void {
  if (kind === 'none') return;
  if (kind === 'patch') {
    shape(
      c,
      ovalPath(ex, ey + 0.2, 3.7, 3.1, side * 0.15),
      dgrad(c, ex - 3, ey - 3, ex + 3, ey + 3, '#3a2a22'),
      0.6,
    );
    strokeP(c, ovalPath(ex, ey + 0.2, 2.9, 2.3, side * 0.15), 'rgba(160,120,80,0.6)', 0.35);
    return;
  }
  if (kind === 'closed') {
    strokeP(c, `M${ex - 2.8} ${ey} Q${ex} ${ey + 1.4} ${ex + 2.8} ${ey}`, '#24160e', 0.8);
    return;
  }
  const w = 2.8;
  const h = o.female ? 1.75 : 1.45;
  const lift = o.female ? 0.4 : 0;
  const al = new Path2D(
    `M${ex - w} ${ey + (side < 0 ? -lift : 0.2)} Q${ex} ${ey - h * 1.5} ${ex + w} ${ey + (side > 0 ? -lift : 0.2)} Q${ex} ${ey + h} ${ex - w} ${ey + (side < 0 ? -lift : 0.2)} Z`,
  );
  const dead = kind === 'dead';
  const glowing = kind === 'glow' || dead;
  c.fillStyle = glowing ? '#14121c' : '#f3ece0';
  c.fill(al);
  clipped(c, al, () => {
    const iris = glowing ? (o.glow ?? '#bfe8ff') : (o.iris ?? '#3d6a90');
    disc(c, ex, ey + 0.1, 1.5, rgrad(c, ex, ey + 0.1, 1.5, iris));
    if (!glowing) {
      disc(c, ex, ey + 0.1, 0.68, '#120c0a');
      disc(c, ex - 0.5, ey - 0.45, 0.45, '#ffffff');
    } else disc(c, ex, ey + 0.1, 0.6, '#ffffff');
  });
  strokeP(
    c,
    `M${ex - w - 0.2} ${ey + 0.3 - (side < 0 ? lift : 0)} Q${ex} ${ey - h * 1.6} ${ex + w + 0.2} ${ey + 0.1 - (side > 0 ? lift : 0)}`,
    '#24160e',
    o.kohl ? 1.25 : o.female ? 1 : 0.8,
  );
  if (o.female || o.kohl)
    line(
      c,
      ex + side * w,
      ey - lift,
      ex + side * (w + (o.kohl ? 2.4 : 1.2)),
      ey - lift - (o.kohl ? 0.5 : 0.9),
      o.kohl ? 0.9 : 0.6,
      '#24160e',
    );
  if (o.kohl)
    strokeP(
      c,
      `M${ex - w} ${ey + 0.3} Q${ex} ${ey + h * 1.1} ${ex + w} ${ey + 0.2}`,
      '#24160e',
      0.6,
    );
}

/** Glow over glowing eyes (drawn on the effects layer). */
function eyeGlow(
  fx: Ctx,
  h: Head,
  col: string,
  which: 'both' | 'left' | 'right' = 'both',
  r = 4,
): void {
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  if (which !== 'right') glow(fx, h.x - 5.4, h.y + 0.5, r, col, 0.55);
  if (which !== 'left') glow(fx, h.x + 5.4, h.y + 0.5, r, col, 0.55);
  fx.restore();
}

/** Hair on top of the head down to the hairline. `part` = centre parting that frames the face. */
function hairTop(
  c: Ctx,
  h: Head,
  col: string,
  style: 'swept' | 'part' | 'fringe' | 'curls' = 'swept',
): Path2D {
  const { x, y, rx, ry } = h;
  const top = y - ry * 1.36;
  let d: string;
  if (style === 'part')
    d =
      `M${x - rx - 1.6} ${y + 6} C${x - rx - 2.6} ${top + 4} ${x - 6} ${top} ${x} ${top} ` +
      `C${x + 6} ${top} ${x + rx + 2.6} ${top + 4} ${x + rx + 1.6} ${y + 6} ` +
      `L${x + rx - 0.8} ${y + 1} Q${x + rx - 2} ${y - ry * 0.55} ${x + 0.6} ${y - ry * 0.8} ` +
      `L${x - 0.6} ${y - ry * 0.8} Q${x - rx + 2} ${y - ry * 0.55} ${x - rx + 0.8} ${y + 1} Z`;
  else if (style === 'fringe')
    d =
      `M${x - rx - 1.4} ${y + 1} C${x - rx - 2.2} ${top + 2} ${x + rx + 2.2} ${top + 2} ${x + rx + 1.4} ${y + 1} ` +
      `L${x + rx - 0.6} ${y - 3} L${x + 8} ${y - ry * 0.52} L${x + 5} ${y - ry * 0.36} L${x + 2} ${y - ry * 0.54} ` +
      `L${x - 1.5} ${y - ry * 0.34} L${x - 4.5} ${y - ry * 0.52} L${x - 7.5} ${y - ry * 0.38} L${x - rx + 0.6} ${y - 3} Z`;
  else
    d =
      `M${x - rx - 1.4} ${y + 2} C${x - rx - 2.2} ${top + 1} ${x + rx + 2.2} ${top + 1} ${x + rx + 1.4} ${y + 2} ` +
      `L${x + rx - 0.4} ${y - 2} Q${x + rx - 2} ${y - ry * 0.62} ${x + 2} ${y - ry * 0.66} ` +
      `Q${x - rx + 2} ${y - ry * 0.68} ${x - rx + 0.4} ${y - 2} Z`;
  const p = shape(c, d, vgrad(c, top, y + 4, col, 1.25, 0.75), 0.6);
  clipped(c, p, () => {
    c.strokeStyle = shade(col, 0.68);
    c.lineWidth = 0.55;
    c.beginPath();
    for (let i = -4; i <= 4; i++) {
      const sx = x + i * 2.6;
      c.moveTo(sx * 0.6 + x * 0.4, top + 1);
      c.quadraticCurveTo(sx + i * 0.8, y - ry * 0.7, sx + i * 1.3, y + 2);
    }
    c.stroke();
    c.strokeStyle = shade(col, 1.35);
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(x - 7, top + 3);
    c.quadraticCurveTo(x - 9, y - ry * 0.75, x - 11, y - 4);
    c.moveTo(x - 3, top + 1.5);
    c.quadraticCurveTo(x - 4.5, y - ry * 0.8, x - 6.5, y - ry * 0.55);
    c.stroke();
    if (style === 'curls')
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        const cx = x + Math.cos(a) * (rx - 0.5);
        const cy = y - 3 + Math.sin(a) * (ry * 0.95);
        disc(c, cx, cy, 2.1, rgrad(c, cx, cy, 2.1, shade(col, 1.12)));
        strokeP(c, `M${cx - 1} ${cy} Q${cx} ${cy - 1.4} ${cx + 1} ${cy}`, shade(col, 0.6), 0.4);
      }
  });
  return p;
}

/** Long hair behind the head and shoulders, from the crown down to `bottom`. */
function hairBack(c: Ctx, h: Head, col: string, bottom: number, spread = 4, wave = 0): Path2D {
  const { x, y, rx, ry } = h;
  const top = y - ry * 1.38;
  const p = new Path2D(
    `M${x} ${top} C${x + rx + 3} ${top} ${x + rx + 3} ${y - 4} ${x + rx + 2} ${y + 6} ` +
      `C${x + rx + spread + 2} ${(y + bottom) / 2} ${x + rx + spread + 1 + wave} ${bottom - 6} ${x + rx + spread} ${bottom} ` +
      `Q${x + rx * 0.5} ${bottom + 2} ${x} ${bottom - 3} Q${x - rx * 0.5} ${bottom + 2} ${x - rx - spread} ${bottom} ` +
      `C${x - rx - spread - 1 - wave} ${bottom - 6} ${x - rx - spread - 2} ${(y + bottom) / 2} ${x - rx - 2} ${y + 6} ` +
      `C${x - rx - 3} ${y - 4} ${x - rx - 3} ${top} ${x} ${top} Z`,
  );
  shape(c, p, vgrad(c, top, bottom, shade(col, 0.9), 1.15, 0.65), 0.6);
  clipped(c, p, () => {
    c.strokeStyle = shade(col, 0.6);
    c.lineWidth = 0.6;
    c.beginPath();
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const sx = x + s * (rx + 0.5 + i * 1.6);
        c.moveTo(sx, y);
        c.quadraticCurveTo(
          sx + s * (2 + wave),
          (y + bottom) / 2,
          sx + s * (spread * 0.6 + i * 0.3),
          bottom,
        );
      }
    c.stroke();
  });
  return p;
}

interface BeardOpts {
  len?: number;
  width?: number;
  fork?: boolean;
  braids?: number[];
  bead?: string;
  curls?: boolean;
  mouth?: 'slot' | 'grin' | 'none';
  teeth?: string;
  moustache?: boolean;
}

/** Beard over the lower face, moustache and the mouth slot through it. */
function beard(c: Ctx, h: Head, col: string, o: BeardOpts = {}): void {
  const { x, y, rx, ry } = h;
  const len = o.len ?? 8;
  const w = o.width ?? 1;
  const bot = y + ry + len;
  const fork = o.fork
    ? `C${x + rx * 0.5 * w} ${bot} ${x + 3} ${bot} ${x + 2.5} ${bot - 1} L${x} ${bot - 4} L${x - 2.5} ${bot - 1} C${x - 3} ${bot} ${x - rx * 0.5 * w} ${bot} `
    : `C${x + rx * 0.7 * w} ${bot - len * 0.15} ${x + 3} ${bot} ${x} ${bot} C${x - 3} ${bot} ${x - rx * 0.7 * w} ${bot - len * 0.15} `;
  const p = new Path2D(
    `M${x - rx + 0.2} ${y - 3} L${x - rx + 2.2} ${y - 3} Q${x - rx + 2.8} ${y + 4} ${x - 5.5} ${y + 7.2} ` +
      `Q${x} ${y + 6} ${x + 5.5} ${y + 7.2} Q${x + rx - 2.8} ${y + 4} ${x + rx - 2.2} ${y - 3} L${x + rx - 0.2} ${y - 3} ` +
      `C${x + rx + 1 * w} ${y + ry * 0.6} ${x + rx * w} ${bot - len * 0.5} ${x + rx * 0.6 * w} ${bot - len * 0.25} ` +
      fork +
      `${x - rx * w} ${bot - len * 0.5} ${x - rx - 1 * w} ${y + ry * 0.6} ${x - rx + 0.2} ${y - 3} Z`,
  );
  shape(c, p, vgrad(c, y, bot, col, 1.2, 0.72), 0.6);
  clipped(c, p, () => {
    c.strokeStyle = shade(col, 0.62);
    c.lineWidth = 0.55;
    c.beginPath();
    for (let i = -5; i <= 5; i++) {
      c.moveTo(x + i * 2.1, y + 9);
      c.quadraticCurveTo(x + i * 2.4, y + ry + len * 0.4, x + i * 1.4, bot);
    }
    c.stroke();
    c.strokeStyle = shade(col, 1.3);
    c.lineWidth = 0.45;
    c.beginPath();
    for (let i = -4; i <= 3; i += 2) {
      c.moveTo(x + i * 2.1 + 0.8, y + 10);
      c.quadraticCurveTo(x + i * 2.4 + 0.8, y + ry + len * 0.4, x + i * 1.4 + 0.6, bot - 2);
    }
    c.stroke();
    if (o.curls)
      for (let yy = y + 10; yy < bot; yy += 3.2)
        for (let xx = x - rx; xx < x + rx; xx += 3.2) {
          const ox = xx + ((yy / 3.2) % 2) * 1.6;
          disc(c, ox, yy, 1.5, rgrad(c, ox, yy, 1.5, shade(col, 1.08)));
        }
  });
  for (const bx of o.braids ?? []) {
    for (let i = 0; i < 4; i++) {
      const cy = bot - 2 + i * 2.6;
      shape(c, ovalPath(x + bx, cy, 1.8 - i * 0.12, 1.6), vgrad(c, cy - 1.6, cy + 1.6, col), 0.4);
    }
    shape(
      c,
      ovalPath(x + bx, bot + 9, 1.5, 1.1),
      rgrad(c, x + bx, bot + 9, 1.5, o.bead ?? GOLD),
      0.4,
    );
  }
  if (o.moustache !== false) {
    const mc = shade(col, 1.08);
    shape(
      c,
      `M${x} ${y + 7.4} Q${x - 4} ${y + 6.8} ${x - 7} ${y + 12} Q${x - 4.5} ${y + 9.6} ${x - 1} ${y + 9.4} Z`,
      mc,
      0.4,
    );
    shape(
      c,
      `M${x} ${y + 7.4} Q${x + 4} ${y + 6.8} ${x + 7} ${y + 12} Q${x + 4.5} ${y + 9.6} ${x + 1} ${y + 9.4} Z`,
      mc,
      0.4,
    );
  }
  const my = y + 10.8;
  if (o.mouth === 'grin') {
    shape(
      c,
      `M${x - 3.8} ${my - 0.6} Q${x} ${my + 0.2} ${x + 3.8} ${my - 0.6} Q${x} ${my + 3.4} ${x - 3.8} ${my - 0.6} Z`,
      '#3a1410',
      0.4,
    );
    shape(
      c,
      `M${x - 3.2} ${my - 0.3} Q${x} ${my + 0.4} ${x + 3.2} ${my - 0.3} L${x + 2.8} ${my + 1} Q${x} ${my + 1.5} ${x - 2.8} ${my + 1} Z`,
      o.teeth ?? '#f2ead8',
      0,
    );
    c.strokeStyle = shade(o.teeth ?? '#f2ead8', 0.6);
    c.lineWidth = 0.3;
    c.beginPath();
    for (const dx of [-1.6, 0, 1.6]) {
      c.moveTo(x + dx, my - 0.1);
      c.lineTo(x + dx, my + 1.2);
    }
    c.stroke();
  } else if (o.mouth !== 'none') {
    oval(c, x, my, 2.6, 0.75, '#3a1a12');
    oval(c, x, my + 1.4, 1.9, 0.7, 'rgba(200,120,100,0.5)');
  }
}

// ───────────────────────── props ─────────────────────────

function raven(c: Ctx, x: number, y: number, dir: 1 | -1, k = 1): void {
  c.save();
  c.translate(x, y);
  c.scale(dir * k, k);
  const blk = '#262a38';
  shape(c, 'M-6 1 L-15 7 L-14 9.5 L-11 8.5 L-10 10 L-4 5 Z', vgrad(c, 0, 10, blk), 0.5);
  shape(c, ovalPath(0, 0, 8, 5.4, -0.25), rgrad(c, 0, 0, 8, blk), 0.6);
  shape(c, 'M-7 -1 Q0 -4 6 -0.5 Q2 3.6 -10 6 Z', vgrad(c, -3, 6, '#1b1e29'), 0.5);
  strokeP(c, 'M-5 1.5 Q0 0 4 -0.5 M-6 3.5 Q-1 2 2.5 1.5', '#4a5270', 0.45);
  shape(c, ovalPath(6.5, -4.2, 3.6, 3.3), rgrad(c, 6.5, -4.2, 3.6, blk), 0.5);
  shape(c, 'M9 -6 Q13 -5.6 15.4 -3.2 Q12 -2.8 9.2 -2.4 Z', vgrad(c, -6, -2, '#55545c'), 0.4);
  disc(c, 7.6, -4.9, 0.85, '#e8dcb0');
  disc(c, 7.8, -4.9, 0.4, '#120c0a');
  strokeP(c, 'M4 -6.5 Q6 -7.6 8.5 -6.8', 'rgba(140,160,220,0.6)', 0.5);
  // Feet gripping the shoulder.
  strokeP(c, 'M-1 4.6 L-2 7.5 M1.5 4.6 L1.5 7.5', '#3a3428', 0.8);
  c.restore();
}

function bow(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bend: number,
  col: string,
): void {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  line(c, x0, y0, x1, y1, 0.45, '#efe6cc');
  const d = `M${x0} ${y0} Q${mx + nx * bend} ${my + ny * bend} ${x1} ${y1}`;
  strokeP(c, d, INK, 3.4);
  strokeP(c, d, vgrad(c, Math.min(y0, y1), Math.max(y0, y1), col), 2.3);
  strokeP(c, d, rgba('#ffffff', 0.18), 0.6);
}

function spearHead(c: Ctx, x: number, y: number, len: number, w: number, col: string): void {
  shape(
    c,
    `M${x} ${y - len} Q${x + w} ${y - len * 0.45} ${x + w * 0.35} ${y} L${x - w * 0.35} ${y} Q${x - w} ${y - len * 0.45} ${x} ${y - len} Z`,
    dgrad(c, x - w, y - len, x + w, y, col),
    0.6,
  );
  line(c, x, y - len + 2, x, y - 1, 0.5, shade(col, 0.6));
}

// ───────────────────────── backdrop motifs ─────────────────────────

function bolt(c: Ctx, pts: ReadonlyArray<readonly [number, number]>, col: string, w = 1.6): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.shadowColor = col;
  c.shadowBlur = 5 * PX;
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineJoin = 'miter';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.shadowBlur = 0;
  c.strokeStyle = '#ffffff';
  c.lineWidth = w * 0.4;
  c.stroke();
  c.restore();
}

function clouds(
  c: Ctx,
  puffs: ReadonlyArray<readonly [number, number, number]>,
  col: string,
  a = 0.6,
): void {
  c.save();
  c.globalAlpha = a;
  for (const [x, y, r] of puffs) disc(c, x + 1, y + 1.5, r, shade(col, 0.6));
  for (const [x, y, r] of puffs) disc(c, x, y, r, rgrad(c, x, y, r, col));
  c.restore();
}

function snow(c: Ctx, n: number, seed: number, a = 0.85, col = '#ffffff'): void {
  const rnd = seeded(seed);
  c.save();
  c.fillStyle = rgba(col, a);
  for (let i = 0; i < n; i++) {
    const x = rnd() * 100;
    const y = rnd() * 100;
    disc(c, x, y, 0.5 + rnd() * 0.9, rgba(col, a));
  }
  c.restore();
}

function stars(c: Ctx, n: number, seed: number, col = '#fff6dc'): void {
  const rnd = seeded(seed);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = rnd() * 100;
    const y = rnd() * 70;
    const r = 0.3 + rnd() * 0.8;
    glow(c, x, y, r * 3, col, 0.5);
    disc(c, x, y, r * 0.6, col);
  }
  c.restore();
}

function rays(c: Ctx, x: number, y: number, n: number, col: string, a = 0.3, spread = 0.11): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = rgba(col, a);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(t - spread) * 90, y + Math.sin(t - spread) * 90);
    c.lineTo(x + Math.cos(t + spread) * 90, y + Math.sin(t + spread) * 90);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function mountains(
  c: Ctx,
  col: string,
  a: number,
  peaks: ReadonlyArray<readonly [number, number]>,
  base = 100,
): void {
  c.save();
  c.globalAlpha = a;
  c.beginPath();
  c.moveTo(0, base);
  for (const [x, y] of peaks) c.lineTo(x, y);
  c.lineTo(100, base);
  c.closePath();
  c.fillStyle = vgrad(c, 30, base, col, 1.3, 0.7);
  c.fill();
  // Snow caps.
  c.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 1; i < peaks.length - 1; i++) {
    const [x, y] = peaks[i]!;
    const [px, py] = peaks[i - 1]!;
    const [nx, ny] = peaks[i + 1]!;
    if (y > py || y > ny) continue;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (px - x) * 0.3, y + (py - y) * 0.3);
    c.lineTo(x - 1, y + (py - y) * 0.22 + 2);
    c.lineTo(x + (nx - x) * 0.3, y + (ny - y) * 0.3);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function waves(c: Ctx, y: number, col: string, a = 0.7, amp = 4, seed = 3): void {
  const rnd = seeded(seed);
  c.save();
  c.globalAlpha = a;
  for (let row = 0; row < 3; row++) {
    const yy = y + row * 7;
    const off = rnd() * 10;
    c.beginPath();
    c.moveTo(-5, 102);
    for (let x = -10 + off; x < 110; x += 14) {
      c.lineTo(x, yy);
      c.quadraticCurveTo(x + 5, yy - amp, x + 9, yy - amp * 0.4);
      c.quadraticCurveTo(x + 7, yy + 0.5, x + 14, yy);
    }
    c.lineTo(105, 102);
    c.closePath();
    c.fillStyle = vgrad(c, yy - amp, 102, shade(col, 1 - row * 0.12), 1.3, 0.7);
    c.fill();
    c.strokeStyle = 'rgba(240,255,255,0.8)';
    c.lineWidth = 0.8;
    c.beginPath();
    for (let x = -10 + off; x < 110; x += 14) {
      c.moveTo(x, yy);
      c.quadraticCurveTo(x + 5, yy - amp, x + 9, yy - amp * 0.4);
    }
    c.stroke();
  }
  c.restore();
}

function wisps(c: Ctx, col: string, a: number, seed: number, n = 7): void {
  const rnd = seeded(seed);
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = col;
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const y = 15 + rnd() * 80;
    const x = rnd() * 60 - 10;
    c.lineWidth = 1 + rnd() * 2.5;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x + 15, y - 8, x + 25, y + 8, x + 40 + rnd() * 20, y - 2);
    c.stroke();
  }
  c.restore();
}

function stalks(c: Ctx, col: string, a: number, seed: number, n = 12): void {
  const rnd = seeded(seed);
  c.save();
  c.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 100 + rnd() * 6;
    const top = 40 + rnd() * 30;
    const lean = (rnd() - 0.5) * 8;
    line(c, x, 102, x + lean, top, 0.8, shade(col, 0.8));
    for (let k = 0; k < 5; k++) {
      const yy = top + k * 2.2;
      const xx = x + lean * (1 - (yy - top) / (102 - top));
      oval(c, xx - 1, yy, 0.8, 1.6, col, -0.5);
      oval(c, xx + 1, yy + 1, 0.8, 1.6, col, 0.5);
    }
  }
  c.restore();
}

// ───────────────────────── Norse gods ─────────────────────────

const thor: Painter = (c, bg, fx) => {
  const red = '#b9481e';
  clouds(
    bg,
    [
      [10, 22, 12],
      [28, 12, 13],
      [50, 6, 12],
      [72, 10, 13],
      [92, 20, 12],
    ],
    '#4a5470',
    0.55,
  );
  bolt(
    bg,
    [
      [14, 18],
      [22, 34],
      [16, 37],
      [27, 60],
    ],
    '#cfe6ff',
    1.6,
  );
  bolt(
    bg,
    [
      [92, 42],
      [86, 56],
      [91, 58],
      [83, 76],
    ],
    '#cfe6ff',
    1.3,
  );
  hairBack(c, H, red, 68, 5, 1);
  const tp = torso(c, '#858d99', 1.12);
  mail(c, tp, '#4f5662');
  cloak(c, '#a32a20', 1.12, 68, 10, 13);
  fur(
    c,
    [
      [13, 76],
      [22, 68],
      [34, 65],
      [41, 64],
    ],
    3.2,
    '#7a5a3a',
    3,
  );
  fur(
    c,
    [
      [59, 64],
      [66, 65],
      [78, 68],
      [87, 76],
    ],
    3.2,
    '#7a5a3a',
    4,
  );
  brooch(c, 39, 68, 3.2);
  brooch(c, 61, 68, 3.2);
  // Megingjörð: the belt of strength, broad leather set with gold rune plates.
  clipped(c, tp, () => {
    shape(c, 'M0 89 Q50 86 100 89 L100 98 Q50 95 0 98 Z', vgrad(c, 86, 98, '#6b4626'), 0.6);
    for (let x = 6; x < 100; x += 9) {
      const yy = 88.2 + Math.abs(x - 50) * 0.03;
      shape(
        c,
        `M${x - 2.6} ${yy} L${x + 2.6} ${yy} L${x + 2.6} ${yy + 6} L${x - 2.6} ${yy + 6} Z`,
        dgrad(c, x - 3, yy, x + 3, yy + 6, GOLD),
        0.4,
      );
      strokeP(
        c,
        `M${x} ${yy + 1.2} L${x} ${yy + 4.8} M${x} ${yy + 1.5} L${x + 1.4} ${yy + 3}`,
        shade(GOLD, 0.5),
        0.45,
      );
    }
    shape(c, ovalPath(50, 91.5, 5.4, 4.6), rgrad(c, 50, 91.5, 5.4, GOLD), 0.6);
    shape(c, ovalPath(50, 91.5, 2.4, 2), '#5a3a1e', 0.4);
  });
  neck(c, SKIN_N, 7.2);
  face(c, H, {
    skin: SKIN_N,
    iris: '#3a78b8',
    brow: shade(red, 0.75),
    fierce: 1,
    mouth: 'stern',
    age: 0.25,
  });
  hairTop(c, H, red, 'swept');
  beard(c, H, red, { len: 15, width: 1.15, braids: [-3.6, 3.6], bead: '#9aa3ad' });
  // Járngreipr (iron gloves) raising Mjölnir.
  inked(c, 92, 90, 81, 58, 10, dgrad(c, 76, 58, 94, 90, IRON));
  for (const t of [0.35, 0.6]) {
    const px = 92 + (81 - 92) * t;
    const py = 90 + (58 - 90) * t;
    strokeP(
      c,
      `M${px - 5} ${py + 1} Q${px} ${py - 1.6} ${px + 5} ${py + 1}`,
      shade(IRON, 0.55),
      0.6,
    );
  }
  // Short handle (Loki's meddling) wrapped in leather, ring at the end.
  inked(c, 80, 60, 80, 36, 3.6, vgrad(c, 36, 60, '#6a4426'));
  for (let yy = 40; yy < 58; yy += 2.2) line(c, 78.3, yy, 81.7, yy + 1, 0.5, '#3a2414');
  strokeP(c, ovalPath(80, 62.5, 1.8, 1.8), '#a7aeb8', 0.9);
  fist(c, 80, 52, 1.15, IRON);
  const hp = shape(
    c,
    'M67 24 Q80 26.6 93 24 L94 38.5 Q80 36 66 38.5 Z',
    dgrad(c, 66, 24, 94, 39, '#7a8290'),
    0.8,
  );
  clipped(c, hp, () => {
    line(c, 66, 25.6, 94, 25.6, 1, 'rgba(255,255,255,0.35)');
    strokeP(c, ovalPath(80, 31.3, 3.6, 3.6), GOLD, 0.7);
    strokeP(c, `M76.2 31.3 Q80 26 83.8 31.3 Q80 37 76.2 31.3`, GOLD, 0.55);
    strokeP(c, 'M69 28 Q71.5 31.3 69 34.6 M91 28 Q88.5 31.3 91 34.6', shade(GOLD, 0.9), 0.55);
  });
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 80, 31, 16, '#9fd0ff', 0.35);
  fx.restore();
  bolt(
    fx,
    [
      [66, 22],
      [62, 17],
      [64, 15],
      [58, 9],
    ],
    '#d8f0ff',
    0.8,
  );
  bolt(
    fx,
    [
      [94, 25],
      [97, 19],
      [95, 17],
      [99, 12],
    ],
    '#d8f0ff',
    0.8,
  );
};

const odin: Painter = (c, bg) => {
  // Runes circling behind (Odin won them hanging nine nights on Yggdrasil).
  bg.save();
  bg.strokeStyle = 'rgba(190,215,255,0.5)';
  bg.lineWidth = 0.9;
  const runes = [
    'M0 -3 L0 3 M0 -3 L2 -1 M0 -1 L2 1',
    'M0 -3 L0 3 M0 -3 L2 0 L0 3',
    'M-1.5 -3 L1.5 3 M1.5 -3 L-1.5 3',
    'M0 -3 L0 3 M-2 -1 L0 -3 L2 -1',
    'M0 -3 L0 3 L2 1 M0 0 L2 -2',
    'M-2 -3 L-2 3 M-2 -3 L2 3 L2 -3',
  ];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    bg.save();
    bg.translate(50 + Math.cos(a) * 43, 46 + Math.sin(a) * 43);
    bg.rotate(a + Math.PI / 2);
    bg.stroke(new Path2D(runes[i % runes.length]!));
    bg.restore();
  }
  bg.beginPath();
  bg.arc(50, 46, 47, 0, Math.PI * 2);
  bg.stroke();
  bg.restore();
  const grey = '#b9b4ad';
  // Gungnir behind the shoulder.
  inked(c, 20, 102, 27, 14, 2.6, vgrad(c, 14, 102, '#5e4026'));
  spearHead(c, 27.2, 14, 13, 4.2, '#c9ced6');
  strokeP(c, 'M26.6 6 L27.8 9 M27.6 9.5 L26.6 11.5', shade(GOLD, 0.8), 0.45);
  shape(c, 'M25.5 13.5 L29 13.5 L28.7 17.5 L25.8 17.5 Z', dgrad(c, 25, 13, 29, 18, GOLD), 0.4);
  hairBack(c, H, grey, 74, 4);
  torso(c, '#3c4a63', 1.04);
  cloak(c, '#4f5f7a', 1.04, 68, 9, 12);
  // Clasp chain between two brooches.
  strokeP(c, 'M40 70 Q50 75 60 70', GOLD, 0.8);
  brooch(c, 40, 69, 3, '#3a6ac0');
  brooch(c, 60, 69, 3, '#3a6ac0');
  fist(c, 22.2, 82, 1.1, SKIN_N, [10, 102], '#4f5f7a');
  neck(c, SKIN_N);
  const fp = face(c, H, {
    skin: SKIN_N,
    iris: '#7aa0c0',
    brow: '#d8d4cc',
    fierce: 0.5,
    left: 'patch',
    mouth: 'stern',
    age: 1,
  });
  // Patch strap across the brow.
  clipped(c, fp, () => {
    line(c, H.x - H.rx, H.y - 5, H.x + H.rx, H.y - 9, 0.9, '#2a1e18');
    // Shadow of the hat brim.
    const g = c.createLinearGradient(0, 24, 0, 38);
    g.addColorStop(0, 'rgba(20,24,44,0.55)');
    g.addColorStop(1, 'rgba(20,24,44,0)');
    c.fillStyle = g;
    c.fillRect(30, 20, 40, 20);
  });
  hairTop(c, H, grey, 'part');
  beard(c, H, '#cfcac2', { len: 26, width: 1.2, fork: true });
  // Wide-brimmed traveller's hat.
  shape(c, 'M37 26 Q36 8 52 5 Q60 4 62 10 Q66 17 64 26 Z', vgrad(c, 5, 26, '#4a556a'), 0.7);
  strokeP(c, 'M44 10 Q48 16 46 25', 'rgba(20,24,40,0.4)', 0.8);
  shape(c, 'M37.5 22.5 Q50 20.5 63.5 22.5 L64 26 Q50 24 37 26 Z', '#2c3446', 0.4);
  shape(c, ovalPath(50, 26.5, 28, 5.6, -0.04), vgrad(c, 21, 32, '#56627a', 1.2, 0.6), 0.8);
  strokeP(c, 'M24 27.5 Q50 31 76 26', 'rgba(255,255,255,0.15)', 0.6);
  // Huginn and Muninn.
  raven(c, 22, 64, 1, 1.05);
  raven(c, 78, 64, -1, 1.05);
};

const skadi: Painter = (c, bg, fx) => {
  mountains(bg, '#a9c2dc', 0.6, [
    [0, 70],
    [14, 46],
    [26, 60],
    [42, 34],
    [58, 58],
    [72, 40],
    [88, 58],
    [100, 50],
  ]);
  snow(bg, 40, 11, 0.7);
  // Skis standing behind the shoulder.
  for (const dx of [0, 4.5]) {
    shape(
      c,
      `M${12 + dx} 102 L${20 + dx} 16 Q${21 + dx} 10 ${25 + dx} 9 L${24 + dx} 12 Q${23 + dx} 14 ${23.4 + dx} 17 L${16 + dx} 102 Z`,
      dgrad(c, 12, 10, 26, 100, '#9a6a3c'),
      0.6,
    );
    line(c, 14.4 + dx, 100, 21.6 + dx, 20, 0.4, '#5a3a20');
  }
  const hair = '#3d2a24';
  hairBack(c, HF, hair, 64, 2);
  torso(c, '#5f88a8', 0.96, 69, 7);
  // Fur mantle (grey wolf) over the shoulders.
  shape(
    c,
    'M4 102 C4 84 12 72 26 68 Q38 64 50 70 Q62 64 74 68 C88 72 96 84 96 102 L70 102 Q60 86 50 84 Q40 86 30 102 Z',
    vgrad(c, 64, 102, '#c8ccd0', 1.15, 0.65),
    0.7,
  );
  fur(
    c,
    [
      [8, 90],
      [16, 76],
      [28, 69],
      [40, 68],
      [50, 72],
      [60, 68],
      [72, 69],
      [84, 76],
      [92, 90],
    ],
    2.8,
    '#e6e8ea',
    5,
  );
  // Quiver strap.
  strokeP(c, 'M30 72 L64 102', '#5a3a22', 2.6);
  for (const t of [0.3, 0.6]) disc(c, 30 + 34 * t, 72 + 30 * t, 1, GOLD);
  neck(c, SKIN_N, 5.6);
  face(c, HF, {
    skin: SKIN_N,
    female: true,
    iris: '#8ec2e4',
    brow: '#3a2620',
    fierce: 0.55,
    mouth: 'stern',
    lips: '#b06058',
  });
  hairTop(c, HF, hair, 'part');
  // Fur hood framing the face.
  const hood =
    'M30 56 C24 36 30 14 50 12 C70 14 76 36 70 56 L66 56 C70 38 66 22 50 21 C34 22 30 38 34 56 Z';
  shape(c, hood, vgrad(c, 12, 56, '#7b93ab'), 0.7);
  fur(
    c,
    [
      [34, 56],
      [32, 44],
      [34, 31],
      [41, 23],
      [50, 20.5],
      [59, 23],
      [66, 31],
      [68, 44],
      [66, 56],
    ],
    3,
    '#f1f2f2',
    9,
  );
  // Braids over the shoulders.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const bx = 50 + s * (11 + i * 0.4);
      const by = 56 + i * 3;
      shape(c, ovalPath(bx, by, 2, 1.8), vgrad(c, by - 2, by + 2, hair), 0.4);
    }
    shape(c, ovalPath(50 + s * 13.4, 74.5, 1.3, 2), '#ede6d6', 0.4);
  }
  // Recurve bow held upright.
  bow(c, 80, 30, 82, 100, -11, '#6e4426');
  fur(
    c,
    [
      [86, 64],
      [87, 70],
    ],
    3.4,
    '#d6d8da',
    2,
  );
  snow(fx, 14, 23, 0.9);
};

const ullr: Painter = (c, bg, fx) => {
  // Snowy spruce forest.
  bg.save();
  bg.globalAlpha = 0.55;
  for (const [x, y, k] of [
    [10, 60, 1.1],
    [24, 52, 0.9],
    [78, 50, 1],
    [92, 62, 1.15],
    [64, 66, 0.8],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const w = (6 + i * 3) * k;
      const yy = y + i * 8 * k;
      bg.fillStyle = shade('#2f5a48', 1 - i * 0.08);
      bg.beginPath();
      bg.moveTo(x, yy - 7 * k);
      bg.lineTo(x + w, yy + 4 * k);
      bg.lineTo(x - w, yy + 4 * k);
      bg.closePath();
      bg.fill();
      bg.fillStyle = 'rgba(255,255,255,0.8)';
      bg.beginPath();
      bg.moveTo(x, yy - 7 * k);
      bg.lineTo(x + w * 0.35, yy - 3 * k);
      bg.lineTo(x - w * 0.35, yy - 3 * k);
      bg.closePath();
      bg.fill();
    }
  }
  bg.restore();
  snow(bg, 30, 41, 0.7);
  // Skis and quiver behind the right shoulder.
  for (const dx of [0, 4]) {
    shape(
      c,
      `M${80 + dx} 102 L${74 + dx} 14 Q${73 + dx} 9 ${69 + dx} 8 L${70 + dx} 11 Q${71 + dx} 13 ${70.6 + dx} 16 L${84 + dx} 102 Z`,
      dgrad(c, 68, 8, 86, 102, '#b07a44'),
      0.6,
    );
  }
  shape(c, 'M62 74 L70 40 L76 42 L70 76 Z', vgrad(c, 40, 76, '#6a4426'), 0.6);
  for (const dx of [0, 2.4, 4.8]) {
    line(c, 70 + dx * 0.6, 42, 69 + dx, 33, 0.6, '#d9cfb8');
    shape(c, `M${68.4 + dx} 33 L${71 + dx} 34 L${70 + dx} 38 L${67.6 + dx} 37 Z`, '#e6e0d0', 0.3);
  }
  const hair = '#7a5532';
  hairBack(c, H, hair, 60, 2);
  torso(c, '#5b6b3a', 1.02);
  cloak(c, '#2f5a3e', 1.02, 68, 10, 14);
  fur(
    c,
    [
      [14, 78],
      [24, 69],
      [36, 66],
      [42, 66],
    ],
    2.8,
    '#9a7a56',
    13,
  );
  fur(
    c,
    [
      [58, 66],
      [64, 66],
      [76, 69],
      [86, 78],
    ],
    2.8,
    '#9a7a56',
    14,
  );
  brooch(c, 50, 74, 3.4, '#3a8a5a');
  neck(c, SKIN_N);
  face(c, H, { skin: SKIN_N, iris: '#4f8a5a', brow: shade(hair, 0.7), fierce: 0.6, mouth: 'calm' });
  hairTop(c, H, hair, 'swept');
  beard(c, H, hair, { len: 4, width: 0.95 });
  // Fur cap.
  shape(c, 'M37 26 Q37 9 50 8 Q63 9 63 26 Z', vgrad(c, 8, 26, '#2f5a3e'), 0.6);
  fur(
    c,
    [
      [35, 27],
      [42, 25],
      [50, 24.5],
      [58, 25],
      [65, 27],
    ],
    3.2,
    '#a8875e',
    15,
  );
  // Yew bow with an arrow nocked, held across the body.
  bow(c, 16, 32, 22, 100, 12, '#8a3a1e');
  fist(c, 23, 70, 1.05, '#7a5a3a', [12, 100], '#2f5a3e');
  snow(fx, 10, 47, 0.9);
};

const tyr: Painter = (c, bg) => {
  // Fenrir looming behind, bound by Gleipnir.
  bg.save();
  bg.globalAlpha = 0.72;
  const wolf = new Path2D(
    'M104 70 L99 30 L97 7 L90 19 L84 5 L79 20 Q71 22 65 29 L55 35 L57 39.5 L66 40 L61 47 L72 46 Q80 54 86 70 Z',
  );
  bg.fillStyle = vgrad(bg, 5, 70, '#3a3844', 1.3, 0.8);
  bg.fill(wolf);
  bg.strokeStyle = 'rgba(190,190,215,0.7)';
  bg.lineWidth = 0.7;
  bg.stroke(wolf);
  bg.fillStyle = '#f0ead8';
  bg.beginPath();
  bg.moveTo(59, 39.5);
  bg.lineTo(60, 42.5);
  bg.lineTo(61.5, 39.6);
  bg.moveTo(63, 46.5);
  bg.lineTo(64, 43.6);
  bg.lineTo(65.4, 46.3);
  bg.fill();
  strokeP(bg, 'M70 30 Q78 26 86 30 M88 14 L89 21', 'rgba(20,20,26,0.8)', 0.7);
  bg.restore();
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  glow(bg, 74, 28, 5, '#ff5a2a', 0.9);
  disc(bg, 74, 28, 1.1, '#ffd0a0');
  bg.restore();
  bg.save();
  bg.globalAlpha = 0.6;
  strokeP(bg, 'M60 70 Q78 60 100 70', '#d8d0f0', 1.2);
  bg.restore();
  // Tiwaz rune.
  bg.save();
  bg.globalAlpha = 0.4;
  strokeP(bg, 'M18 46 L18 18 M10 26 L18 18 L26 26', '#ffe6b0', 2.2);
  bg.restore();
  const hair = '#a07a44';
  const tp = torso(c, '#7a828e', 1.06);
  mail(c, tp, '#4a505a');
  cloak(c, '#6a2a24', 1.06, 68, 11, 15);
  brooch(c, 38, 70, 3, '#2a5a9a');
  // Right arm raised, ending in a bound stump (the hand went to Fenrir).
  inked(c, 14, 98, 22, 64, 9, vgrad(c, 64, 98, '#6a2a24'));
  shape(c, 'M17.5 66 L26.5 66 L25.5 56 Q22 53 18.5 56 Z', vgrad(c, 53, 66, SKIN_N), 0.6);
  for (let i = 0; i < 4; i++)
    strokeP(c, `M17.4 ${64 - i * 2.4} L26.4 ${62.6 - i * 2.4}`, '#7a5432', 1.4);
  shape(c, ovalPath(22, 55.2, 3.6, 2), vgrad(c, 53, 57.5, '#8a6440'), 0.5);
  neck(c, SKIN_N, 7);
  face(c, H, {
    skin: SKIN_N,
    iris: '#5a7a9a',
    brow: shade(hair, 0.65),
    fierce: 0.9,
    mouth: 'stern',
    age: 0.4,
  });
  beard(c, H, hair, { len: 7, braids: [0], bead: '#b9c0ca' });
  // Spangenhelm (no horns): iron cap, gilded bands, browband, spectacle guard and nasal.
  const helm = shape(
    c,
    'M35.5 34 Q35 12 50 11 Q65 12 64.5 34 Z',
    dgrad(c, 35, 11, 65, 34, '#858e9a'),
    0.7,
  );
  clipped(c, helm, () => {
    for (const x of [42, 50, 58])
      strokeP(
        c,
        `M${x} 34 Q${x + (x - 50) * 0.1} 18 50 11`,
        dgrad(c, 40, 10, 60, 34, '#c9a24a'),
        2,
      );
    line(c, 38, 18, 41, 15, 0.8, 'rgba(255,255,255,0.4)');
  });
  shape(
    c,
    'M35 31 Q50 28.5 65 31 L65 35 Q50 32.5 35 35 Z',
    dgrad(c, 35, 29, 65, 35, '#c9a24a'),
    0.5,
  );
  strokeP(c, 'M50 34 L50 46', INK, 3.2);
  strokeP(c, 'M50 34 L50 45.6', '#8a929e', 2.2);
  for (const s of [-1, 1])
    strokeP(
      c,
      `M${50 + s * 1.2} 34 Q${50 + s * 5.6} 36 ${50 + s * 9.6} 34.6 Q${50 + s * 10.4} 38.6 ${50 + s * 8.4} 42.4 Q${50 + s * 5.2} 43.4 ${50 + s * 1.2} 41.8`,
      '#8a929e',
      1.3,
    );
  // Sword in the left hand.
  shape(c, 'M77.4 64 L77.4 12 L80 7 L82.6 12 L82.6 64 Z', dgrad(c, 77, 7, 83, 64, '#c9d0d9'), 0.6);
  line(c, 80, 12, 80, 62, 0.8, '#8a929e');
  shape(c, 'M71 63.5 L89 63.5 L88 66.5 L72 66.5 Z', dgrad(c, 71, 63, 89, 67, '#c9a24a'), 0.5);
  inked(c, 80, 67, 80, 77, 3.2, '#4a3020');
  fist(c, 80, 72, 1.05, SKIN_N, [94, 102], '#6a2a24');
  shape(
    c,
    'M76 77 Q80 75 84 77 L83 80.5 Q80 82 77 80.5 Z',
    dgrad(c, 76, 75, 84, 82, '#c9a24a'),
    0.5,
  );
};

const heimdall: Painter = (c, bg, fx) => {
  // Bifröst arching behind.
  const cols = ['#e04a3a', '#f08a2a', '#f2d24a', '#5ab85a', '#4a8ad8', '#7a5ac8'];
  bg.save();
  bg.globalAlpha = 0.55;
  cols.forEach((col, i) => {
    bg.strokeStyle = col;
    bg.lineWidth = 3.2;
    bg.beginPath();
    bg.arc(50, 82, 52 - i * 3.1, Math.PI * 1.05, Math.PI * 1.95);
    bg.stroke();
  });
  bg.restore();
  stars(bg, 10, 61);
  const hair = '#f0dca0';
  hairBack(c, H, hair, 66, 3);
  torso(c, '#efeae0', 1.04);
  cloak(c, '#f6f2ea', 1.04, 68, 9, 13);
  // Gold borders of the white cloak.
  for (const s of [-1, 1])
    strokeP(c, `M${50 + s * 9} 61 Q${50 + s * 11} 78 ${50 + s * 13} 101`, GOLD, 1.6);
  shape(c, 'M38 66 Q50 72 62 66 L62 69 Q50 75 38 69 Z', dgrad(c, 38, 66, 62, 75, GOLD), 0.4);
  brooch(c, 50, 71.5, 3.4, '#4a8ad8');
  neck(c, SKIN_N);
  face(c, H, { skin: SKIN_N, iris: '#4aa0e8', brow: shade(hair, 0.7), fierce: 0, mouth: 'none' });
  hairTop(c, H, hair, 'swept');
  beard(c, H, hair, { len: 3, mouth: 'grin', teeth: '#f2c23a' });
  // Gold circlet.
  strokeP(c, 'M37 31.5 Q50 26.5 63 31.5', GOLD, 1.6);
  disc(c, 50, 28.6, 1.6, rgrad(c, 50, 28.6, 1.6, '#7ad0ff'));
  // Gjallarhorn: great curved horn, ivory with gold bands, bell up high.
  const horn = 'M62 92 Q86 86 88 58 Q89 44 84 32 L94 28 Q100 46 96 64 Q90 94 64 98 Z';
  shape(c, horn, dgrad(c, 62, 28, 100, 98, '#eee2c2'), 0.7);
  for (const [x0, y0, x1, y1] of [
    [66, 91, 66, 97],
    [79, 85, 82, 92],
    [86, 70, 93, 73],
    [87, 52, 96, 51],
    [85.6, 37, 95.4, 33.6],
  ] as const)
    strokeP(c, `M${x0} ${y0} L${x1} ${y1}`, GOLD, 1.5);
  shape(c, ovalPath(89, 30, 5.6, 2.2, -0.38), '#3a2a1a', 0.6);
  strokeP(c, ovalPath(89, 30, 5.6, 2.2, -0.38), GOLD, 1);
  fist(c, 77, 88, 1.1, SKIN_N, [92, 104], '#f6f2ea');
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 51, 6, '#ffd860', 0.4);
  fx.restore();
};

const hel: Painter = (c, bg, fx) => {
  wisps(bg, '#a8c0b8', 0.35, 71, 9);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  for (const [x, y] of [
    [16, 30],
    [84, 24],
    [12, 70],
    [88, 66],
    [28, 14],
  ] as const)
    glow(bg, x, y, 4, '#9fe8d0', 0.6);
  bg.restore();
  const hair = '#1c1820';
  // Dark hood and mantle.
  shape(c, 'M28 60 C20 34 30 10 50 9 C70 10 80 34 72 60 Z', vgrad(c, 9, 60, '#2e2838'), 0.7);
  hairBack(c, HF, hair, 72, 3);
  torso(c, '#26202e', 1, 69, 7);
  // Living half of the robe dark plum, dead half tattered grey.
  shape(
    c,
    'M50 70 L50 102 L98 102 C98 88 92 74 72 68 Q60 66 50 70 Z',
    vgrad(c, 66, 102, '#3a3a44'),
    0.6,
  );
  strokeP(c, 'M58 76 L62 92 M68 74 L74 96 M80 78 L84 98', '#22222a', 0.8);
  // Necklace of bones.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.18 + (i / 8) * 0.64);
    const bx = 50 + Math.cos(a) * 12;
    const by = 62 + Math.sin(a) * 9;
    shape(c, ovalPath(bx, by, 0.9, 2, a - Math.PI / 2), '#e8e2d0', 0.35);
  }
  neck(c, '#e6d8cc', 5.6);
  const fp = face(c, HF, {
    skin: '#e9dccf',
    female: true,
    iris: '#6a7a6a',
    brow: '#2a2026',
    fierce: 0.4,
    mouth: 'stern',
    lips: '#7a4a52',
    right: 'dead',
    glow: '#bff0ff',
  });
  // The dead half: blue-black flesh, skull shadows and a lipless grin.
  const half = new Path2D('M50 18 Q48 30 51 40 Q48.5 48 50.5 58 L72 58 L72 18 Z');
  clipped(c, fp, () =>
    clipped(c, half, () => {
      c.fillStyle = vgrad(c, 22, 58, '#34425a', 1.15, 0.7);
      c.fillRect(48, 18, 26, 42);
      oval(c, 55.4, 40.8, 4.4, 3.6, '#10141e');
      oval(c, 57.5, 47, 4.6, 2.2, 'rgba(10,14,22,0.6)', -0.3);
      strokeP(c, 'M51.2 50.5 L54.6 50.5', '#10141e', 1.6);
      c.strokeStyle = '#d8d6c8';
      c.lineWidth = 0.4;
      c.beginPath();
      for (const x of [51.4, 52.6, 53.8]) {
        c.moveTo(x, 49.6);
        c.lineTo(x, 51.4);
      }
      c.stroke();
      strokeP(c, 'M56 30 Q60 34 59 38 M60 44 L62 50', 'rgba(150,180,200,0.35)', 0.5);
    }),
  );
  // Re-draw the dead eye on top of the socket.
  eye(c, HF.x + 5.4, HF.y + 0.5, 'dead', { skin: '#34425a', female: true, glow: '#bff0ff' }, 1);
  strokeP(c, 'M50 18 Q48 30 51 40 Q48.5 48 50.5 56', 'rgba(20,20,30,0.5)', 0.5);
  hairTop(c, HF, hair, 'part');
  // Iron crown with jagged points.
  shape(
    c,
    'M37 27 L38 17 L41.5 23 L44.5 13 L47.5 22 L50 10 L52.5 22 L55.5 13 L58.5 23 L62 17 L63 27 Q50 24 37 27 Z',
    dgrad(c, 37, 10, 63, 27, '#5a5f6a'),
    0.6,
  );
  disc(c, 50, 24, 1.3, rgrad(c, 50, 24, 1.3, '#7ae8c8'));
  eyeGlow(fx, HF, '#9fe8ff', 'right', 5);
};

const freyja: Painter = (c, bg, fx) => {
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  glow(bg, 50, 40, 46, '#ffb070', 0.3);
  bg.restore();
  // Small flowers.
  for (const [x, y] of [
    [14, 30],
    [86, 28],
    [20, 50],
    [82, 48],
    [30, 16],
    [70, 14],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      disc(bg, x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1.3, 'rgba(255,190,200,0.7)');
    }
    disc(bg, x, y, 0.9, 'rgba(255,220,120,0.9)');
  }
  const hair = '#e9b850';
  hairBack(c, HF, hair, 88, 6, 2);
  torso(c, '#9a2c34', 0.98, 69, 7);
  // Falcon-feather cloak: rows of barred feathers over the shoulders.
  const cl = shape(
    c,
    'M2 102 C2 84 10 72 26 67 Q38 64 42 62 L44 76 Q36 88 34 102 Z M98 102 C98 84 90 72 74 67 Q62 64 58 62 L56 76 Q64 88 66 102 Z',
    vgrad(c, 62, 102, '#8a6a4a'),
    0.7,
  );
  clipped(c, cl, () => {
    for (let row = 6; row >= 0; row--)
      for (const s of [-1, 1])
        for (let i = 0; i < 9; i++) {
          const dx = 10 + i * 5 + (row % 2) * 2.5;
          const x = 50 + s * dx;
          const y = 61 + ((dx - 8) / 42) ** 2 * 14 + row * 6;
          feather(c, x, y - 2, 10, 2.8, s * (0.18 + i * 0.03), row % 2 ? '#9a7450' : '#866042');
        }
  });
  // Hair falls forward over the shoulders.
  for (const s of [-1, 1])
    shape(
      c,
      `M${50 + s * 9} 50 Q${50 + s * 14} 66 ${50 + s * 13} 90 Q${50 + s * 17} 80 ${50 + s * 18} 64 Q${50 + s * 17} 54 ${50 + s * 12} 46 Z`,
      vgrad(c, 46, 90, hair),
      0.5,
    );
  neck(c, SKIN_N, 5.6);
  // Brísingamen: a broad gold necklace with amber drops.
  strokeP(c, 'M39 61 Q50 72 61 61', INK, 3);
  strokeP(c, 'M39 61 Q50 72 61 61', GOLD, 2.2);
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 39 + 22 * t;
    const y = 61 + Math.sin(t * Math.PI) * 5.6;
    const r = i === 3 ? 2.6 : 1.4;
    shape(
      c,
      `M${x - r * 0.7} ${y + 0.5} L${x} ${y + r * 2.6} L${x + r * 0.7} ${y + 0.5} Z`,
      dgrad(c, x - r, y, x + r, y + r * 2.6, GOLD),
      0.35,
    );
    disc(c, x, y + r * 1.3, r * 0.6, rgrad(c, x, y + r * 1.3, r * 0.6, '#e87a1a'));
  }
  face(c, HF, {
    skin: SKIN_N,
    female: true,
    iris: '#3a8a7a',
    brow: shade(hair, 0.65),
    fierce: 0,
    mouth: 'smile',
    lips: '#c4504a',
  });
  hairTop(c, HF, hair, 'part');
  // Gold diadem and flowers in the hair.
  strokeP(c, 'M38.5 30 Q50 25.5 61.5 30', GOLD, 1.2);
  for (const [x, y] of [
    [38, 31],
    [62, 31],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      disc(c, x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 1.2, '#ffd0d8');
    }
    disc(c, x, y, 0.9, '#f2b030');
  }
  // One of her cats.
  cat(c, 25, 86, 1.3);
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 68, 5, '#ffb040', 0.5);
  fx.restore();
};

/** A barred falcon feather pointing down from (x, y), turned by `rot`. */
function feather(
  c: Ctx,
  x: number,
  y: number,
  len: number,
  w: number,
  rot: number,
  col: string,
): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const p = shape(
    c,
    `M0 0 Q${w} ${len * 0.4} 0 ${len} Q${-w} ${len * 0.4} 0 0 Z`,
    vgrad(c, 0, len, col, 1.2, 0.7),
    0.4,
  );
  clipped(c, p, () => {
    for (const t of [0.42, 0.62, 0.82])
      strokeP(c, `M${-w} ${len * t} Q0 ${len * (t + 0.08)} ${w} ${len * t}`, '#3e2a18', 0.7);
    disc(c, 0, len * 0.95, w * 0.5, '#ece0c4');
  });
  line(c, 0, len * 0.08, 0, len * 0.9, 0.3, '#efe4cc');
  c.restore();
}

function cat(c: Ctx, x: number, y: number, k: number): void {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  const fur = '#8a8a90';
  shape(c, 'M-9 14 Q-10 2 0 1 Q10 2 9 14 Z', vgrad(c, 0, 14, fur), 0.6);
  shape(
    c,
    'M-7 -3 L-6.5 -11 L-2 -6 Q0 -6.6 2 -6 L6.5 -11 L7 -3 Q7 4 0 4.5 Q-7 4 -7 -3 Z',
    rgrad(c, 0, -3, 8, fur),
    0.6,
  );
  for (const s of [-1, 1])
    shape(c, `M${s * 6.2} -9.2 L${s * 5.6} -5 L${s * 3.4} -6.4 Z`, '#d89a9a', 0);
  strokeP(c, 'M-4 -6 L-3 -3.6 M0 -6.2 L0 -4 M4 -6 L3 -3.6', '#5a5a60', 0.6);
  for (const s of [-1, 1]) {
    oval(c, s * 2.8, -1.8, 1.5, 1.1, '#9ad84a');
    oval(c, s * 2.8, -1.8, 0.35, 1, '#121010');
  }
  shape(c, 'M-0.9 0.6 L0.9 0.6 L0 1.6 Z', '#d87a8a', 0);
  strokeP(
    c,
    'M-1.5 1.8 L-6 1.2 M-1.5 2.4 L-6 2.8 M1.5 1.8 L6 1.2 M1.5 2.4 L6 2.8',
    'rgba(255,255,255,0.7)',
    0.3,
  );
  c.restore();
}

// ───────────────────────── Aurelian League ─────────────────────────

function chiton(c: Ctx, col: string, drape: string, border: string, w = 1): Path2D {
  const tp = torso(c, col, w);
  clipped(c, tp, () => {
    c.strokeStyle = shade(col, 0.8);
    c.lineWidth = 0.6;
    c.beginPath();
    for (let x = 30; x < 72; x += 4) {
      c.moveTo(x, 66);
      c.quadraticCurveTo(x + 1.5, 84, x - 1, 102);
    }
    c.stroke();
  });
  // Himation draped over the left shoulder and across the chest.
  const hp = shape(
    c,
    `M${50 - 50 * w} 102 C${50 - 50 * w} 86 ${50 - 45 * w} 70 ${50 - 28 * w} 67 Q38 64 42 60 Q50 74 74 102 Z`,
    vgrad(c, 60, 102, drape, 1.2, 0.65),
    0.7,
  );
  clipped(c, hp, () => {
    strokeP(
      c,
      'M30 70 Q44 82 56 102 M22 74 Q36 86 44 102 M38 64 Q50 80 66 102',
      shade(drape, 0.68),
      0.8,
    );
  });
  strokeP(c, 'M42.6 60.6 Q50 74 73.4 101.6', border, 1.6);
  return tp;
}

function laurel(c: Ctx, h: Head, col: string): void {
  for (const s of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (1.5 + s * (0.12 + i * 0.075));
      const x = h.x + Math.cos(a) * (h.rx + 1.5);
      const y = h.y - 4 + Math.sin(a) * (h.ry * 0.86);
      shape(
        c,
        ovalPath(x, y, 1.1, 2.6, a + Math.PI / 2 + s * 0.6),
        dgrad(c, x - 2, y - 2, x + 2, y + 2, col),
        0.35,
      );
    }
}

const aetheon: Painter = (c, bg) => {
  clouds(
    bg,
    [
      [8, 84, 12],
      [22, 92, 11],
      [92, 82, 12],
      [78, 94, 11],
      [14, 18, 8],
      [86, 14, 9],
    ],
    '#eef4fb',
    0.65,
  );
  rays(bg, 50, 30, 16, '#fff2c0', 0.12);
  // Great white wings.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const len = 34 - i * 3.4;
      const a = -0.95 + i * 0.3;
      const bx = 50 + s * 18;
      const by = 64 - i * 1.5;
      c.save();
      c.translate(bx, by);
      c.scale(s, 1);
      c.rotate(a);
      shape(
        c,
        `M0 -3 Q${len * 0.6} -6 ${len} -1 Q${len * 0.6} 4 0 3 Z`,
        vgrad(c, -6, 4, i % 2 ? '#f4f0e6' : '#e6e0d2'),
        0.5,
      );
      line(c, 2, 0, len * 0.9, -1, 0.35, '#c8bea8');
      c.restore();
    }
  }
  const hair = '#a8743a';
  const tp = chiton(c, '#f2eee4', '#3a62a8', GOLD, 1.04);
  void tp;
  brooch(c, 40, 64, 3, '#3a7ad8');
  neck(c, SKIN_A);
  face(c, H, {
    skin: SKIN_A,
    iris: '#5a8ac8',
    brow: shade(hair, 0.65),
    fierce: 0.3,
    mouth: 'calm',
    age: 0.6,
  });
  hairTop(c, H, hair, 'curls');
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++)
      disc(c, 50 + s * 14, 32 + i * 4, 2.1, rgrad(c, 50 + s * 14, 32 + i * 4, 2.1, hair));
  beard(c, H, hair, { len: 10, curls: true, width: 1.05 });
  laurel(c, H, '#e2b13c');
  // Sceptre topped with an eagle-wing finial.
  inked(c, 84, 102, 84, 28, 2.4, dgrad(c, 82, 28, 86, 102, GOLD));
  shape(
    c,
    'M84 28 Q78 22 76 16 Q82 18 84 22 Q86 18 92 16 Q90 22 84 28 Z',
    dgrad(c, 76, 16, 92, 28, GOLD),
    0.5,
  );
  disc(c, 84, 25, 1.6, rgrad(c, 84, 25, 1.6, '#7ac8ff'));
  fist(c, 84, 82, 1.1, SKIN_A, [96, 104], '#f2eee4');
};

const thalassine: Painter = (c, bg, fx) => {
  waves(bg, 74, '#2a8a9a', 0.7, 5, 9);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  glow(bg, 78, 18, 10, '#e0f4ff', 0.5);
  bg.restore();
  disc(bg, 78, 18, 5, 'rgba(236,248,255,0.85)');
  disc(bg, 80.5, 16.5, 4.4, 'rgba(60,110,130,0.7)');
  const hair = '#2f9a8e';
  // Hair flowing like the sea, curling into waves at the ends.
  hairBack(c, HF, hair, 86, 9, 4);
  for (const s of [-1, 1])
    for (const [dx, dy] of [
      [18, 84],
      [22, 72],
      [16, 64],
    ] as const) {
      const x = 50 + s * dx;
      strokeP(
        c,
        `M${x} ${dy} q${s * 3} -3 ${s * 1} -5.6 q${-s * 2.6} -0.8 ${-s * 2} 2`,
        '#d8fff4',
        0.8,
      );
    }
  const tp = torso(c, '#3a9ab8', 0.98, 69, 7);
  clipped(c, tp, () => {
    strokeP(c, 'M30 74 Q50 90 70 74 M24 84 Q50 100 76 84', '#7ad0e0', 0.9);
  });
  // Pearl strands.
  for (const [r, n] of [
    [11, 9],
    [14, 11],
  ] as const)
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (0.12 + (i / n) * 0.76);
      const x = 50 + Math.cos(a) * r;
      const y = 58 + Math.sin(a) * r * 0.7;
      disc(c, x, y, 1, rgrad(c, x, y, 1, '#f6f2ea'));
    }
  shape(c, ovalPath(50, 70.5, 2.2, 2.8), rgrad(c, 50, 70.5, 2.6, '#f8f4ff'), 0.4);
  neck(c, '#e6c0a0', 5.6);
  face(c, HF, {
    skin: '#e6c0a0',
    female: true,
    iris: '#2aa0a0',
    brow: shade(hair, 0.6),
    fierce: 0,
    mouth: 'smile',
    lips: '#c0605a',
  });
  hairTop(c, HF, hair, 'part');
  // Crown of coral and a scallop shell.
  for (const s of [-1, 1]) {
    strokeP(
      c,
      `M${50 + s * 6} 26 L${50 + s * 10} 16 M${50 + s * 8.4} 20 L${50 + s * 13} 18 M${50 + s * 9.4} 18 L${50 + s * 9} 12`,
      INK,
      2.2,
    );
    strokeP(
      c,
      `M${50 + s * 6} 26 L${50 + s * 10} 16 M${50 + s * 8.4} 20 L${50 + s * 13} 18 M${50 + s * 9.4} 18 L${50 + s * 9} 12`,
      '#e8584a',
      1.4,
    );
  }
  const shell = shape(
    c,
    'M50 28 L42.5 18.5 Q50 10 57.5 18.5 Z',
    dgrad(c, 42, 10, 58, 28, '#f6d8c0'),
    0.6,
  );
  clipped(c, shell, () => {
    for (let i = -3; i <= 3; i++) line(c, 50, 28, 50 + i * 2.6, 12, 0.5, '#c89a80');
  });
  // Trident.
  inked(c, 84, 102, 84, 24, 2.2, dgrad(c, 82, 24, 86, 102, '#d8b04a'));
  strokeP(c, 'M77 22 Q77 28 84 28 Q91 28 91 22', INK, 3.4);
  strokeP(c, 'M77 22 Q77 28 84 28 Q91 28 91 22', '#d8b04a', 2.2);
  for (const x of [77, 84, 91])
    spearHead(c, x, x === 84 ? 22 : 23, x === 84 ? 10 : 7, 2.6, '#e6c060');
  fist(c, 84, 80, 1.05, '#e6c0a0', [96, 104]);
  snow(fx, 8, 81, 0.6, '#e0fbff');
};

const kalyra: Painter = (c, bg, fx) => {
  stalks(bg, '#e0b050', 0.55, 21, 10);
  // Rising embers.
  const rnd = seeded(5);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) glow(bg, 20 + rnd() * 60, 10 + rnd() * 60, 1.6, '#ffb040', 0.8);
  bg.restore();
  const hair = '#6a3420';
  // Headscarf (veil pulled over the back of the head) in warm madder red.
  shape(c, 'M26 80 C20 50 26 14 50 13 C74 14 80 50 74 80 Z', vgrad(c, 13, 80, '#b8502e'), 0.7);
  torso(c, '#c8883a', 1);
  shape(
    c,
    'M4 102 C4 84 14 70 30 66 Q40 62 42 56 L38 102 Z M96 102 C96 84 86 70 70 66 Q60 62 58 56 L62 102 Z',
    vgrad(c, 56, 102, '#b8502e'),
    0.7,
  );
  neck(c, SKIN_A, 5.8);
  face(c, HF, {
    skin: SKIN_A,
    female: true,
    iris: '#7a4a22',
    brow: shade(hair, 0.7),
    fierce: 0,
    mouth: 'smile',
    lips: '#b0503e',
    age: 0.3,
  });
  hairTop(c, HF, hair, 'part');
  strokeP(c, 'M36 31 Q50 23 64 31', '#e2b13c', 1);
  // Wheat sheaf over the shoulder.
  for (let i = 0; i < 5; i++) {
    const x = 14 + i * 2.4;
    line(c, x + 6, 100, x - 2, 52, 0.8, '#b8903a');
    for (let k = 0; k < 4; k++) {
      oval(c, x - 2.6, 54 + k * 2.4, 0.9, 1.8, '#e8c060', -0.4);
      oval(c, x - 0.8, 55 + k * 2.4, 0.9, 1.8, '#e8c060', 0.4);
    }
  }
  // The hearth: a bronze brazier with fire held before her.
  shape(c, 'M34 84 L66 84 Q64 96 50 97 Q36 96 34 84 Z', dgrad(c, 34, 84, 66, 97, '#c87a3a'), 0.7);
  strokeP(c, 'M36 87 L64 87', shade('#c87a3a', 0.6), 0.7);
  shape(c, ovalPath(50, 84, 16, 2.6), '#5a2a14', 0.6);
  fist(c, 32, 90, 1, SKIN_A, [22, 104], '#b8502e');
  fist(c, 68, 90, 1, SKIN_A, [78, 104], '#b8502e');
  const flame =
    'M40 84 Q36 76 42 70 Q42 76 45 76 Q44 66 50 60 Q50 70 54 72 Q56 66 58 68 Q64 76 60 84 Z';
  shape(c, flame, vgrad(c, 60, 84, '#f08a20', 1.3, 0.85), 0);
  shape(
    c,
    'M44 84 Q42 78 46 74 Q47 78 49 78 Q49 70 52 68 Q53 75 56 76 Q58 80 56 84 Z',
    vgrad(c, 68, 84, '#ffd860', 1.2, 0.95),
    0,
  );
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 76, 18, '#ff9a30', 0.4);
  fx.restore();
};

const dromos: Painter = (c, bg) => {
  // A phalanx of spears fanning out behind.
  bg.save();
  bg.globalAlpha = 0.45;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.17;
    const x1 = 50 + Math.cos(a) * 60;
    const y1 = 96 + Math.sin(a) * 60;
    line(bg, 50, 96, x1, y1, 1, '#4a3222');
    bg.save();
    bg.translate(x1, y1);
    bg.rotate(a + Math.PI / 2);
    bg.fillStyle = '#d8a050';
    bg.beginPath();
    bg.moveTo(0, -6);
    bg.lineTo(1.6, 0);
    bg.lineTo(-1.6, 0);
    bg.closePath();
    bg.fill();
    bg.restore();
  }
  bg.restore();
  const hair = '#1e1612';
  torso(c, '#9a2a24', 1.08);
  // Bronze muscle cuirass.
  const cu = shape(
    c,
    'M24 102 L26 72 Q36 64 43 62 L57 62 Q64 64 74 72 L76 102 Z',
    dgrad(c, 24, 62, 76, 102, '#c8893a'),
    0.7,
  );
  clipped(c, cu, () => {
    strokeP(
      c,
      'M32 80 Q41 86 49 80 M51 80 Q59 86 68 80 M50 70 L50 100 M38 92 Q50 96 62 92',
      shade('#c8893a', 0.6),
      0.9,
    );
    strokeP(c, 'M30 74 Q38 70 46 72', 'rgba(255,240,200,0.5)', 0.9);
  });
  // Leather pteruges at the shoulders.
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = 50 + s * (26 + i * 4.2);
      shape(
        c,
        `M${x - 2} ${70 + i * 1.6} L${x + 2} ${70 + i * 1.6} L${x + 2} ${82 + i * 1.6} L${x - 2} ${82 + i * 1.6} Z`,
        vgrad(c, 70, 84, '#7a4a2a'),
        0.4,
      );
    }
  neck(c, SKIN_A, 7);
  face(c, H, { skin: SKIN_A, iris: '#4a2e1a', brow: hair, fierce: 1, mouth: 'stern', age: 0.2 });
  strokeP(c, 'M43 44 L47 49', 'rgba(150,60,50,0.6)', 0.6);
  beard(c, H, hair, { len: 5, width: 1 });
  // Corinthian helmet pushed back on the head, transverse red crest.
  const helm = shape(
    c,
    'M35.5 32 Q35 13 50 12 Q65 13 64.5 32 L60 31 Q58 26 50 26 Q42 26 40 31 Z',
    dgrad(c, 35, 12, 65, 32, '#c8893a'),
    0.7,
  );
  clipped(c, helm, () => {
    strokeP(c, 'M41 30 Q42 25 46 25 L48 30 M59 30 Q58 25 54 25 L52 30', '#1a1008', 1.2);
    line(c, 39, 18, 43, 15, 0.8, 'rgba(255,240,200,0.6)');
  });
  shape(
    c,
    'M28 16 Q28 2 50 1 Q72 2 72 16 Q60 12 50 13.4 Q40 12 28 16 Z',
    vgrad(c, 1, 16, '#c8302a'),
    0.7,
  );
  strokeP(
    c,
    'M33 12 Q40 5 50 4.6 M67 12 Q60 5 50 4.6 M38 13 L37 6 M44 12 L44 3.4 M56 12 L56 3.4 M62 13 L63 6',
    '#7a1a14',
    0.6,
  );
  // Hoplite shield with a spearhead blazon.
  const sh = shape(c, ovalPath(10, 84, 24, 24), dgrad(c, -14, 60, 34, 108, '#c8893a'), 0.8);
  clipped(c, sh, () => {
    disc(c, 10, 84, 20, dgrad(c, -10, 64, 30, 104, '#9a2a24'));
    spearHead(c, 14, 92, 18, 4, '#e6c060');
  });
  // Spear.
  inked(c, 84, 102, 84, 14, 2.4, vgrad(c, 14, 102, '#6a4426'));
  spearHead(c, 84, 15, 12, 4.2, '#e0a850');
  fist(c, 84, 78, 1.1, SKIN_A, [96, 104]);
};

const lyssia: Painter = (c, bg, fx) => {
  // Streaming wind.
  bg.save();
  bg.globalAlpha = 0.55;
  bg.strokeStyle = '#f2fbff';
  bg.lineCap = 'round';
  for (const [y, x, len, w] of [
    [18, 4, 40, 1.4],
    [30, 60, 34, 1.2],
    [56, 2, 30, 1.6],
    [70, 64, 34, 1.3],
    [84, 10, 28, 1.1],
    [44, 72, 26, 1],
  ] as const) {
    bg.lineWidth = w;
    bg.beginPath();
    bg.moveTo(x, y);
    bg.bezierCurveTo(x + len * 0.4, y - 4, x + len * 0.7, y + 4, x + len, y);
    bg.arc(x + len, y - 3, 3, Math.PI / 2, -Math.PI, true);
    bg.stroke();
  }
  bg.restore();
  const hair = '#c87a3a';
  // Ribbon streaming behind.
  shape(c, 'M58 60 Q80 50 98 58 Q90 62 99 70 Q80 64 60 68 Z', vgrad(c, 50, 70, '#e8604a'), 0.6);
  torso(c, '#9ad0e8', 0.94, 69, 7);
  // Exomis: one shoulder bare.
  shape(c, 'M6 102 C6 86 12 72 28 68 Q34 66 40 62 Q48 76 58 102 Z', vgrad(c, 62, 102, SKIN_A), 0.6);
  strokeP(c, 'M44 62 L64 102', '#6a4426', 2.4);
  neck(c, SKIN_A, 5.4);
  face(c, HF, {
    skin: SKIN_A,
    female: true,
    iris: '#8a6a2a',
    brow: shade(hair, 0.7),
    fierce: 0.1,
    mouth: 'smile',
    lips: '#c0584a',
  });
  // Short windswept hair streaming to the right.
  hairTop(c, HF, hair, 'fringe');
  shape(c, 'M60 28 Q72 22 82 26 Q74 28 80 32 Q70 32 62 36 Z', vgrad(c, 22, 36, hair), 0.5);
  shape(c, 'M62 36 Q72 36 78 42 Q70 41 63 43 Z', vgrad(c, 36, 43, hair), 0.5);
  // Winged headband.
  strokeP(c, 'M37.5 31 Q50 26 62.5 31', GOLD, 1.4);
  for (const s of [-1, 1]) {
    c.save();
    c.translate(50 + s * 13, 30);
    c.scale(s, 1);
    for (let i = 0; i < 3; i++)
      shape(
        c,
        `M0 ${-i * 1.2} Q${5 + i} ${-6 - i * 2.6} ${10 - i} ${-9 - i * 2.4} Q${6} ${-2 - i * 1.4} 0 ${1 - i * 1.2} Z`,
        vgrad(c, -16, 1, i % 2 ? '#ffffff' : '#e8eef4'),
        0.45,
      );
    c.restore();
  }
  fx.save();
  fx.globalAlpha = 0.7;
  fx.strokeStyle = '#ffffff';
  fx.lineWidth = 0.7;
  fx.lineCap = 'round';
  for (const y of [48, 54, 60]) {
    fx.beginPath();
    fx.moveTo(8, y);
    fx.lineTo(24, y - 1);
    fx.stroke();
  }
  fx.restore();
};

const orros: Painter = (c, bg) => {
  // Ashlar wall and a fluted column.
  bg.save();
  bg.globalAlpha = 0.45;
  bg.strokeStyle = '#3a3228';
  bg.lineWidth = 0.6;
  bg.fillStyle = '#b8ab98';
  bg.fillRect(0, 0, 100, 100);
  for (let row = 0; row < 10; row++) {
    const y = row * 10;
    bg.beginPath();
    bg.moveTo(0, y);
    bg.lineTo(100, y);
    for (let x = (row % 2) * 9; x < 100; x += 18) {
      bg.moveTo(x, y);
      bg.lineTo(x, y + 10);
    }
    bg.stroke();
  }
  bg.restore();
  bg.save();
  bg.globalAlpha = 0.7;
  bg.fillStyle = vgrad(bg, 0, 100, '#e6dccb');
  bg.fillRect(6, 0, 14, 100);
  bg.strokeStyle = '#a89a84';
  for (const x of [9, 12, 15, 18]) line(bg, x, 0, x, 100, 0.7, '#a89a84');
  bg.restore();
  const beardC = '#3a281c';
  torso(c, '#8a7e6a', 1.16, 67, 9);
  // Bare chest under a work exomis knotted at the shoulder.
  shape(c, 'M40 56 Q50 60 60 56 L64 102 L36 102 Z', vgrad(c, 56, 102, SKIN_A), 0.6);
  strokeP(c, 'M42 74 Q46 77 50 74 Q54 77 58 74', shade(SKIN_A, 0.7), 0.7);
  shape(c, 'M6 102 C6 84 14 70 30 66 L42 58 L46 102 Z', vgrad(c, 58, 102, '#8a7e6a'), 0.7);
  // Leather apron strap and chisel.
  strokeP(c, 'M54 102 L58 88 L76 72', '#6a4426', 2.6);
  neck(c, SKIN_A, 8);
  const hp = { ...H, rx: 13.6 };
  face(c, hp, {
    skin: SKIN_A,
    iris: '#4a3a2a',
    brow: beardC,
    fierce: 0.5,
    mouth: 'calm',
    age: 0.7,
    browW: 2,
  });
  // Bald crown with a fringe of short hair at the sides.
  for (const s of [-1, 1])
    shape(
      c,
      `M${50 + s * 13.6} 42 Q${50 + s * 15} 34 ${50 + s * 12.6} 28 L${50 + s * 11} 34 Z`,
      beardC,
      0.4,
    );
  strokeP(c, 'M42 23 Q45 21 48 22', 'rgba(255,240,220,0.6)', 1);
  beard(c, hp, beardC, { len: 13, width: 1.2, curls: true });
  // Stonemason's mallet over the shoulder.
  inked(c, 70, 82, 86, 34, 3, vgrad(c, 34, 82, '#8a6036'));
  c.save();
  c.translate(87, 30);
  c.rotate(0.32);
  shape(c, 'M-8 -6 L8 -6 L8.6 6 L-8.6 6 Z', dgrad(c, -8, -6, 8, 6, '#a07444'), 0.7);
  strokeP(c, 'M-8 -2 L8 -2 M-8.4 2.4 L8.4 2.4', '#6a4426', 0.6);
  c.restore();
  fist(c, 74, 72, 1.15, SKIN_A, [90, 102]);
};

const phaedra: Painter = (c, bg, fx) => {
  clouds(
    bg,
    [
      [10, 16, 13],
      [30, 6, 13],
      [56, 4, 13],
      [80, 10, 13],
      [96, 26, 12],
      [6, 40, 10],
    ],
    '#4a3c6a',
    0.7,
  );
  bolt(
    bg,
    [
      [90, 34],
      [82, 50],
      [88, 52],
      [78, 74],
    ],
    '#e0c8ff',
    1.4,
  );
  bg.save();
  bg.globalAlpha = 0.35;
  for (let i = 0; i < 18; i++)
    line(bg, 8 + i * 5.4, 30 + (i % 3) * 8, 4 + i * 5.4, 44 + (i % 3) * 8, 0.5, '#d0c8f0');
  bg.restore();
  const hair = '#2a1e3a';
  // Wild, charged hair lifting outward.
  shape(
    c,
    'M50 12 C30 6 16 20 22 34 C12 40 16 56 24 62 C22 72 30 80 36 74 L64 74 C70 80 78 72 76 62 C84 56 88 40 78 34 C84 20 70 6 50 12 Z',
    vgrad(c, 8, 80, hair, 1.3, 0.8),
    0.7,
  );
  strokeP(
    c,
    'M26 30 Q22 24 26 18 M20 46 Q14 44 16 38 M78 30 Q82 24 78 18 M80 46 Q86 44 84 38',
    shade(hair, 1.6),
    0.7,
  );
  torso(c, '#3a2e6a', 0.96, 69, 7);
  shape(
    c,
    'M4 102 C4 84 12 72 28 68 Q38 64 50 74 Q62 64 72 68 C88 72 96 84 96 102 L84 102 Q66 80 50 82 Q34 80 16 102 Z',
    vgrad(c, 64, 102, '#8a8aa8'),
    0.7,
  );
  strokeP(c, 'M28 68 Q38 64 50 74 Q62 64 72 68', '#d8d8f0', 1);
  neck(c, SKIN_A, 5.6);
  face(c, HF, {
    skin: SKIN_A,
    female: true,
    brow: hair,
    fierce: 0.8,
    mouth: 'stern',
    lips: '#8a3a5a',
    left: 'glow',
    right: 'glow',
    glow: '#e8dcff',
  });
  hairTop(c, HF, hair, 'part');
  strokeP(c, 'M38 30 Q50 25 62 30', '#c8ccd8', 1.1);
  shape(c, 'M50 25 L52 28.4 L50 31.8 L48 28.4 Z', '#b08aff', 0.4);
  // Thunderbolt raised in her hand.
  const tb = 'M24 60 L19 44 L23 44 L17 26 L28 46 L24 46 L29 60 Z';
  shape(c, tb, vgrad(c, 26, 58, '#fff6c8', 1, 0.9), 0.5);
  fist(c, 23, 62, 1.05, SKIN_A, [12, 100], '#3a2e6a');
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 22, 40, 14, '#c8b0ff', 0.5);
  fx.restore();
  bolt(
    fx,
    [
      [17, 26],
      [14, 20],
      [17, 18],
      [13, 10],
    ],
    '#f0e0ff',
    0.8,
  );
  eyeGlow(fx, HF, '#d8c8ff');
};

const ourion: Painter = (c, bg, fx) => {
  stars(bg, 26, 33, '#ffe8c0');
  mountains(bg, '#6a5a4a', 0.55, [
    [0, 80],
    [16, 62],
    [30, 74],
    [50, 56],
    [70, 72],
    [86, 60],
    [100, 70],
  ]);
  const bronze = '#b48a52';
  const tp = torso(c, '#6a5444', 1.22, 66, 11);
  // Rough stone pauldrons.
  for (const s of [-1, 1]) {
    shape(
      c,
      `M${50 + s * 20} 64 Q${50 + s * 36} 58 ${50 + s * 48} 72 L${50 + s * 49} 82 Q${50 + s * 34} 74 ${50 + s * 20} 76 Z`,
      dgrad(c, 50 + s * 20, 58, 50 + s * 49, 82, '#8a7a68'),
      0.7,
    );
    strokeP(
      c,
      `M${50 + s * 28} 66 L${50 + s * 30} 72 M${50 + s * 38} 66 L${50 + s * 36} 74`,
      '#4a4038',
      0.6,
    );
  }
  // Bare bronze chest with glowing cracks.
  const ch = shape(
    c,
    'M34 66 Q50 58 66 66 L68 102 L32 102 Z',
    dgrad(c, 32, 58, 68, 102, bronze),
    0.7,
  );
  clipped(c, ch, () => {
    strokeP(c, 'M38 76 Q44 80 49 76 M51 76 Q56 80 62 76 M50 68 L50 100', shade(bronze, 0.6), 0.8);
  });
  strokeP(fx, 'M40 86 L44 90 L42 96 M58 82 L62 88 L60 94 L63 100', '#ffb040', 0.6);
  void tp;
  neck(c, bronze, 9.5);
  const hb = { ...H, rx: 14.2, ry: 16.4 };
  face(c, hb, {
    skin: bronze,
    brow: '#4a3a2a',
    fierce: 0.9,
    mouth: 'stern',
    left: 'glow',
    right: 'glow',
    glow: '#ffc060',
    browW: 2.2,
  });
  // Blocky stone beard.
  const sb = '#7a6a5a';
  beard(c, hb, sb, { len: 9, width: 1.15, mouth: 'slot' });
  clipped(c, ovalPath(50, 62, 16, 10), () => {
    strokeP(c, 'M38 60 L62 60 M40 65 L60 65', shade(sb, 0.6), 0.6);
  });
  // Crown of jagged rock with a glowing heart.
  shape(
    c,
    'M35 30 L36 18 L41 23 L44 12 L50 20 L56 12 L59 23 L64 18 L65 30 Q50 26 35 30 Z',
    dgrad(c, 35, 12, 65, 30, '#8a7a68'),
    0.7,
  );
  disc(c, 50, 25, 1.8, rgrad(c, 50, 25, 1.8, '#ffb040'));
  strokeP(fx, 'M44 32 L46 36 L44 40 M57 46 L60 49', '#ffb040', 0.5);
  eyeGlow(fx, hb, '#ffb040');
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 25, 5, '#ffb040', 0.6);
  fx.restore();
};

// ───────────────────────── Sahrun Dominion ─────────────────────────

/** Broad Egyptian collar: concentric bead bands. */
function wesekh(c: Ctx, cols: string[], r0 = 9, y = 56, w = 1): void {
  const n = cols.length;
  for (let i = n - 1; i >= 0; i--) {
    const r = r0 + (i + 1) * 3;
    shape(
      c,
      `M${50 - r * 1.25 * w} ${y + 2} Q50 ${y + r * 1.5} ${50 + r * 1.25 * w} ${y + 2} L${50 + (r - 3) * 1.25 * w} ${y + 2} Q50 ${y + (r - 3) * 1.5} ${50 - (r - 3) * 1.25 * w} ${y + 2} Z`,
      cols[i]!,
      0.4,
    );
  }
  // Bead dots along the outer band.
  const r = r0 + n * 3 - 1.5;
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const x = 50 - r * 1.25 * w + t * r * 2.5 * w;
    const u = (x - 50) / (r * 1.25 * w);
    const yy = y + 2 + (1 - u * u) * (r * 1.5 - 2) * 0.5;
    disc(c, x, yy, 0.6, 'rgba(255,240,200,0.8)');
  }
}

/** Striped nemes headcloth with lappets falling on the chest. */
function nemes(c: Ctx, h: Head, a: string, b: string): void {
  const { x, y } = h;
  const p = shape(
    c,
    `M${x - 16} ${y - 4} Q${x - 17} ${y - 21} ${x} ${y - 22} Q${x + 17} ${y - 21} ${x + 16} ${y - 4} L${x + 20} ${y + 14} L${x + 18} ${y + 36} L${x + 11} ${y + 36} L${x + 11} ${y + 8} L${x - 11} ${y + 8} L${x - 11} ${y + 36} L${x - 18} ${y + 36} L${x - 20} ${y + 14} Z`,
    vgrad(c, y - 22, y + 36, a),
    0.7,
  );
  clipped(c, p, () => {
    c.strokeStyle = b;
    c.lineWidth = 1.3;
    c.beginPath();
    for (let yy = y - 20; yy < y + 40; yy += 3) {
      c.moveTo(x - 22, yy);
      c.quadraticCurveTo(x, yy - 4, x + 22, yy);
    }
    c.stroke();
  });
}

const solenkh: Painter = (c, bg, fx) => {
  rays(bg, 50, 22, 24, '#ffd870', 0.28, 0.06);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  glow(bg, 50, 22, 36, '#ffcc60', 0.5);
  bg.restore();
  const skin = SKIN_S;
  torso(c, skin, 1.04);
  nemes(c, H, '#e2b13c', '#2a4a9a');
  wesekh(c, ['#2a8a9a', '#e2b13c', '#2a4a9a', '#e2b13c'], 9, 56, 1.04);
  neck(c, skin, 6.6);
  face(c, H, { skin, iris: '#3a2410', brow: '#1a1210', kohl: true, fierce: 0.2, mouth: 'calm' });
  // Gold band on the brow and the uraeus.
  shape(c, 'M36 29 Q50 25 64 29 L64 32 Q50 28 36 32 Z', dgrad(c, 36, 25, 64, 32, GOLD), 0.5);
  // Sun disc above the head.
  disc(c, 50, 13, 11.5, INK);
  disc(c, 50, 13, 11, rgrad(c, 50, 13, 11, '#e8502a'));
  strokeP(c, ovalPath(50, 13, 11, 11), GOLD, 1.4);
  shape(
    c,
    'M47.6 30 Q46 24 48.4 20 Q50 17.6 51.6 20 Q54 24 52.4 30 Z',
    dgrad(c, 46, 18, 54, 30, GOLD),
    0.5,
  );
  disc(c, 50, 21, 1.2, '#2a8a9a');
  // Plaited false beard.
  shape(c, 'M47.6 56 L52.4 56 L52 66 Q50 67.5 48 66 Z', vgrad(c, 56, 67, '#2a4a9a'), 0.5);
  for (let yy = 58; yy < 66; yy += 2) line(c, 48, yy, 52, yy, 0.6, GOLD);
  // Arms crossed over the chest, the crook and the flail rising over the shoulders.
  inked(c, 47, 94, 31, 64, 2.4, dgrad(c, 28, 60, 48, 96, '#2a4a9a'));
  for (const t of [0.2, 0.45, 0.7]) {
    const x = 47 - 16 * t;
    const y = 94 - 30 * t;
    line(c, x - 1.2, y + 0.4, x + 1.2, y - 0.4, 1, GOLD);
  }
  strokeP(c, 'M31 64 Q26 56 29.5 51 Q33.5 47.5 36 52.5', INK, 3.6);
  strokeP(c, 'M31 64 Q26 56 29.5 51 Q33.5 47.5 36 52.5', dgrad(c, 26, 48, 36, 64, GOLD), 2.5);
  inked(c, 53, 94, 69, 64, 2.4, dgrad(c, 52, 60, 72, 96, GOLD));
  for (const dx of [0, 3, 6]) {
    const d = `M69 64 Q${74 + dx} ${63 + dx * 0.3} ${76 + dx * 0.8} ${72 + dx * 0.6}`;
    strokeP(c, d, INK, 2.4);
    strokeP(c, d, dx === 3 ? GOLD : '#2a4a9a', 1.5);
  }
  fist(c, 36, 74, 1.05, skin, [64, 100]);
  fist(c, 64, 74, 1.05, skin, [36, 100]);
  for (const x of [36, 64]) strokeP(c, `M${x - 4.6} 79.5 Q${x} 81 ${x + 4.6} 79.5`, GOLD, 1.4);
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 13, 15, '#ffb040', 0.4);
  fx.restore();
};

const meritAsha: Painter = (c, bg, fx) => {
  stars(bg, 30, 17);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  bg.fillStyle = 'rgba(230,236,255,0.75)';
  bg.beginPath();
  bg.arc(80, 18, 8, 0, Math.PI * 2);
  bg.arc(83.5, 16, 7, 0, Math.PI * 2, true);
  bg.fill('evenodd');
  bg.restore();
  wisps(bg, '#e8c890', 0.3, 51, 5);
  const veil = '#2e2c6a';
  // Veil from the crown over the shoulders.
  shape(
    c,
    'M50 9 C70 10 76 28 74 48 C80 64 94 76 98 102 L2 102 C6 76 20 64 26 48 C24 28 30 10 50 9 Z',
    vgrad(c, 9, 102, veil, 1.25, 0.65),
    0.7,
  );
  strokeP(c, 'M26 48 C20 64 6 76 2 102 M74 48 C80 64 94 76 98 102', GOLD, 1.4);
  clipped(
    c,
    new Path2D(
      'M50 9 C70 10 76 28 74 48 C80 64 94 76 98 102 L2 102 C6 76 20 64 26 48 C24 28 30 10 50 9 Z',
    ),
    () => {
      const rnd = seeded(29);
      for (let i = 0; i < 40; i++)
        disc(c, rnd() * 100, 10 + rnd() * 92, 0.45, 'rgba(255,236,190,0.7)');
    },
  );
  neck(c, SKIN_S, 5.4);
  face(c, HF, {
    skin: SKIN_S,
    female: true,
    iris: '#c8a040',
    brow: '#1a1210',
    kohl: true,
    fierce: 0.3,
    mouth: 'none',
  });
  // Inner veil framing the face.
  shape(
    c,
    'M34 50 C30 32 36 18 50 17.5 C64 18 70 32 66 50 L62 50 C64 34 60 25 50 25 C40 25 36 34 38 50 Z',
    vgrad(c, 17, 50, shade(veil, 1.2)),
    0.6,
  );
  strokeP(c, 'M38 50 C36 34 40 25 50 25 C60 25 64 34 62 50', GOLD, 0.9);
  // Translucent face veil from the nose down, with a fringe of gold coins.
  const fv = 'M36 44 Q50 41.5 64 44 L63 60 Q50 66 37 60 Z';
  c.save();
  c.globalAlpha = 0.82;
  shape(c, fv, vgrad(c, 42, 64, '#5a4a9a'), 0.5);
  c.restore();
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = 37 + t * 26;
    const y = 60 + Math.sin(t * Math.PI) * 5.2;
    disc(c, x, y + 1.2, 1, rgrad(c, x, y + 1.2, 1, GOLD));
  }
  strokeP(c, 'M36 44 Q50 41.5 64 44', GOLD, 0.8);
  // Diadem with a crescent and lapis drop.
  strokeP(c, 'M38 29.5 Q50 26 62 29.5', GOLD, 1);
  shape(
    c,
    'M46.4 25 A4 4 0 1 0 53.6 25 A3.4 3.4 0 1 1 46.4 25 Z',
    dgrad(c, 46, 22, 54, 30, '#e8e8f8'),
    0.4,
  );
  disc(c, 50, 31, 1.1, rgrad(c, 50, 31, 1.1, '#3a6ae0'));
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 40.5, 12, '#c8a0ff', 0.18);
  fx.restore();
};

const hetepra: Painter = (c, bg, fx) => {
  stalks(bg, '#d8c050', 0.6, 13, 13);
  // A few locusts.
  for (const [x, y, a] of [
    [16, 24, 0.3],
    [84, 30, -0.4],
    [76, 14, 0.2],
  ] as const) {
    bg.save();
    bg.translate(x, y);
    bg.rotate(a);
    bg.globalAlpha = 0.7;
    oval(bg, 0, 0, 3.4, 1, '#5a6a2a');
    oval(bg, -0.5, -1, 3, 0.9, 'rgba(230,240,200,0.7)', -0.3);
    oval(bg, -0.5, 1, 3, 0.9, 'rgba(230,240,200,0.7)', 0.3);
    bg.restore();
  }
  const wig = '#1a1414';
  // Long braided wig.
  shape(
    c,
    'M33 26 Q32 12 50 11 Q68 12 67 26 L70 70 L58 70 L58 50 L42 50 L42 70 L30 70 Z',
    vgrad(c, 11, 70, wig, 1.4, 0.8),
    0.7,
  );
  clipped(c, new Path2D('M30 26 L70 26 L70 70 L30 70 Z'), () => {
    for (let x = 31; x < 70; x += 2.2) line(c, x, 28, x, 70, 0.5, '#3a3030');
    for (const y of [40, 58, 68]) line(c, 29, y, 71, y, 1.2, GOLD);
  });
  torso(c, '#4a8a3a', 0.98, 69, 7);
  wesekh(c, ['#3aa05a', '#e2b13c', '#6ac07a', '#e2b13c'], 8, 57, 0.95);
  neck(c, SKIN_S, 5.6);
  face(c, HF, {
    skin: SKIN_S,
    female: true,
    iris: '#3a2a10',
    brow: '#1a1210',
    kohl: true,
    fierce: 0,
    mouth: 'smile',
    lips: '#8a3a2a',
  });
  shape(c, 'M36 31 Q50 21 64 31 L64 28 Q50 17 36 28 Z', vgrad(c, 17, 31, wig), 0.5);
  // Crown of wheat ears and lotus.
  shape(c, 'M39 26 Q50 22 61 26 L60 20 Q50 17 40 20 Z', dgrad(c, 39, 17, 61, 26, GOLD), 0.5);
  for (let i = -3; i <= 3; i++) {
    const x = 50 + i * 3.2;
    const top = 6 + Math.abs(i) * 1.8;
    line(c, x, 20, x + i * 0.6, top + 4, 0.7, '#a08a2a');
    for (let k = 0; k < 3; k++) {
      oval(c, x + i * 0.6 - 0.9, top + 2 + k * 2, 0.8, 1.5, '#e8c860', -0.4);
      oval(c, x + i * 0.6 + 0.9, top + 3 + k * 2, 0.8, 1.5, '#e8c860', 0.4);
    }
  }
  shape(
    c,
    'M50 22 Q46 16 48 12 Q50 15 50 15 Q50 15 52 12 Q54 16 50 22 Z',
    vgrad(c, 12, 22, '#7ac8e8'),
    0.4,
  );
  // Sheaf held at her shoulder, and a sickle.
  for (let i = 0; i < 6; i++) {
    const x = 74 + i * 2.2;
    line(c, x - 6, 100, x + 2, 48, 0.9, '#a08a2a');
    for (let k = 0; k < 4; k++) {
      oval(c, x + 1.2, 50 + k * 2.4, 0.9, 1.8, '#e8c060', -0.4);
      oval(c, x + 3, 51 + k * 2.4, 0.9, 1.8, '#e8c060', 0.4);
    }
  }
  strokeP(c, 'M72 76 L80 76', '#c8a040', 2.4);
  fist(c, 76, 78, 1, SKIN_S, [90, 104]);
  strokeP(c, 'M22 96 L28 74', INK, 3);
  strokeP(c, 'M22 96 L28 74', '#6a4426', 2);
  strokeP(c, 'M28 74 Q18 66 22 56 Q24 64 32 70', INK, 2.6);
  strokeP(c, 'M28 74 Q18 66 22 56 Q24 64 32 70', '#d8dce4', 1.6);
  void fx;
};

const seshkar: Painter = (c, bg) => {
  // Temple pylon behind.
  bg.save();
  bg.globalAlpha = 0.45;
  bg.fillStyle = vgrad(bg, 20, 100, '#c8a878');
  bg.beginPath();
  bg.moveTo(4, 100);
  bg.lineTo(12, 22);
  bg.lineTo(40, 22);
  bg.lineTo(40, 100);
  bg.moveTo(60, 100);
  bg.lineTo(60, 22);
  bg.lineTo(88, 22);
  bg.lineTo(96, 100);
  bg.fill();
  bg.strokeStyle = '#6a5034';
  bg.lineWidth = 0.6;
  for (let y = 30; y < 100; y += 8) {
    line(bg, 10, y, 40, y, 0.5, '#6a5034');
    line(bg, 60, y, 90, y, 0.5, '#6a5034');
  }
  bg.restore();
  const skin = '#8a5a3a';
  torso(c, skin, 1.06);
  nemes(c, { ...H, y: 42 }, '#1e3a7a', '#e2b13c');
  wesekh(c, ['#e2b13c', '#1e3a7a', '#e2b13c', '#c83a2a'], 9, 58, 1.04);
  // Jackal head, seen from the front: tall ears, long tapering muzzle, gilded eyes.
  const fur = '#26262c';
  for (const s of [-1, 1]) {
    shape(
      c,
      `M${50 + s * 5} 26 L${50 + s * 13} 3 L${50 + s * 16} 30 Z`,
      vgrad(c, 3, 30, fur, 1.3, 0.8),
      0.6,
    );
    shape(
      c,
      `M${50 + s * 7.5} 24 L${50 + s * 12.6} 9 L${50 + s * 14} 27 Z`,
      vgrad(c, 9, 27, '#c8902a'),
      0.4,
    );
  }
  const head = shape(
    c,
    'M36 32 Q36 18 50 18 Q64 18 64 32 Q64 42 58 48 L54 60 Q50 63 46 60 L42 48 Q36 42 36 32 Z',
    rgrad(c, 46, 30, 18, fur),
    0.7,
  );
  clipped(c, head, () => {
    shape(c, 'M45 40 Q50 38 55 40 L54 58 Q50 61 46 58 Z', vgrad(c, 38, 61, '#3a3a42'), 0);
    line(c, 50, 22, 50, 40, 0.9, '#45454e');
    strokeP(c, 'M38 30 Q44 26 48 30 M62 30 Q56 26 52 30', '#5a5a64', 0.7);
  });
  shape(c, ovalPath(50, 59, 3, 2), '#0c0c10', 0.4);
  disc(c, 49, 58.4, 0.6, 'rgba(255,255,255,0.4)');
  for (const s of [-1, 1]) {
    shape(
      c,
      `M${50 + s * 4.6} 33.5 Q${50 + s * 8} 31 ${50 + s * 11} 33 Q${50 + s * 8} 35.6 ${50 + s * 4.6} 33.5 Z`,
      '#e8b830',
      0.5,
    );
    disc(c, 50 + s * 7.8, 33.3, 0.9, '#1a1008');
    line(c, 50 + s * 11, 33, 50 + s * 13, 34.4, 0.8, '#e8b830');
  }
  // Was-sceptre.
  inked(c, 84, 102, 84, 18, 2.2, dgrad(c, 82, 18, 86, 102, '#e2b13c'));
  shape(
    c,
    'M84 18 L84 12 Q90 10 92 14 L88 16 Q86 15 85.6 18 Z',
    dgrad(c, 84, 10, 92, 18, '#e2b13c'),
    0.5,
  );
  fist(c, 84, 80, 1.1, skin, [96, 104]);
};

const nefrisa: Painter = (c, bg, fx) => {
  waves(bg, 82, '#d8a830', 0.6, 4, 17);
  const rnd = seeded(77);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) {
    const x = rnd() * 100;
    const y = rnd() * 80;
    glow(bg, x, y, 2.4, '#ffd860', 0.7);
    disc(bg, x, y, 0.5, '#fff6c0');
  }
  bg.restore();
  const wig = '#1a1630';
  shape(
    c,
    'M32 30 Q31 12 50 11 Q69 12 68 30 L71 64 L58 64 L58 48 L42 48 L42 64 L29 64 Z',
    vgrad(c, 11, 64, wig, 1.4, 0.8),
    0.7,
  );
  clipped(c, new Path2D('M28 24 L72 24 L72 64 L28 64 Z'), () => {
    for (let y = 30; y < 64; y += 4) line(c, 28, y, 72, y, 1, GOLD);
  });
  torso(c, '#f2ead8', 0.98, 69, 7);
  wesekh(c, [GOLD, '#c83a2a', GOLD, '#2a6ac8', GOLD], 7, 57, 1);
  neck(c, SKIN_S, 5.6);
  face(c, HF, {
    skin: SKIN_S,
    female: true,
    iris: '#7a5010',
    brow: '#1a1210',
    kohl: true,
    fierce: 0,
    mouth: 'calm',
    lips: '#a0402a',
  });
  // Gold earrings.
  for (const s of [-1, 1]) {
    shape(c, ovalPath(50 + s * 12.2, 46, 1.6, 2.6), rgrad(c, 50 + s * 12.2, 46, 2.4, GOLD), 0.4);
  }
  // Vulture crown: golden wings over the wig, the vulture's head on the brow.
  for (const s of [-1, 1]) {
    const wp = shape(
      c,
      `M50 15 Q${50 + s * 16} 15 ${50 + s * 18} 30 L${50 + s * 19} 46 Q${50 + s * 15} 40 ${50 + s * 13} 30 Q${50 + s * 10} 24 50 24 Z`,
      dgrad(c, 50 - 18, 14, 50 + 18, 46, GOLD),
      0.6,
    );
    clipped(c, wp, () => {
      for (let i = 0; i < 6; i++)
        strokeP(
          c,
          `M${50 + s * (6 + i * 2.2)} 18 Q${50 + s * (10 + i * 1.8)} 30 ${50 + s * (12 + i * 1.2)} 44`,
          shade(GOLD, 0.62),
          0.6,
        );
    });
  }
  shape(
    c,
    'M47.5 30 Q47 23 50 22 Q53 23 52.5 30 L51 31 L50 33.5 L49 31 Z',
    dgrad(c, 47, 22, 53, 34, GOLD),
    0.5,
  );
  disc(c, 51, 25.5, 0.6, '#1a1008');
  // Golden ankh held before her.
  fist(c, 50, 92, 1.05, SKIN_S, [58, 106]);
  strokeP(c, 'M50 86 L50 74 M44 76 L56 76', INK, 3.6);
  strokeP(c, 'M50 86 L50 74 M44 76 L56 76', GOLD, 2.6);
  strokeP(c, ovalPath(50, 70, 3.2, 4.2), INK, 3.6);
  strokeP(c, ovalPath(50, 70, 3.2, 4.2), GOLD, 2.4);
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 74, 10, '#ffd860', 0.35);
  fx.restore();
};

const ankharu: Painter = (c, bg) => {
  // Pyramid and a builder's grid.
  bg.save();
  bg.globalAlpha = 0.5;
  bg.fillStyle = vgrad(bg, 20, 90, '#d8b878');
  bg.beginPath();
  bg.moveTo(50, 14);
  bg.lineTo(100, 90);
  bg.lineTo(0, 90);
  bg.closePath();
  bg.fill();
  bg.fillStyle = 'rgba(80,50,30,0.35)';
  bg.beginPath();
  bg.moveTo(50, 14);
  bg.lineTo(100, 90);
  bg.lineTo(60, 90);
  bg.closePath();
  bg.fill();
  bg.strokeStyle = 'rgba(80,50,30,0.5)';
  bg.lineWidth = 0.5;
  for (let y = 22; y < 90; y += 6) {
    const half = ((y - 14) / 76) * 50;
    line(bg, 50 - half, y, 50 + half, y, 0.5, 'rgba(80,50,30,0.5)');
  }
  bg.restore();
  stars(bg, 10, 91);
  const skin = SKIN_S;
  // Close-fitting linen robe up to the neck, with a feather pattern.
  const tp = torso(c, '#efe6d0', 1, 68, 8);
  clipped(c, tp, () => {
    for (let row = 0; row < 7; row++)
      for (let x = (row % 2) * 3; x < 100; x += 6)
        strokeP(
          c,
          `M${x - 2.6} ${70 + row * 5} Q${x} ${74 + row * 5} ${x + 2.6} ${70 + row * 5}`,
          '#b8a888',
          0.5,
        );
  });
  wesekh(c, ['#2a5ac8', GOLD, '#2a8a9a', GOLD], 8, 56, 1);
  neck(c, skin, 6.4);
  face(c, H, {
    skin,
    iris: '#3a2410',
    brow: '#1a1210',
    kohl: true,
    fierce: 0.3,
    mouth: 'calm',
    age: 0.3,
  });
  // Lapis skullcap.
  const cap = shape(
    c,
    'M36.4 33 Q35.6 18 50 17 Q64.4 18 63.6 33 Q50 28.5 36.4 33 Z',
    dgrad(c, 36, 17, 64, 33, '#2a4ab8'),
    0.7,
  );
  clipped(c, cap, () => {
    line(c, 40, 22, 44, 19.5, 1, 'rgba(255,255,255,0.4)');
  });
  strokeP(c, 'M36.4 33 Q50 28.5 63.6 33', GOLD, 0.9);
  // Long straight false beard.
  shape(c, 'M46.5 56 L53.5 56 L53 72 L47 72 Z', vgrad(c, 56, 72, '#2a4ab8'), 0.5);
  for (let yy = 59; yy < 72; yy += 3) line(c, 47, yy, 53, yy, 0.6, GOLD);
  // Measuring rod (royal cubit) and set-square.
  shape(c, 'M81 102 L81 22 L86 22 L86 102 Z', dgrad(c, 81, 22, 86, 102, '#e2b13c'), 0.6);
  for (let y = 26; y < 100; y += 4) line(c, 81, y, y % 8 ? 83 : 84.5, y, 0.5, '#6a4a1a');
  fist(c, 83.5, 78, 1.1, skin, [96, 104], '#efe6d0');
  shape(c, 'M14 60 L18 60 L18 84 L38 84 L38 88 L14 88 Z', dgrad(c, 14, 60, 38, 88, '#9a6a3c'), 0.6);
  fist(c, 22, 82, 1, skin, [10, 104], '#efe6d0');
};

const kheprion: Painter = (c, bg, fx) => {
  // Dawn sky and the sun rising behind the shoulders.
  const g = bg.createLinearGradient(0, 30, 0, 100);
  g.addColorStop(0, 'rgba(255,140,120,0)');
  g.addColorStop(1, 'rgba(255,150,90,0.6)');
  bg.fillStyle = g;
  bg.fillRect(0, 0, 100, 100);
  rays(bg, 50, 84, 18, '#ffd0a0', 0.22, 0.07);
  bg.save();
  bg.globalCompositeOperation = 'lighter';
  glow(bg, 50, 84, 40, '#ffb070', 0.6);
  bg.restore();
  const skin = '#c08858';
  torso(c, skin, 1.02);
  wesekh(c, ['#2a9a8a', '#e2b13c', '#3ab8c8', '#e2b13c'], 8, 56, 1.02);
  // Scarab pectoral.
  shape(c, ovalPath(50, 80, 4, 5), dgrad(c, 46, 75, 54, 85, '#2a7a8a'), 0.5);
  line(c, 50, 76, 50, 85, 0.5, GOLD);
  for (const s of [-1, 1])
    shape(
      c,
      `M${50 + s * 3.6} 79 Q${50 + s * 12} 74 ${50 + s * 16} 78 Q${50 + s * 10} 82 ${50 + s * 3.6} 82 Z`,
      dgrad(c, 34, 74, 66, 82, '#3ab8c8'),
      0.4,
    );
  neck(c, skin, 6.4);
  face(c, H, { skin, iris: '#3a2410', brow: '#1a1210', kohl: true, fierce: 0.1, mouth: 'smile' });
  // Shaven head with a gold band; scarab wings sweep back at the temples.
  shape(c, 'M36.6 32 Q36 22 50 21 Q64 22 63.4 32 Q50 29 36.6 32 Z', 'rgba(60,30,20,0.18)', 0);
  strokeP(c, 'M37 32 Q50 28.5 63 32', GOLD, 1.6);
  for (const s of [-1, 1]) {
    c.save();
    c.translate(50 + s * 5, 27);
    c.scale(s, 1);
    for (let i = 0; i < 3; i++)
      shape(
        c,
        `M0 ${i * 1.6} Q10 ${-6 + i * 2} ${18 - i * 2} ${-4 + i * 3.4} Q10 ${2 + i * 1.6} 0 ${3 + i * 1.6} Z`,
        dgrad(c, 0, -6, 18, 6, ['#2a9a8a', '#3ab8c8', GOLD][i]!),
        0.45,
      );
    c.restore();
  }
  // The scarab on the brow pushing up the red dawn sun.
  disc(c, 50, 11, 7.5, INK);
  disc(c, 50, 11, 7, rgrad(c, 50, 11, 7, '#f0603a'));
  for (const s of [-1, 1]) strokeP(c, `M${50 + s * 2} 22 L${50 + s * 4} 17`, '#1a3a3a', 0.9);
  const sc = shape(c, ovalPath(50, 25, 4.4, 5.2), dgrad(c, 45, 20, 55, 30, '#2a6a7a'), 0.5);
  clipped(c, sc, () => line(c, 50, 22, 50, 30, 0.6, GOLD));
  shape(c, ovalPath(50, 19.6, 2.4, 1.6), '#1a3a3a', 0.4);
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  glow(fx, 50, 11, 12, '#ff9050', 0.4);
  fx.restore();
};

const nemur: Painter = (c, bg) => {
  // A vortex of swallowing sand.
  bg.save();
  bg.globalAlpha = 0.55;
  bg.translate(50, 70);
  for (let i = 0; i < 6; i++) {
    bg.strokeStyle = i % 2 ? '#c8a060' : '#8a6a3a';
    bg.lineWidth = 2.4;
    bg.beginPath();
    for (let t = 0; t < 2.4; t += 0.05) {
      const r = 6 + t * 18 + i * 1.6;
      const a = t * 2.6 + i * 1.05;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.5;
      if (t === 0) bg.moveTo(x, y);
      else bg.lineTo(x, y);
    }
    bg.stroke();
  }
  bg.restore();
  const skin = '#6a5a4a';
  torso(c, '#2a4a4a', 1.08);
  wesekh(c, ['#e2b13c', '#1a6a5a', '#e2b13c', '#3a9a7a'], 9, 58, 1.06);
  nemes(c, { ...H, y: 44 }, '#1a4a3a', '#c8a040');
  // Crocodile head in profile, jaws to the right, studded with scutes.
  const croc = '#4a6a3a';
  const hp = shape(
    c,
    'M34 36 Q34 20 48 20 Q58 20 62 30 L88 36 Q94 38 92 44 L66 48 L62 54 Q52 60 42 56 Q34 50 34 36 Z',
    dgrad(c, 34, 20, 92, 56, croc),
    0.7,
  );
  clipped(c, hp, () => {
    shape(c, 'M60 44 L92 42 L92 48 L64 52 Z', vgrad(c, 42, 52, '#b8b088'), 0);
    for (let x = 64; x < 90; x += 4)
      strokeP(c, `M${x} 39 Q${x + 2} 38 ${x + 4} 39`, shade(croc, 0.6), 0.6);
    for (let i = 0; i < 4; i++) disc(c, 40 + i * 4, 26 + (i % 2) * 2, 1.4, shade(croc, 1.25));
  });
  strokeP(c, 'M62 44 L92 42', '#1a2a14', 0.9);
  c.fillStyle = '#f2ead0';
  c.beginPath();
  for (let x = 66; x < 90; x += 3.6) {
    c.moveTo(x, 43.6);
    c.lineTo(x + 1, 46.4);
    c.lineTo(x + 2, 43.4);
  }
  c.fill();
  shape(c, ovalPath(55, 31, 3.4, 2.6), shade(croc, 1.2), 0.5);
  shape(c, ovalPath(55.6, 31, 2, 1.5), '#f0c030', 0.3);
  oval(c, 55.8, 31, 0.5, 1.4, '#1a1008');
  disc(c, 89, 38.4, 0.8, '#1a2a14');
  // Tall twin plumes.
  for (const s of [-1, 1])
    shape(
      c,
      `M${50 + s * 0.8} 21 Q${50 + s * 7} 10 ${50 + s * 4} -2 Q${50 + s * 1.6} 8 ${50 + s * 0.8} 21 Z`,
      vgrad(c, -2, 21, s < 0 ? '#3a6ab8' : '#2a8a9a'),
      0.5,
    );
  // Was-sceptre on the left.
  inked(c, 18, 102, 18, 30, 2.2, dgrad(c, 16, 30, 20, 102, '#e2b13c'));
  shape(
    c,
    'M18 30 L18 24 Q24 22 26 26 L22 28 Q20 27 19.6 30 Z',
    dgrad(c, 18, 22, 26, 30, '#e2b13c'),
    0.5,
  );
  fist(c, 18, 82, 1.05, skin, [6, 104]);
};

const PAINTERS: Record<string, Painter> = {
  thunrak: thor,
  veyla: odin,
  hrodna: skadi,
  skarn: ullr,
  brakka: tyr,
  eldra: heimdall,
  gorm: hel,
  sigrun: freyja,
  aetheon,
  thalassine,
  kalyra,
  dromos,
  lyssia,
  orros,
  phaedra,
  ourion,
  solenkh,
  merit_asha: meritAsha,
  hetepra,
  seshkar,
  nefrisa,
  ankharu,
  kheprion,
  nemur,
};

/** True when a god has its own painted bust. */
export function hasGodBust(godId: string): boolean {
  return godId in PAINTERS;
}

/**
 * Paint the bust of a god on a transparent `size`×`size` canvas (pass twice the display size for
 * crisp results). Backdrop motifs fill the square, so callers usually clip it to a circle.
 */
export function drawGodBust(godId: string, size: number): HTMLCanvasElement {
  const painter = PAINTERS[godId] ?? thor;
  const k = size / 100;
  PX = k;
  const [bgc, bg] = createCanvas(size, size);
  const [fig, c] = createSoftCanvas(size, size);
  const [fxc, fx] = createCanvas(size, size);
  for (const ctx of [bg, c, fx]) ctx.scale(k, k);
  painter(c, bg, fx);
  sunlight(fig, size, Math.max(1.4, size / 120), true);
  const [out, o] = createCanvas(size, size);
  o.drawImage(bgc, 0, 0);
  o.drawImage(outlined(fig, Math.max(1.5, size / 110)), 0, 0);
  o.drawImage(fxc, 0, 0);
  return out;
}
