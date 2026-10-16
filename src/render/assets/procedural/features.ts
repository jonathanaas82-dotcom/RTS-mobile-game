import { TILE_PX } from '../tileset';
import { ART_RES, createCanvas, outlined, rgrad, seeded, shade, softShadow } from './draw';

type Ctx = CanvasRenderingContext2D;

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

/** Compose: soft shadow, then an outlined figure drawn by `draw` in world px (size w×h). */
function sprite(
  w: number,
  h: number,
  shadow: [number, number, number, number],
  draw: (c: Ctx) => void,
): HTMLCanvasElement {
  const [fig, c] = createCanvas(w * ART_RES, h * ART_RES);
  c.scale(ART_RES, ART_RES);
  draw(c);
  const [out, oc] = createCanvas(w * ART_RES, h * ART_RES);
  oc.scale(ART_RES, ART_RES);
  softShadow(oc, ...shadow, 0.4);
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.drawImage(outlined(fig, 3), 0, 0);
  return out;
}

type Pt = [number, number];

function poly(c: Ctx, pts: Pt[], fill: string | CanvasGradient): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/**
 * Faceted boulder lit from the upper left: a dark body, a mid-tone top face and a bright
 * north-west facet meeting at a ridge, with a few cracks.
 */
function facetRock(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rnd: () => number,
  base: string,
): void {
  const n = 8;
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const rr = 0.82 + rnd() * 0.25;
    pts.push([x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr]);
  }
  poly(c, pts, shade(base, 0.55));
  const ridge: Pt = [x + (rnd() - 0.3) * rx * 0.3, y - ry * 0.05 + (rnd() - 0.5) * ry * 0.2];
  // Top face: the upper half of the outline down to the ridge.
  const top = pts.filter(([, py]) => py <= y + ry * 0.25);
  poly(
    c,
    [...top.map(([px, py]): Pt => [px + (x - px) * 0.08, py + (y - py) * 0.12]), ridge],
    shade(base, 0.92),
  );
  // Sunlit north-west facet.
  const nw = pts.filter(([px, py]) => px <= x + rx * 0.1 && py <= y + ry * 0.1);
  if (nw.length >= 2)
    poly(
      c,
      [...nw.map(([px, py]): Pt => [px + (x - px) * 0.12, py + (y - py) * 0.16]), ridge],
      shade(base, 1.22),
    );
  c.strokeStyle = shade(base, 1.5);
  c.lineWidth = 1.1;
  c.beginPath();
  nw.forEach(([px, py], i) =>
    i
      ? c.lineTo(px + (x - px) * 0.12, py + (y - py) * 0.16)
      : c.moveTo(px + (x - px) * 0.12, py + (y - py) * 0.16),
  );
  c.stroke();
  c.strokeStyle = shade(base, 0.45);
  c.lineWidth = 0.9;
  for (let k = 0; k < 2; k++) {
    const sx = x + (rnd() - 0.5) * rx;
    const sy = y + (rnd() - 0.2) * ry * 0.6;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + (rnd() - 0.5) * rx * 0.4, sy + ry * (0.2 + rnd() * 0.25));
    c.stroke();
  }
}

