import type { BuildingDef, FactionDef, FactionId } from '../../../data/types';
import { TILE_PX } from '../tileset';
import {
  ART_RES,
  createCanvas,
  dgrad,
  outlined,
  rgrad,
  seeded,
  shade,
  softShadow,
  vgrad,
} from './draw';

type Ctx = CanvasRenderingContext2D;
type Style = FactionDef['style'];

/** Extra height above the footprint so roofs/towers can overhang (in tiles). */
export const BUILDING_OVERHANG = 1;

const WOOD = '#7a5634';
const GOLD = '#e8b830';

function rect(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | CanvasGradient,
): void {
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
  color: string | CanvasGradient,
): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

/**
 * Draw a building at ART_RES. Canvas = footprint plus BUILDING_OVERHANG tiles above. The footprint
 * top-left is at (0, overhang) in world pixels (multiply by ART_RES for texture pixels).
 */
export function drawBuilding(def: BuildingDef, f: FactionDef, team: string): HTMLCanvasElement {
  const W = def.size * TILE_PX;
  const OH = Math.round(BUILDING_OVERHANG * TILE_PX);
  const H = W + OH;
  // Body (outlined) and ground layer are drawn separately so the outline skips shadows.
  const [body, c] = createCanvas(W * ART_RES, H * ART_RES);
  c.scale(ART_RES, ART_RES);
  const st = f.style;
  const fid = f.id;
  const pad = W * 0.08;
  switch (def.art) {
    case 'farm':
      farm(c, W, OH, team);
      break;
    case 'tower':
      tower(c, W, OH, st, fid, team);
      break;
    case 'monument':
      monument(c, W, OH, st, team);
      break;
    case 'shrine':
      shrine(c, W, OH, st, fid, team);
      break;
    case 'temple':
      temple(c, W, OH, st, fid, team);
      break;
    case 'storehouse':
      storehouse(c, W, OH, st, fid, team);
      break;
    case 'house':
      house(c, pad, OH + W * 0.24, W - pad * 2, W * 0.6, st, fid, team, {
        door: true,
        chimney: fid === 'hrimfolk',
      });
      break;
    case 'hall':
      house(
        c,
        W * 0.27,
        OH * (fid === 'hrimfolk' ? 0.42 : 0.15),
        W * 0.46,
        W * 0.58,
        st,
        fid,
        team,
        { door: false },
      );
      house(c, pad * 0.5, OH + W * 0.26, W - pad, W * 0.58, st, fid, team, {
        door: true,
        wide: true,
      });
      banner(c, W * 0.14, OH + W * 0.02, W * 0.28, team);
      banner(c, W * 0.86, OH + W * 0.02, W * 0.28, team);
      break;
    case 'barracks':
      house(c, pad * 0.5, OH + W * 0.22, W * 0.78, W * 0.58, st, fid, team, {
        door: true,
        wide: true,
      });
      weaponRack(c, W * 0.8, OH + W * 0.62);
      dummy(c, W * 0.88, OH + W * 0.9);
      banner(c, W * 0.08, OH + W * 0.06, W * 0.3, team);
      break;
    case 'stable':
      house(c, pad * 0.5, OH + W * 0.24, W * 0.74, W * 0.56, st, fid, team, {
        door: true,
        wide: true,
        barn: true,
      });
      hay(c, W * 0.86, OH + W * 0.72);
      hay(c, W * 0.8, OH + W * 0.86);
      fence(c, W * 0.05, OH + W * 0.94, W * 0.9);
      break;
    case 'workshop':
      house(c, pad * 0.5, OH + W * 0.3, W * 0.7, W * 0.52, st, fid, team, {
        door: true,
        wide: true,
      });
      crane(c, W * 0.82, OH + W * 0.86, OH + W * 0.05);
      gear(c, W * 0.2, OH + W * 0.2, 14);
      logs(c, W * 0.72, OH + W * 0.9);
      break;
  }
  const [out, oc] = createCanvas(W * ART_RES, H * ART_RES);
  oc.scale(ART_RES, ART_RES);
  // Ground: trodden earth pad and a soft shadow cast to the lower right.
  if (def.art !== 'farm') {
    const g = oc.createRadialGradient(
      W / 2,
      OH + W * 0.55,
      W * 0.1,
      W / 2,
      OH + W * 0.55,
      W * 0.62,
    );
    g.addColorStop(0, 'rgba(120,92,58,0.55)');
    g.addColorStop(0.75, 'rgba(110,84,52,0.35)');
    g.addColorStop(1, 'rgba(110,84,52,0)');
    oc.fillStyle = g;
    oc.beginPath();
    oc.roundRect(0, OH, W, W, W * 0.25);
    oc.fill();
    softShadow(oc, W * 0.58, OH + W * 0.8, W * 0.48, W * 0.16, 0.45);
  }
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.drawImage(outlined(body, 3), 0, 0);
  return out;
}

