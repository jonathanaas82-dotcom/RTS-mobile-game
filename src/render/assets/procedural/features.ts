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

/** Gold mine (2×2 tiles): a rocky outcrop with glittering veins and a timbered entrance. */
export function generateGoldMine(): HTMLCanvasElement {
  const s = TILE_PX * 2;
  return sprite(s, s, [s * 0.54, s * 0.8, s * 0.44, s * 0.14], (c) => {
    const rnd = seeded(77);
    const rocks: Array<[number, number, number]> = [
      [0.3, 0.6, 0.2],
      [0.7, 0.58, 0.21],
      [0.5, 0.4, 0.26],
      [0.5, 0.66, 0.2],
      [0.22, 0.44, 0.13],
    ];
    for (const [x, y, r] of rocks)
      disc(c, x * s, y * s, r * s, rgrad(c, x * s, y * s, r * s, '#8f8578'));
    // Mine entrance with timber frame.
    c.fillStyle = '#1e140c';
    c.beginPath();
    c.moveTo(s * 0.4, s * 0.72);
    c.lineTo(s * 0.4, s * 0.52);
    c.quadraticCurveTo(s * 0.5, s * 0.44, s * 0.6, s * 0.52);
    c.lineTo(s * 0.6, s * 0.72);
    c.fill();
    c.strokeStyle = '#7a5634';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(s * 0.39, s * 0.73);
    c.lineTo(s * 0.39, s * 0.5);
    c.lineTo(s * 0.61, s * 0.5);
    c.lineTo(s * 0.61, s * 0.73);
    c.stroke();
    // Gold veins and nuggets.
    for (let i = 0; i < 18; i++) {
      const x = (0.18 + rnd() * 0.64) * s;
      const y = (0.24 + rnd() * 0.48) * s;
      if (x > s * 0.37 && x < s * 0.63 && y > s * 0.46) continue;
      const r = 2.5 + rnd() * 4;
      c.fillStyle = '#9c7414';
      c.beginPath();
      c.moveTo(x, y - r);
      c.lineTo(x + r, y);
      c.lineTo(x, y + r);
      c.lineTo(x - r, y);
      c.fill();
      c.fillStyle = '#ffd84a';
      c.beginPath();
      c.moveTo(x, y - r * 0.8);
      c.lineTo(x + r * 0.6, y);
      c.lineTo(x, y + r * 0.4);
      c.lineTo(x - r * 0.6, y);
      c.fill();
    }
    // Cart with ore.
    c.fillStyle = '#6b4a2e';
    c.fillRect(s * 0.66, s * 0.74, s * 0.16, s * 0.08);
    disc(c, s * 0.69, s * 0.83, 3, '#3a2a1a');
    disc(c, s * 0.79, s * 0.83, 3, '#3a2a1a');
    for (let k = 0; k < 4; k++) disc(c, s * (0.69 + k * 0.035), s * 0.735, 3, '#ffd84a');
  });
}

/** Berry bush (1×1 tile): leafy dome dotted with glossy berries. */
export function generateBerryBush(): HTMLCanvasElement {
  const s = TILE_PX;
  return sprite(s, s, [s * 0.55, s * 0.8, s * 0.38, s * 0.13], (c) => {
    const leaf = '#3c8a3c';
    const blobs: Array<[number, number, number]> = [
      [0.5, 0.56, 0.3],
      [0.32, 0.5, 0.2],
      [0.68, 0.48, 0.21],
      [0.5, 0.38, 0.2],
    ];
    for (const [x, y, r] of blobs) disc(c, x * s + 1, y * s + 2, r * s, shade(leaf, 0.55));
    for (const [x, y, r] of blobs)
      disc(c, x * s, y * s, r * s, rgrad(c, x * s, y * s, r * s, leaf));
    const rnd = seeded(13);
    for (let i = 0; i < 14; i++) {
      const x = s * (0.24 + rnd() * 0.52);
      const y = s * (0.3 + rnd() * 0.42);
      disc(c, x, y, 3, rgrad(c, x, y, 3, '#d8324a'));
      disc(c, x - 1, y - 1, 0.9, '#ffd0d6');
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