/** A glowing seam of gold: a jagged bright streak with a warm halo and a few nuggets. */
function goldVein(c: Ctx, x: number, y: number, len: number, ang: number, rnd: () => number): void {
  const pts: Pt[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4 - 0.5;
    pts.push([
      x + Math.cos(ang) * len * t + (rnd() - 0.5) * 3,
      y + Math.sin(ang) * len * t + (rnd() - 0.5) * 3,
    ]);
  }
  const line = (w: number, col: string): void => {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.stroke();
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  line(7, 'rgba(255,200,60,0.22)');
  line(4, 'rgba(255,210,80,0.45)');
  line(2.2, '#e8a91c');
  line(1, '#fff2a8');
  for (const [px, py] of pts.slice(1, 4)) {
    if (rnd() < 0.5) continue;
    disc(c, px, py, 2.2, '#c98a12');
    disc(c, px - 0.5, py - 0.6, 1.3, '#ffe27a');
  }
}

/**
 * Gold mine (2×2 tiles): a craggy, moss-topped rock hill split by glowing gold seams, with a
 * timber-framed adit, a lantern, a rail track and an ore cart heaped with gold.
 */
export function generateGoldMine(): HTMLCanvasElement {
  const s = TILE_PX * 2;
  return sprite(s, s, [s * 0.56, s * 0.8, s * 0.46, s * 0.15], (c) => {
    const rnd = seeded(77);
    const stone = '#8d8476';
    // Back row of crags first, then the front ones (painted back to front).
    const rocks: Array<[number, number, number, number]> = [
      [0.5, 0.3, 0.2, 0.16],
      [0.3, 0.38, 0.17, 0.14],
      [0.7, 0.38, 0.18, 0.15],
      [0.2, 0.56, 0.15, 0.13],
      [0.8, 0.56, 0.16, 0.14],
      [0.36, 0.62, 0.15, 0.12],
      [0.66, 0.64, 0.15, 0.12],
    ];
    for (const [x, y, rx, ry] of rocks)
      facetRock(c, x * s, y * s, rx * s, ry * s, rnd, rnd() < 0.5 ? stone : '#9a8e7c');
    // Moss and grass tufts on the crests.
    for (const [x, y, rx] of rocks.slice(0, 3)) {
      for (let k = 0; k < 4; k++) {
        const mx = (x + (rnd() - 0.6) * rx) * s;
        const my = (y - 0.08 + rnd() * 0.04) * s;
        disc(c, mx, my, 2.5 + rnd() * 2.5, k % 2 ? '#5e8a3a' : '#7aa446');
      }
    }
    // Gold seams across the rock faces.
    const veins: Array<[number, number, number, number]> = [
      [0.46, 0.27, 16, 0.5],
      [0.3, 0.38, 14, -0.6],
      [0.72, 0.36, 15, 0.9],
      [0.2, 0.55, 12, 0.3],
      [0.82, 0.56, 13, -0.4],
      [0.64, 0.24, 9, -0.2],
    ];
    for (const [x, y, len, a] of veins) goldVein(c, x * s, y * s, len, a, rnd);
    // Adit: dark tunnel mouth with a warm glow inside and a heavy timber frame.
    const ex = s * 0.5;
    const ey = s * 0.74;
    const ew = s * 0.11;
    const eh = s * 0.2;
    c.fillStyle = '#140c06';
    c.beginPath();
    c.moveTo(ex - ew, ey);
    c.lineTo(ex - ew, ey - eh * 0.75);
    c.quadraticCurveTo(ex, ey - eh * 1.15, ex + ew, ey - eh * 0.75);
    c.lineTo(ex + ew, ey);
    c.fill();
    const glow = c.createRadialGradient(ex, ey - eh * 0.25, 1, ex, ey - eh * 0.25, ew * 1.1);
    glow.addColorStop(0, 'rgba(255,190,80,0.75)');
    glow.addColorStop(1, 'rgba(255,150,40,0)');
    c.fillStyle = glow;
    c.fillRect(ex - ew, ey - eh, ew * 2, eh);
    const beam = (x0: number, y0: number, x1: number, y1: number, w: number): void => {
      c.strokeStyle = '#3a2614';
      c.lineWidth = w + 2;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.strokeStyle = '#8a6238';
      c.lineWidth = w;
      c.stroke();
      c.strokeStyle = 'rgba(255,220,160,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0 - w * 0.3, y0);
      c.lineTo(x1 - w * 0.3, y1);
      c.stroke();
    };
    c.lineCap = 'butt';
    beam(ex - ew - 1, ey + 1, ex - ew - 1, ey - eh * 0.85, 4);
    beam(ex + ew + 1, ey + 1, ex + ew + 1, ey - eh * 0.85, 4);
    beam(ex - ew - 5, ey - eh * 0.88, ex + ew + 5, ey - eh * 0.88, 4.5);
    // Lantern hanging from the lintel.
    c.strokeStyle = '#2a1c10';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(ex + ew - 3, ey - eh * 0.85);
    c.lineTo(ex + ew - 3, ey - eh * 0.68);
    c.stroke();
    const lg = c.createRadialGradient(
      ex + ew - 3,
      ey - eh * 0.62,
      0,
      ex + ew - 3,
      ey - eh * 0.62,
      7,
    );
    lg.addColorStop(0, 'rgba(255,230,140,0.95)');
    lg.addColorStop(0.4, 'rgba(255,180,60,0.5)');
    lg.addColorStop(1, 'rgba(255,160,40,0)');
    c.fillStyle = lg;
    c.fillRect(ex + ew - 10, ey - eh * 0.62 - 7, 14, 14);
    disc(c, ex + ew - 3, ey - eh * 0.62, 1.8, '#fff0b0');
    // Rails out of the adit.
    c.strokeStyle = '#4a3a2c';
    c.lineWidth = 1.2;
    for (const k of [-1, 1]) {
      c.beginPath();
      c.moveTo(ex + k * ew * 0.5, ey);
      c.lineTo(ex + k * ew * 0.9 + s * 0.04, ey + s * 0.1);
      c.stroke();
    }
    c.strokeStyle = '#6b4a2e';
    c.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const t = 0.15 + k * 0.35;
      c.beginPath();
      c.moveTo(ex - ew * 0.75 + t * s * 0.03, ey + t * s * 0.1);
      c.lineTo(ex + ew * 1.15 + t * s * 0.04, ey + t * s * 0.1);
      c.stroke();
    }
    // Ore cart heaped with gold.
    const cx0 = s * 0.68;
    const cy0 = s * 0.76;
    disc(c, cx0 + 4, cy0 + 9, 3.2, '#2a1e14');
    disc(c, cx0 + 16, cy0 + 9, 3.2, '#2a1e14');
    for (let k = 0; k < 6; k++) {
      const gx = cx0 + 4 + k * 2.6;
      disc(c, gx, cy0 - 1 - (k % 2) * 1.5, 3, '#d49a1c');
      disc(c, gx - 0.8, cy0 - 2 - (k % 2) * 1.5, 1.5, '#ffe680');
    }
    c.fillStyle = '#6b4a2e';
    c.beginPath();
    c.moveTo(cx0, cy0);
    c.lineTo(cx0 + 21, cy0);
    c.lineTo(cx0 + 19, cy0 + 8);
    c.lineTo(cx0 + 2, cy0 + 8);
    c.fill();
    c.fillStyle = '#9a7048';
    c.fillRect(cx0, cy0, 21, 2);
    c.fillStyle = '#4a4440';
    c.fillRect(cx0 + 1.5, cy0 + 3, 18, 1.2);
    // A few loose nuggets and a pickaxe by the entrance.
    for (let k = 0; k < 4; k++) {
      const nx = s * (0.3 + rnd() * 0.1);
      const ny = s * (0.78 + rnd() * 0.06);
      disc(c, nx, ny, 2, '#c98a12');
      disc(c, nx - 0.5, ny - 0.5, 1.1, '#ffe27a');
    }
    c.strokeStyle = '#7a5634';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(s * 0.27, s * 0.86);
    c.lineTo(s * 0.37, s * 0.76);
    c.stroke();
    c.strokeStyle = '#9aa0a8';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(s * 0.33, s * 0.74);
    c.quadraticCurveTo(s * 0.37, s * 0.75, s * 0.41, s * 0.79);
    c.stroke();
  });
}