// ───────────────────────── materials ─────────────────────────

/** Wall surface in the faction's material (logs, marble blocks or sandstone). */
function wall(c: Ctx, x: number, y: number, w: number, h: number, st: Style, fid: FactionId): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  rect(c, x, y, w, h, vgrad(c, y, y + h, st.wall, 1.15, 0.8));
  const rnd = seeded(Math.round(x * 7 + y * 13));
  if (fid === 'hrimfolk') {
    // Horizontal logs with round shading.
    for (let ly = y; ly < y + h; ly += 7) {
      const g = c.createLinearGradient(0, ly, 0, ly + 7);
      g.addColorStop(0, shade(st.wall, 1.2));
      g.addColorStop(0.5, st.wall);
      g.addColorStop(1, shade(st.wall, 0.6));
      rect(c, x, ly, w, 7, g);
    }
    // Stone foundation.
    for (let sx = x - 4; sx < x + w; sx += 11) {
      const sw = 9 + rnd() * 4;
      c.fillStyle = rgrad(c, sx + sw / 2, y + h - 4, sw / 2, '#8d8a84');
      c.beginPath();
      c.roundRect(sx, y + h - 8, sw, 8, 3);
      c.fill();
    }
  } else if (fid === 'aurelian') {
    // Marble blocks in running bond.
    c.strokeStyle = shade(st.wall, 0.82);
    c.lineWidth = 0.8;
    for (let row = 0, ly = y; ly < y + h; ly += 9, row++) {
      line(c, x, ly, x + w, ly, 0.8, shade(st.wall, 0.82));
      for (let bx = x + (row % 2) * 9; bx < x + w; bx += 18)
        line(c, bx, ly, bx, ly + 9, 0.8, shade(st.wall, 0.82));
    }
    rect(c, x, y + h - 5, w, 5, shade(st.wall, 0.85));
  } else {
    // Sandstone blocks with a painted band.
    for (let row = 0, ly = y; ly < y + h; ly += 12, row++) {
      line(c, x, ly, x + w, ly, 1, shade(st.wall, 0.78));
      for (let bx = x + (row % 2) * 12; bx < x + w; bx += 24)
        line(c, bx, ly, bx, ly + 12, 1, shade(st.wall, 0.78));
    }
    rect(c, x, y + 4, w, 4, st.trim);
    rect(c, x, y + 9, w, 2, GOLD);
  }
  // Ambient occlusion at the base and a shaded right side.
  const ao = c.createLinearGradient(0, y + h - 10, 0, y + h);
  ao.addColorStop(0, 'rgba(0,0,0,0)');
  ao.addColorStop(1, 'rgba(0,0,0,0.25)');
  rect(c, x, y + h - 10, w, 10, ao);
  rect(c, x + w - 6, y, 6, h, 'rgba(0,0,0,0.18)');
  c.restore();
}

