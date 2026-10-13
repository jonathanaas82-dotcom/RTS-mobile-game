import { PALETTE } from '../palette';
import {
  EDGE_E,
  EDGE_N,
  EDGE_S,
  EDGE_W,
  TILESET_COLUMNS,
  TILESET_MARGIN,
  TILESET_ROWS,
  TILESET_SPACING,
  TILE_PX,
  VARIANTS,
} from '../tileset';
import { circle, createCanvas, ellipse, seeded } from './draw';

type Ctx = CanvasRenderingContext2D;
const S = TILE_PX;

/** Build the full extruded terrain tileset (see tileset.ts for the layout contract). */
export function generateTileset(): HTMLCanvasElement {
  const slot = S + TILESET_SPACING;
  const [canvas, ctx] = createCanvas(
    TILESET_MARGIN * 2 + TILESET_COLUMNS * slot - TILESET_SPACING,
    TILESET_MARGIN * 2 + TILESET_ROWS * slot - TILESET_SPACING,
  );
  const [tile, tctx] = createCanvas(S, S);
  const put = (row: number, col: number, draw: (c: Ctx) => void): void => {
    tctx.clearRect(0, 0, S, S);
    draw(tctx);
    const ox = TILESET_MARGIN + col * slot;
    const oy = TILESET_MARGIN + row * slot;
    ctx.drawImage(tile, ox, oy);
    // 1px extrusion on every side prevents seams when the camera zooms to fractional scales.
    ctx.drawImage(tile, 0, 0, 1, S, ox - 1, oy, 1, S);
    ctx.drawImage(tile, S - 1, 0, 1, S, ox + S, oy, 1, S);
    ctx.drawImage(tile, 0, 0, S, 1, ox, oy - 1, S, 1);
    ctx.drawImage(tile, 0, S - 1, S, 1, ox, oy + S, S, 1);
  };

  for (let v = 0; v < VARIANTS; v++) {
    put(0, v, (c) => drawGrass(c, v));
    put(1, v, (c) => drawSand(c, v));
    put(2, v, (c) => drawForest(c, v));
  }
  for (let mask = 0; mask < 16; mask++) {
    put(3, mask, (c) => drawWater(c, mask));
    put(4, mask, (c) => drawCliff(c, mask));
  }
  return canvas;
}

function speckle(
  c: Ctx,
  rnd: () => number,
  n: number,
  colors: readonly string[],
  size: number,
): void {
  for (let i = 0; i < n; i++) {
    c.fillStyle = colors[Math.floor(rnd() * colors.length)] as string;
    c.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), size, size);
  }
}

function drawGrass(c: Ctx, v: number): void {
  c.fillStyle = PALETTE.grass[v % PALETTE.grass.length] as string;
  c.fillRect(0, 0, S, S);
  const rnd = seeded(100 + v);
  speckle(c, rnd, 26, [PALETTE.grassDark, PALETTE.grassLight], 2);
  // A few grass tufts.
  c.strokeStyle = PALETTE.grassDark;
  c.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const x = 6 + rnd() * (S - 12);
    const y = 8 + rnd() * (S - 12);
    c.beginPath();
    c.moveTo(x - 3, y);
    c.lineTo(x - 1, y - 5);
    c.moveTo(x, y);
    c.lineTo(x + 1, y - 6);
    c.moveTo(x + 3, y);
    c.lineTo(x + 4, y - 4);
    c.stroke();
  }
}

function drawSand(c: Ctx, v: number): void {
  c.fillStyle = PALETTE.sand;
  c.fillRect(0, 0, S, S);
  speckle(c, seeded(200 + v), 40, [PALETTE.sandDark, '#e8d6a0'], 2);
}

function drawForest(c: Ctx, v: number): void {
  c.fillStyle = PALETTE.grassDark;
  c.fillRect(0, 0, S, S);
  const rnd = seeded(300 + v);
  speckle(c, rnd, 20, ['#2f5f27', '#4a8038'], 2);
  // Three overlapping trees, drawn back to front.
  const trees = [
    { x: 18 + rnd() * 8, y: 22 + rnd() * 6, r: 13 },
    { x: 44 + rnd() * 8, y: 20 + rnd() * 8, r: 12 },
    { x: 28 + rnd() * 10, y: 44 + rnd() * 6, r: 14 },
  ].sort((a, b) => a.y - b.y);
  for (const t of trees) {
    ellipse(c, t.x + 3, t.y + t.r * 0.9, t.r * 0.9, t.r * 0.35, PALETTE.shadow);
    c.fillStyle = PALETTE.trunk;
    c.fillRect(t.x - 2, t.y + t.r * 0.3, 4, t.r * 0.6);
    circle(c, t.x, t.y, t.r, PALETTE.treeDark);
    circle(c, t.x - 1, t.y - 2, t.r * 0.82, PALETTE.tree);
    circle(c, t.x - t.r * 0.3, t.y - t.r * 0.35, t.r * 0.38, PALETTE.treeLight);
  }
}

function drawWater(c: Ctx, mask: number): void {
  const g = c.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, PALETTE.water);
  g.addColorStop(1, PALETTE.waterDeep);
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  // Gentle wave marks (fixed positions so the pattern tiles).
  c.strokeStyle = 'rgba(160,205,240,0.35)';
  c.lineWidth = 2;
  for (const [x, y] of [
    [12, 16],
    [40, 30],
    [20, 48],
  ] as const) {
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 5, y - 4, x + 10, y);
    c.stroke();
  }
  // Shore: sand strip + foam line along every land-facing edge.
  const shore = 9;
  const foam = 3;
  const edge = (
    bit: number,
    rect: [number, number, number, number],
    foamRect: [number, number, number, number],
  ): void => {
    if (!(mask & bit)) return;
    c.fillStyle = PALETTE.sand;
    c.fillRect(...rect);
    c.fillStyle = PALETTE.foam;
    c.fillRect(...foamRect);
  };
  edge(EDGE_N, [0, 0, S, shore], [0, shore, S, foam]);
  edge(EDGE_S, [0, S - shore, S, shore], [0, S - shore - foam, S, foam]);
  edge(EDGE_W, [0, 0, shore, S], [shore, 0, foam, S]);
  edge(EDGE_E, [S - shore, 0, shore, S], [S - shore - foam, 0, foam, S]);
}

function drawCliff(c: Ctx, mask: number): void {
  c.fillStyle = PALETTE.cliff;
  c.fillRect(0, 0, S, S);
  const rnd = seeded(500);
  // Boulders give the rock some texture.
  for (let i = 0; i < 7; i++) {
    const x = 6 + rnd() * (S - 12);
    const y = 6 + rnd() * (S - 12);
    const r = 5 + rnd() * 6;
    circle(c, x + 1.5, y + 2, r, PALETTE.cliffDark);
    circle(c, x, y, r, PALETTE.cliff);
    circle(c, x - r * 0.3, y - r * 0.3, r * 0.45, PALETTE.cliffLight);
  }
  // Rim: light top edge, dark (shadowed) bottom face where the cliff meets lower ground.
  if (mask & EDGE_N) {
    c.fillStyle = PALETTE.cliffLight;
    c.fillRect(0, 0, S, 4);
  }
  if (mask & EDGE_S) {
    c.fillStyle = PALETTE.cliffDark;
    c.fillRect(0, S - 12, S, 12);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, S - 4, S, 4);
  }
  if (mask & EDGE_W) {
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(0, 0, 4, S);
  }
  if (mask & EDGE_E) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(S - 5, 0, 5, S);
  }
}