/** Berry bush (1×1 tile): a lush, painterly leaf dome hung with clusters of glossy berries. */
export function generateBerryBush(): HTMLCanvasElement {
  const s = TILE_PX;
  return sprite(s, s, [s * 0.55, s * 0.8, s * 0.4, s * 0.13], (c) => {
    const rnd = seeded(13);
    const leaf = '#3c8a3c';
    const blobs: Array<[number, number, number]> = [
      [0.5, 0.4, 0.2],
      [0.32, 0.5, 0.19],
      [0.68, 0.48, 0.2],
      [0.42, 0.62, 0.2],
      [0.62, 0.64, 0.19],
    ];
    for (const [bx, by, br] of blobs) {
      const x = bx * s;
      const y = by * s;
      const r = br * s;
      disc(c, x + 1, y + 2, r, shade(leaf, 0.5));
      for (let k = 0; k < 7; k++) {
        const a = rnd() * Math.PI * 2;
        disc(
          c,
          x + Math.cos(a) * r * 0.9 + 1,
          y + Math.sin(a) * r * 0.9 + 1.5,
          r * 0.3,
          shade(leaf, 0.5),
        );
      }
      disc(c, x - 0.4, y - 0.8, r * 0.86, shade(leaf, 0.82));
      for (let k = 0; k < 5; k++) {
        const a = -2.3 + (rnd() - 0.5) * 2;
        const d = r * (0.12 + rnd() * 0.42);
        disc(
          c,
          x + Math.cos(a) * d,
          y + Math.sin(a) * d,
          r * (0.25 + rnd() * 0.2),
          shade(leaf, 1 + rnd() * 0.2),
        );
      }
      disc(c, x - r * 0.4, y - r * 0.45, r * 0.12, shade(leaf, 1.45));
    }
    // Berry clusters: three to four glossy berries each, with a highlight.
    for (let i = 0; i < 7; i++) {
      const x = s * (0.26 + rnd() * 0.48);
      const y = s * (0.34 + rnd() * 0.36);
      for (let k = 0; k < 3 + (i % 2); k++) {
        const bx = x + (k % 2) * 3.2 - 1.5;
        const by = y + Math.floor(k / 2) * 3 - 1;
        disc(c, bx, by, 2.4, rgrad(c, bx, by, 2.4, '#d8324a'));
        disc(c, bx - 0.8, by - 0.8, 0.8, '#ffd8de');
      }
    }
  });
}