function windowGlow(c: Ctx, x: number, y: number, w: number, h: number, arch = false): void {
  c.fillStyle = '#2b1d12';
  c.beginPath();
  if (arch) {
    c.moveTo(x - 1.5, y + h + 1.5);
    c.lineTo(x - 1.5, y + w / 2);
    c.arc(x + w / 2, y + w / 2, w / 2 + 1.5, Math.PI, 0);
    c.lineTo(x + w + 1.5, y + h + 1.5);
  } else c.rect(x - 1.5, y - 1.5, w + 3, h + 3);
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#ffe7a3');
  g.addColorStop(1, '#f2a33c');
  c.fillStyle = g;
  c.beginPath();
  if (arch) {
    c.moveTo(x, y + h);
    c.lineTo(x, y + w / 2);
    c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
    c.lineTo(x + w, y + h);
  } else c.rect(x, y, w, h);
  c.fill();
  line(c, x + w / 2, y, x + w / 2, y + h, 1, '#6b4a2e');
}

function door(c: Ctx, x: number, y: number, w: number, h: number, st: Style, arch: boolean): void {
  c.fillStyle = shade(st.trim, 0.8);
  c.beginPath();
  c.moveTo(x - 2, y + h);
  c.lineTo(x - 2, y + (arch ? w / 2 : 0) - 2);
  if (arch) c.arc(x + w / 2, y + w / 2, w / 2 + 2, Math.PI, 0);
  else c.lineTo(x + w + 2, y - 2);
  c.lineTo(x + w + 2, y + h);
  c.fill();
  c.fillStyle = vgrad(c, y, y + h, '#5a3a20', 1, 0.6);
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + (arch ? w / 2 : 0));
  if (arch) c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  else c.lineTo(x + w, y);
  c.lineTo(x + w, y + h);
  c.fill();
  for (let i = 1; i < 3; i++)
    line(c, x + (w * i) / 3, y + 3, x + (w * i) / 3, y + h, 0.8, '#3a2412');
  disc(c, x + w * 0.78, y + h * 0.6, 1.2, GOLD);
}

/** Roof in the faction style over a wall spanning x..x+w with its top at `top`. */
function roof(
  c: Ctx,
  x: number,
  top: number,
  w: number,
  st: Style,
  fid: FactionId,
  team: string,
  barn = false,
): void {
  if (fid === 'sahrun') {
    // Flat roof: parapet with crenellations and a striped awning.
    rect(c, x - 3, top - 7, w + 6, 8, vgrad(c, top - 7, top + 1, shade(st.roof, 1.05)));
    for (let i = 0; i < Math.floor((w + 6) / 10); i++)
      rect(c, x - 3 + i * 10, top - 13, 6, 7, vgrad(c, top - 13, top - 6, st.roof));
    const aw = Math.min(w * 0.5, 40);
    const ax = x + w / 2 - aw / 2;
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#f3ead8' : team;
      c.beginPath();
      c.moveTo(ax + (aw / 6) * i, top + 2);
      c.lineTo(ax + (aw / 6) * (i + 1), top + 2);
      c.lineTo(ax + (aw / 6) * (i + 1) + 2, top + 10);
      c.lineTo(ax + (aw / 6) * i + 2, top + 10);
      c.fill();
    }
    return;
  }
  const steep = fid === 'hrimfolk';
  const rise = steep ? w * (barn ? 0.42 : 0.55) : w * 0.28;
  const peak = top - rise;
  const ov = 6;
  // Roof plane with shading: lit left slope, darker right slope.
  c.save();
  c.beginPath();
  c.moveTo(x - ov, top + 3);
  c.lineTo(x + w / 2, peak);
  c.lineTo(x + w + ov, top + 3);
  c.closePath();
  c.clip();
  rect(c, x - ov, peak, w + ov * 2, rise + 4, vgrad(c, peak, top + 3, st.roof, 1.2, 0.8));
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.moveTo(x + w / 2, peak);
  c.lineTo(x + w + ov, top + 3);
  c.lineTo(x + w / 2, top + 3);
  c.fill();
  // Shingle / tile rows.
  const rowH = steep ? 6 : 5;
  for (let ry = peak + rowH; ry < top + 3; ry += rowH) {
    line(c, x - ov, ry, x + w + ov, ry, 1, shade(st.roof, 0.65));
    if (!steep)
      for (let tx = x - ov + ((ry / rowH) % 2) * 4; tx < x + w + ov; tx += 8)
        line(c, tx, ry - rowH, tx, ry, 0.8, shade(st.roof, 0.75));
    else
      for (let tx = x - ov + ((ry / rowH) % 2) * 5; tx < x + w + ov; tx += 10) {
        c.strokeStyle = shade(st.roof, 0.7);
        c.lineWidth = 0.8;
        c.beginPath();
        c.arc(tx + 5, ry - 1, 5, 0, Math.PI);
        c.stroke();
      }
  }
  c.restore();
  // Ridge / pediment trim.
  line(c, x - ov, top + 3, x + w / 2, peak, 2.5, st.trim);
  line(c, x + w / 2, peak, x + w + ov, top + 3, 2.5, shade(st.trim, 0.8));
  if (steep) {
    // Carved crossed gable beams.
    line(c, x + w / 2 - 6, peak - 7, x + w / 2 + 4, peak + 4, 3, shade(WOOD, 0.9));
    line(c, x + w / 2 + 6, peak - 7, x + w / 2 - 4, peak + 4, 3, shade(WOOD, 0.9));
  } else {
    // Small pediment acroterion.
    disc(c, x + w / 2, peak - 1, 3, GOLD);
  }
}

