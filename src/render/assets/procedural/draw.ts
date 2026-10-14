/** Small deterministic helpers for procedural placeholder art. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  return [c, ctx];
}

/**
 * Texture pixels per world pixel for detailed sprites (units, buildings, trees, resources).
 * Sprites are drawn at 2× and displayed at scale 1/ART_RES so they stay crisp when zoomed in.
 */
export const ART_RES = 2;

/** Multiply an #rrggbb colour's channels by `f` (0.5 = darker, 1.3 = lighter). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => Math.min(255, Math.max(0, Math.round(v * f)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const l = (s: number): number => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `#${((l(16) << 16) | (l(8) << 8) | l(0)).toString(16).padStart(6, '0')}`;
}

/** Vertical light-to-dark gradient for a shape spanning y0..y1. */
export function vgrad(
  c: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  color: string,
  light = 1.22,
  dark = 0.72,
): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

/** Diagonal (top-left lit) gradient. */
export function dgrad(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(color, 1.3));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, 0.65));
  return g;
}

/** Radial highlight gradient (sphere-like shading) centred up-left of (x, y). */
export function rgrad(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): CanvasGradient {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 1.35));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, 0.7));
  return g;
}

/**
 * Add a dark outline around the opaque pixels of `src` (classic readable RTS sprite look).
 * Returns a new canvas of the same size (content must leave `width` px of margin).
 */
export function outlined(
  src: HTMLCanvasElement,
  width = 3,
  color = 'rgba(28,20,14,0.92)',
): HTMLCanvasElement {
  const [sil, sc] = createCanvas(src.width, src.height);
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = color;
  sc.fillRect(0, 0, sil.width, sil.height);
  const [out, oc] = createCanvas(src.width, src.height);
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    oc.drawImage(sil, Math.cos(a) * width, Math.sin(a) * width);
  }
  oc.drawImage(src, 0, 0);
  return out;
}

/** Soft blurred contact shadow ellipse. */
export function softShadow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha = 0.35,
): void {
  const g = c.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(10,14,8,${alpha})`);
  g.addColorStop(0.7, `rgba(10,14,8,${alpha * 0.6})`);
  g.addColorStop(1, 'rgba(10,14,8,0)');
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  c.translate(-x, -y);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Sun direction for cast shadows: how far a shadow reaches right / down per unit of height. */
export const SHADOW_KX = 0.62;
export const SHADOW_KY = 0.22;

/**
 * Project a sprite's silhouette onto the ground as a soft cast shadow (sun from the north-west,
 * so shadows fall to the lower right). Pixels on the row `baseY` stay put; higher pixels are
 * sheared right and flattened. The result shares the source's top-left origin and is larger to
 * the right and bottom; its alpha fades with distance from the base.
 */
export function castShadow(src: HTMLCanvasElement, baseY: number, alpha = 0.32): HTMLCanvasElement {
  const kx = SHADOW_KX;
  const ky = SHADOW_KY;
  const W = Math.ceil(src.width + kx * baseY + 6);
  const H = Math.ceil(Math.max(src.height, baseY * (1 + ky)) + 6);
  const [sil, sc] = createCanvas(W, H);
  sc.setTransform(1, 0, -kx, -ky, kx * baseY, baseY * (1 + ky));
  sc.drawImage(src, 0, 0);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = 'rgb(16,24,14)';
  sc.fillRect(0, 0, W, H);
  // Fade towards the far end of the shadow.
  sc.globalCompositeOperation = 'destination-in';
  const g = sc.createLinearGradient(0, baseY, kx * baseY, baseY * (1 + ky));
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  sc.fillStyle = g;
  sc.fillRect(0, 0, W, H);
  // Soft edge: a few offset copies.
  const [out, oc] = createCanvas(W, H);
  const offs: Array<[number, number]> = [
    [0, 0],
    [1.5, 0],
    [-1.5, 0],
    [0, 1.5],
    [0, -1.5],
  ];
  oc.globalAlpha = alpha / 2.2;
  for (const [dx, dy] of offs) oc.drawImage(sil, dx, dy);
  return out;
}

/**
 * Sun lighting for a figure (in place): a warm rim light along its upper edges, a soft sheen
 * on the top and ambient-occlusion shading towards its base. The rim follows the silhouette
 * from above (with a slight left bias when `fromLeft`), so it still reads correctly on sprites
 * that are mirrored at runtime.
 */
export function sunlight(fig: HTMLCanvasElement, baseY: number, rim = 2.2, fromLeft = false): void {
  const W = fig.width;
  const H = fig.height;
  // Rim: the silhouette minus itself shifted down (and right), i.e. the upper edges.
  const [edge, ec] = createCanvas(W, H);
  ec.drawImage(fig, 0, 0);
  ec.globalCompositeOperation = 'source-in';
  ec.fillStyle = 'rgb(255,236,190)';
  ec.fillRect(0, 0, W, H);
  ec.globalCompositeOperation = 'destination-out';
  ec.drawImage(fig, fromLeft ? rim : rim * 0.25, rim);
  const c = fig.getContext('2d')!;
  c.save();
  // Callers may leave a drawing scale on the context: work in raw pixels.
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  // Ambient occlusion: darker and slightly cooler towards the feet / ground.
  const ao = c.createLinearGradient(0, baseY * 0.45, 0, baseY);
  ao.addColorStop(0, 'rgba(20,18,40,0)');
  ao.addColorStop(1, 'rgba(20,18,40,0.28)');
  c.fillStyle = ao;
  c.fillRect(0, 0, W, H);
  // Soft warm sheen from above.
  const sheen = c.createLinearGradient(0, 0, 0, baseY * 0.6);
  sheen.addColorStop(0, 'rgba(255,230,170,0.16)');
  sheen.addColorStop(1, 'rgba(255,230,170,0)');
  c.fillStyle = sheen;
  c.fillRect(0, 0, W, H);
  c.globalAlpha = 0.55;
  c.drawImage(edge, 0, 0);
  c.restore();
}