/** White ring used for tap / command feedback (tinted at runtime). */
export function generateRing(): HTMLCanvasElement {
  const s = 64;
  const [cv, c] = createCanvas(s, s);
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 10;
  c.beginPath();
  c.arc(s / 2, s / 2, s / 2 - 7, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = '#ffffff';
  c.lineWidth = 4;
  c.stroke();
  return cv;
}

/** Soft round particle (sparks, magic, dust when tinted). */
export function generateSpark(): HTMLCanvasElement {
  const s = 32;
  const [cv, c] = createCanvas(s, s);
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  return cv;
}

/** Large soft blob (smoke puffs, cloud shadows). */
export function generateSoft(): HTMLCanvasElement {
  const s = 128;
  const [cv, c] = createCanvas(s, s);
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  return cv;
}

/** Four-pointed glint for water sparkles and gold. */
export function generateGlint(): HTMLCanvasElement {
  const s = 24;
  const [cv, c] = createCanvas(s, s);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(s / 2, 0);
  c.quadraticCurveTo(s / 2 + 1.5, s / 2 - 1.5, s, s / 2);
  c.quadraticCurveTo(s / 2 + 1.5, s / 2 + 1.5, s / 2, s);
  c.quadraticCurveTo(s / 2 - 1.5, s / 2 + 1.5, 0, s / 2);
  c.quadraticCurveTo(s / 2 - 1.5, s / 2 - 1.5, s / 2, 0);
  c.fill();
  return cv;
}

/** Fishing spot (1×1 water tile): fish silhouettes under concentric ripples. No outline. */
export function generateFishSpot(): HTMLCanvasElement {
  const s = TILE_PX;
  const [cv, c] = createCanvas(s * ART_RES, s * ART_RES);
  c.scale(ART_RES, ART_RES);
  const fish = (x: number, y: number, ang: number, len: number): void => {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.fillStyle = 'rgba(10,32,48,0.55)';
    c.beginPath();
    c.ellipse(0, 0, len, len * 0.32, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-len * 0.9, 0);
    c.lineTo(-len * 1.45, -len * 0.38);
    c.lineTo(-len * 1.45, len * 0.38);
    c.closePath();
    c.fill();
    c.restore();
  };
  fish(s * 0.36, s * 0.42, 0.4, 7);
  fish(s * 0.64, s * 0.56, -2.6, 6);
  fish(s * 0.46, s * 0.68, 0.1, 5);
  c.strokeStyle = 'rgba(235,248,255,0.55)';
  for (const [r, a] of [
    [9, 0.6],
    [17, 0.4],
    [25, 0.22],
  ] as const) {
    c.globalAlpha = a;
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(s / 2, s / 2, r, r * 0.55, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = 1;
  for (const [x, y, r] of [
    [0.3, 0.3, 1.6],
    [0.7, 0.36, 1.2],
    [0.58, 0.28, 1],
  ] as const)
    disc(c, s * x, s * y, r, 'rgba(255,255,255,0.75)');
  return cv;
}

/** A small leaping fish (used for the occasional splash at fishing spots). */
export function generateFishJump(): HTMLCanvasElement {
  const s = 24;
  const [cv, c] = createCanvas(s * ART_RES, s * ART_RES);
  c.scale(ART_RES, ART_RES);
  const g = c.createLinearGradient(0, 6, 0, 18);
  g.addColorStop(0, '#d6e6ef');
  g.addColorStop(1, '#6f8ea4');
  c.fillStyle = g;
  c.strokeStyle = '#22323e';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(4, 14);
  c.quadraticCurveTo(12, 4, 20, 10);
  c.quadraticCurveTo(13, 16, 4, 14);
  c.moveTo(4, 14);
  c.lineTo(1, 9);
  c.lineTo(1, 18);
  c.closePath();
  c.fill();
  c.stroke();
  disc(c, 17, 10, 1, '#111');
  return cv;
}