interface HouseOpts {
  door?: boolean;
  wide?: boolean;
  chimney?: boolean;
  barn?: boolean;
}

/** Generic building body: wall with windows/door and a faction roof; (x, y) = top of the roof area. */
function house(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  st: Style,
  fid: FactionId,
  team: string,
  o: HouseOpts,
): void {
  const wallTop = y + h * 0.36;
  const wallH = h * 0.64;
  if (o.chimney) {
    rect(
      c,
      x + w * 0.7,
      wallTop - h * 0.45,
      7,
      h * 0.3,
      vgrad(c, wallTop - h * 0.45, wallTop, '#8d8a84'),
    );
    disc(c, x + w * 0.7 + 3.5, wallTop - h * 0.5, 4, 'rgba(220,220,220,0.35)');
  }
  wall(c, x, wallTop, w, wallH, st, fid);
  roof(c, x, wallTop, w, st, fid, team, o.barn);
  const arch = fid !== 'hrimfolk';
  // Team stripe under the eaves.
  rect(c, x, wallTop + 1, w, 3, team);
  const ww = Math.max(6, w * 0.1);
  const wy = wallTop + wallH * 0.22;
  windowGlow(c, x + w * 0.14, wy, ww, ww * 1.15, arch);
  windowGlow(c, x + w * 0.86 - ww, wy, ww, ww * 1.15, arch);
  if (o.door) {
    const dw = o.wide ? w * (o.barn ? 0.3 : 0.2) : w * 0.18;
    door(c, x + w / 2 - dw / 2, wallTop + wallH * 0.42, dw, wallH * 0.58, st, arch && !o.barn);
    if (o.barn) {
      line(
        c,
        x + w / 2 - dw / 2,
        wallTop + wallH * 0.42,
        x + w / 2 + dw / 2,
        wallTop + wallH,
        1.5,
        '#e8d6a0',
      );
      line(
        c,
        x + w / 2 + dw / 2,
        wallTop + wallH * 0.42,
        x + w / 2 - dw / 2,
        wallTop + wallH,
        1.5,
        '#e8d6a0',
      );
    }
  }
}

function banner(c: Ctx, x: number, y: number, h: number, team: string): void {
  line(c, x, y + h, x, y - 4, 2.5, '#4a3420');
  disc(c, x, y - 5, 2.5, GOLD);
  c.fillStyle = vgrad(c, y, y + h * 0.6, team, 1.2, 0.7);
  c.beginPath();
  c.moveTo(x + 1, y);
  c.lineTo(x + 14, y);
  c.lineTo(x + 14, y + h * 0.55);
  c.lineTo(x + 7.5, y + h * 0.45);
  c.lineTo(x + 1, y + h * 0.55);
  c.closePath();
  c.fill();
  disc(c, x + 7.5, y + h * 0.2, 3, shade(team, 1.7));
}

// ───────────────────────── props ─────────────────────────

function weaponRack(c: Ctx, x: number, y: number): void {
  line(c, x - 8, y, x + 12, y, 2.5, WOOD);
  for (let i = 0; i < 4; i++) {
    line(c, x - 6 + i * 5.5, y + 16, x - 6 + i * 5.5, y - 12, 2, WOOD);
    c.fillStyle = '#c9ccd4';
    c.beginPath();
    c.moveTo(x - 6 + i * 5.5, y - 18);
    c.lineTo(x - 4 + i * 5.5, y - 11);
    c.lineTo(x - 8 + i * 5.5, y - 11);
    c.fill();
  }
}

function dummy(c: Ctx, x: number, y: number): void {
  line(c, x, y, x, y - 22, 3, WOOD);
  line(c, x - 7, y - 16, x + 7, y - 16, 3, WOOD);
  disc(c, x, y - 24, 5, rgrad(c, x, y - 24, 5, '#d8c385'));
}

function hay(c: Ctx, x: number, y: number): void {
  c.fillStyle = vgrad(c, y - 8, y + 8, '#e2c25a');
  c.beginPath();
  c.roundRect(x - 10, y - 8, 20, 14, 4);
  c.fill();
  for (let i = 0; i < 4; i++) line(c, x - 8 + i * 5, y - 6, x - 7 + i * 5, y + 4, 0.8, '#b8962e');
}

function fence(c: Ctx, x: number, y: number, w: number): void {
  line(c, x, y - 6, x + w, y - 6, 2, WOOD);
  line(c, x, y - 2, x + w, y - 2, 2, WOOD);
  for (let px = x; px <= x + w; px += 12) line(c, px, y + 2, px, y - 10, 2.5, shade(WOOD, 0.85));
}

function gear(c: Ctx, x: number, y: number, r: number): void {
  c.fillStyle = '#7d8088';
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.78;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  disc(c, x, y, r * 0.55, rgrad(c, x, y, r * 0.55, '#9a9da5'));
  disc(c, x, y, r * 0.2, '#4a4d55');
}

function crane(c: Ctx, x: number, y: number, top: number): void {
  line(c, x, y, x, top, 4, shade(WOOD, 0.9));
  line(c, x, top, x - 30, top + 10, 3, WOOD);
  line(c, x - 28, top + 10, x - 28, top + 34, 1, '#d8c385');
  c.fillStyle = '#8d8a84';
  c.fillRect(x - 33, top + 34, 10, 8);
}

function logs(c: Ctx, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const ly = y - i * 5;
    const lx = x + (i % 2) * 4;
    c.fillStyle = vgrad(c, ly - 3, ly + 3, '#8a5a33');
    c.fillRect(lx, ly - 3, 22, 6);
    disc(c, lx + 22, ly, 3, '#d4a46a');
  }
}

function crate(c: Ctx, x: number, y: number, s: number): void {
  c.fillStyle = dgrad(c, x, y, x + s, y + s, '#a0703c');
  c.fillRect(x, y, s, s);
  c.strokeStyle = '#6b4a2e';
  c.lineWidth = 1.2;
  c.strokeRect(x + 1, y + 1, s - 2, s - 2);
  line(c, x + 1, y + 1, x + s - 1, y + s - 1, 1.2, '#6b4a2e');
}

function barrel(c: Ctx, x: number, y: number): void {
  c.fillStyle = vgrad(c, y - 8, y + 8, '#8a5a33');
  c.beginPath();
  c.ellipse(x, y, 6, 8, 0, 0, Math.PI * 2);
  c.fill();
  line(c, x - 6, y - 3, x + 6, y - 3, 1.2, '#4a4d55');
  line(c, x - 6, y + 3, x + 6, y + 3, 1.2, '#4a4d55');
}

// ───────────────────────── building types ─────────────────────────

function storehouse(c: Ctx, W: number, OH: number, st: Style, fid: FactionId, team: string): void {
  // Open shed: roof on posts with goods inside.
  const x = W * 0.08;
  const w = W * 0.84;
  const top = OH + W * 0.42;
  rect(c, x, top, w, W * 0.42, vgrad(c, top, top + W * 0.42, shade(st.wall, 0.55)));
  for (const px of [x + 2, x + w - 6])
    rect(c, px, top, 4, W * 0.42, vgrad(c, top, top + W * 0.42, WOOD));
  roof(c, x, top, w, st, fid, team);
  rect(c, x, top + 1, w, 3, team);
  crate(c, x + 8, top + W * 0.24, 12);
  crate(c, x + 18, top + W * 0.3, 10);
  barrel(c, x + w - 16, top + W * 0.32);
  logs(c, x + w * 0.38, top + W * 0.38);
  disc(c, x + w * 0.62, top + W * 0.37, 4, rgrad(c, x + w * 0.62, top + W * 0.37, 4, GOLD));
}

function farm(c: Ctx, W: number, OH: number, team: string): void {
  const rnd = seeded(31);
  c.fillStyle = vgrad(c, OH + 4, OH + W - 4, '#8a6a3a', 1.1, 0.85);
  c.beginPath();
  c.roundRect(5, OH + 5, W - 10, W - 10, 6);
  c.fill();
  for (let r = 0; r < 7; r++) {
    const y = OH + 12 + r * ((W - 22) / 6.5);
    line(c, 9, y + 3, W - 9, y + 3, 3, '#6b5028');
    for (let k = 0; k < 8; k++) {
      const x = 12 + k * ((W - 24) / 7);
      const h = 6 + rnd() * 3;
      line(c, x, y + 2, x - 1, y - h, 1.6, '#c9a540');
      disc(c, x - 1, y - h, 2, '#e8c860');
    }
  }
  c.strokeStyle = WOOD;
  c.lineWidth = 2;
  c.strokeRect(4, OH + 4, W - 8, W - 8);
  // Scarecrow wearing the team colour.
  line(c, W * 0.82, OH + W * 0.5, W * 0.82, OH + W * 0.2, 2.5, WOOD);
  line(c, W * 0.72, OH + W * 0.3, W * 0.92, OH + W * 0.3, 2.5, WOOD);
  rect(c, W * 0.77, OH + W * 0.28, 10, 10, team);
  disc(c, W * 0.82, OH + W * 0.2, 4, '#e2c25a');
}

function tower(c: Ctx, W: number, OH: number, st: Style, fid: FactionId, team: string): void {
  const x = W * 0.24;
  const w = W * 0.52;
  const top = OH * 0.1 + (fid === 'hrimfolk' ? 46 : 18);
  const bottom = OH + W * 0.86;
  wall(c, x, top, w, bottom - top, st, fid);
  windowGlow(c, x + w / 2 - 4, OH + W * 0.25, 8, 11, fid !== 'hrimfolk');
  windowGlow(c, x + w / 2 - 3, top + 14, 6, 8, fid !== 'hrimfolk');
  rect(c, x, top + 4, w, 3, team);
  if (fid === 'sahrun' || fid === 'aurelian') {
    // Crenellated top.
    rect(c, x - 5, top - 4, w + 10, 8, vgrad(c, top - 4, top + 4, shade(st.wall, 1.05)));
    for (let i = 0; i < 4; i++)
      rect(
        c,
        x - 5 + i * ((w + 10) / 3.6),
        top - 12,
        (w + 10) / 6,
        8,
        vgrad(c, top - 12, top - 4, fid === 'sahrun' ? st.roof : st.wall),
      );
    banner(c, x + w / 2, top - 30, 24, team);
  } else {
    roof(c, x - 2, top + 2, w + 4, st, fid, team);
    banner(c, x + w / 2 + 14, top - 16, 18, team);
  }
}

function temple(c: Ctx, W: number, OH: number, st: Style, fid: FactionId, team: string): void {
  const x = W * 0.07;
  const w = W * 0.86;
  const base = OH + W * 0.86;
  // Stepped platform.
  for (let i = 0; i < 3; i++)
    rect(
      c,
      x - 6 + i * 4,
      base - 6 - i * 5,
      w + 12 - i * 8,
      6,
      vgrad(c, base - 6 - i * 5, base - i * 5, shade(st.wall, 0.95 - i * 0.05)),
    );
  const colTop = OH + W * 0.24;
  const colBottom = base - 16;
  // Dark inner sanctum with a glowing altar.
  rect(
    c,
    x + 8,
    colTop,
    w - 16,
    colBottom - colTop,
    vgrad(c, colTop, colBottom, '#3a2a1e', 1.2, 0.7),
  );
  const glow = c.createRadialGradient(x + w / 2, colBottom - 10, 2, x + w / 2, colBottom - 10, 26);
  glow.addColorStop(0, 'rgba(255,220,140,0.95)');
  glow.addColorStop(1, 'rgba(255,180,80,0)');
  c.fillStyle = glow;
  c.fillRect(x + 8, colTop, w - 16, colBottom - colTop);
  const cols = 6;
  for (let i = 0; i < cols; i++) {
    const cx = x + 4 + (i * (w - 16)) / (cols - 1);
    const cg = c.createLinearGradient(cx, 0, cx + 9, 0);
    cg.addColorStop(0, shade(st.wall, 1.2));
    cg.addColorStop(0.5, st.wall);
    cg.addColorStop(1, shade(st.wall, 0.7));
    rect(c, cx, colTop, 8, colBottom - colTop, cg);
    rect(c, cx - 2, colTop - 2, 12, 4, shade(st.wall, 0.9));
    rect(c, cx - 2, colBottom - 3, 12, 4, shade(st.wall, 0.9));
  }
  rect(c, x - 3, colTop - 9, w + 6, 8, vgrad(c, colTop - 9, colTop - 1, st.wall));
  rect(c, x - 3, colTop - 5, w + 6, 2, team);
  if (fid === 'sahrun') {
    // Pylon gate towers.
    for (const px of [x - 4, x + w - 18]) {
      c.fillStyle = vgrad(c, OH - 4, base, st.wall);
      c.beginPath();
      c.moveTo(px, base - 14);
      c.lineTo(px + 3, OH + 2);
      c.lineTo(px + 19, OH + 2);
      c.lineTo(px + 22, base - 14);
      c.fill();
      rect(c, px + 3, OH + 6, 16, 3, st.trim);
    }
  } else roof(c, x, colTop - 9, w, st, fid, team);
  disc(c, x + w / 2, colTop - 22, 6, rgrad(c, x + w / 2, colTop - 22, 6, GOLD));
}

function shrine(c: Ctx, W: number, OH: number, st: Style, fid: FactionId, team: string): void {
  rect(
    c,
    W * 0.18,
    OH + W * 0.58,
    W * 0.64,
    W * 0.26,
    vgrad(c, OH + W * 0.58, OH + W * 0.84, st.wall),
  );
  rect(
    c,
    W * 0.12,
    OH + W * 0.52,
    W * 0.76,
    7,
    vgrad(c, OH + W * 0.52, OH + W * 0.52 + 7, shade(st.wall, 1.1)),
  );
  rect(c, W * 0.18, OH + W * 0.64, W * 0.64, 3, team);
  for (const px of [W * 0.12, W * 0.8]) {
    rect(c, px, OH + W * 0.08, 7, W * 0.52, vgrad(c, OH, OH + W * 0.6, st.trim));
    disc(c, px + 3.5, OH + W * 0.06, 5, rgrad(c, px + 3.5, OH + W * 0.06, 5, GOLD));
  }
  // Eternal flame with a warm halo.
  const halo = c.createRadialGradient(W / 2, OH + W * 0.38, 2, W / 2, OH + W * 0.38, 30);
  halo.addColorStop(0, 'rgba(255,200,90,0.8)');
  halo.addColorStop(1, 'rgba(255,160,60,0)');
  c.fillStyle = halo;
  c.fillRect(0, OH, W, W);
  c.fillStyle = '#ff7a2a';
  c.beginPath();
  c.moveTo(W / 2 - 10, OH + W * 0.52);
  c.quadraticCurveTo(W / 2 - 12, OH + W * 0.3, W / 2, OH + W * 0.14);
  c.quadraticCurveTo(W / 2 + 12, OH + W * 0.32, W / 2 + 10, OH + W * 0.52);
  c.fill();
  c.fillStyle = '#ffe58a';
  c.beginPath();
  c.moveTo(W / 2 - 5, OH + W * 0.52);
  c.quadraticCurveTo(W / 2 - 6, OH + W * 0.38, W / 2, OH + W * 0.28);
  c.quadraticCurveTo(W / 2 + 6, OH + W * 0.4, W / 2 + 5, OH + W * 0.52);
  c.fill();
  void fid;
}

function monument(c: Ctx, W: number, OH: number, st: Style, team: string): void {
  rect(
    c,
    W * 0.18,
    OH + W * 0.7,
    W * 0.64,
    W * 0.16,
    vgrad(c, OH + W * 0.7, OH + W * 0.86, shade(st.wall, 0.95)),
  );
  rect(
    c,
    W * 0.24,
    OH + W * 0.62,
    W * 0.52,
    W * 0.1,
    vgrad(c, OH + W * 0.62, OH + W * 0.72, st.wall),
  );
  const top = 14;
  const g = c.createLinearGradient(W * 0.36, 0, W * 0.64, 0);
  g.addColorStop(0, shade(st.wall, 1.2));
  g.addColorStop(0.5, st.wall);
  g.addColorStop(0.51, shade(st.wall, 0.8));
  g.addColorStop(1, shade(st.wall, 0.65));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(W * 0.37, OH + W * 0.62);
  c.lineTo(W * 0.43, top + 10);
  c.lineTo(W * 0.57, top + 10);
  c.lineTo(W * 0.63, OH + W * 0.62);
  c.fill();
  c.fillStyle = dgrad(c, W * 0.43, top, W * 0.57, top + 10, GOLD);
  c.beginPath();
  c.moveTo(W * 0.43, top + 10);
  c.lineTo(W * 0.5, top - 4);
  c.lineTo(W * 0.57, top + 10);
  c.fill();
  // Glyphs.
  for (let i = 0; i < 5; i++) {
    const y = top + 22 + i * 12;
    rect(c, W * 0.47, y, 6, 2, st.trim);
    disc(c, W * 0.5, y + 6, 1.6, st.trim);
  }
  rect(c, W * 0.41, OH + W * 0.4, W * 0.18, 4, team);
}

/** Construction site: timber frame, ropes and stone piles (drawn at ART_RES). */
export function drawFoundation(size: number): HTMLCanvasElement {
  const W = size * TILE_PX;
  const [cv, c] = createCanvas(W * ART_RES, W * ART_RES);
  c.scale(ART_RES, ART_RES);
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
  for (const [x, y] of [
    [10, W - 14],
    [W - 18, 14],
  ] as const) {
    for (let k = 0; k < 4; k++)
      disc(
        c,
        x + (k % 2) * 6,
        y - Math.floor(k / 2) * 5,
        3.5,
        rgrad(c, x + (k % 2) * 6, y - Math.floor(k / 2) * 5, 3.5, '#9a958c'),
      );
  }
  return cv;
}
