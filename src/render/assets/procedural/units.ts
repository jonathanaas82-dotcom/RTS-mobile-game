import type { FactionId, UnitDef } from '../../../data/types';
import { TILE_PX } from '../tileset';
import { ART_RES, createCanvas, dgrad, outlined, rgrad, shade, softShadow, vgrad } from './draw';

type Ctx = CanvasRenderingContext2D;

/** Base canvas size (texture px) for a scale-1 unit (a worker is roughly 0.6 tiles tall). */
const BASE = TILE_PX * 1.0 * ART_RES;

const SKIN: Record<FactionId, string> = {
  hrimfolk: '#ecc6a2',
  aurelian: '#d9a87e',
  sahrun: '#b47a4c',
};
const HAIR: Record<FactionId, string> = {
  hrimfolk: '#c99a4e',
  aurelian: '#3b2a1e',
  sahrun: '#1f1712',
};
const STEEL = '#b9c0ca';
const BRONZE = '#c8893a';
const GOLD = '#e8b830';
const LEATHER = '#6b4a2e';
const WOOD = '#7a5634';

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

function rr(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function oval(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
  rot = 0,
): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

/** Work activities a worker can be drawn doing (two key frames each: 0 = wind-up, 1 = strike). */
export type WorkAct = 'chop' | 'mine' | 'build' | 'farm' | 'pick' | 'fish';
/** What a walking worker carries home. */
export type CarryArt = 'wood' | 'gold' | 'berries' | 'fish' | 'grain';

/** Animation pose for a humanoid. Omitted = the standing idle pose. */
export interface Pose {
  act?: WorkAct;
  frame?: 0 | 1;
  carry?: CarryArt;
  /** Mid-stride legs (alternated with the standing pose while walking). */
  stride?: boolean;
}

export const WORK_ACTS: readonly WorkAct[] = ['chop', 'mine', 'build', 'farm', 'pick', 'fish'];
export const CARRY_ARTS: readonly CarryArt[] = ['wood', 'gold', 'berries', 'fish', 'grain'];

/** Frame-name suffix of a pose (empty for idle). */
export function poseName(p: Pose): string {
  if (p.act) return `${p.act}${p.frame ?? 0}`;
  if (p.carry) return `carry_${p.carry}${p.stride ? '_w' : ''}`;
  return p.stride ? 'walk' : '';
}

/**
 * Draw a unit facing right on a transparent canvas: shaded figure with a dark outline and a soft
 * contact shadow. Anchor convention: feet at (0.5, 0.86) of the canvas.
 */
export function drawUnit(def: UnitDef, team: string, pose: Pose = {}): HTMLCanvasElement {
  const scale = def.art.scale ?? 1;
  const S = Math.round(BASE * scale);
  const [fig, c] = createCanvas(S, S);
  c.save();
  c.scale(S / 100, S / 100); // draw in a 100×100 design box
  switch (def.art.shape) {
    case 'humanoid':
      humanoid(c, def, team, 50, 86, 1, pose);
      break;
    case 'rider':
      rider(c, def, team);
      break;
    case 'engine':
      engine(c, def, team);
      break;
    case 'giant':
      giant(c, def, team);
      break;
    case 'serpent':
      serpent(c, def, team);
      break;
    case 'beast':
      beast(c, def, team);
      break;
    case 'flyer':
      flyer(c, def, team);
      break;
    case 'construct':
      construct(c, def, team);
      break;
  }
  c.restore();
  const [out, oc] = createCanvas(S, S);
  const flying = def.art.shape === 'flyer';
  softShadow(oc, S * 0.5, S * 0.87, S * (flying ? 0.2 : 0.27), S * 0.07, flying ? 0.25 : 0.4);
  oc.drawImage(outlined(fig, Math.max(2, S / 48)), 0, 0);
  return out;
}

// ───────────────────────── humanoids ─────────────────────────

type Helm = NonNullable<UnitDef['art']['helm']>;
type Armor = NonNullable<UnitDef['art']['armor']>;
type ShieldKind = NonNullable<UnitDef['art']['shield']>;

/** Resolved look of a humanoid: explicit art fields, else faction/class defaults. */
interface Look {
  helm: Helm;
  armor: Armor;
  shield: ShieldKind;
  cape: boolean;
}

const DEFAULT_LOOK: Record<
  FactionId,
  { worker: [Helm, Armor]; soldier: [Helm, Armor, ShieldKind] }
> = {
  hrimfolk: { worker: ['cap', 'fur'], soldier: ['nasal', 'mail', 'round'] },
  aurelian: { worker: ['none', 'cloth'], soldier: ['crested', 'plate', 'hoplon'] },
  sahrun: { worker: ['nemes', 'linen'], soldier: ['nemes', 'linen', 'oval'] },
};

function lookOf(def: UnitDef): Look {
  const a = def.art;
  const d = DEFAULT_LOOK[def.faction];
  const worker = def.cls === 'worker';
  const shielded = def.cls === 'infantry' || (def.cls === 'hero' && a.weapon !== 'staff');
  return {
    helm: a.helm ?? (worker ? d.worker[0] : d.soldier[0]),
    armor: a.armor ?? (worker ? d.worker[1] : d.soldier[1]),
    shield: a.shield ?? (shielded ? d.soldier[2] : 'none'),
    cape: a.cape ?? def.cls === 'hero',
  };
}

/** Head, face, hair/beard and headgear. */
function head(
  c: Ctx,
  def: UnitDef,
  look: Look,
  fx: number,
  hy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const skin = SKIN[f];
  const hero = def.cls === 'hero';
  const metal = hero ? GOLD : f === 'aurelian' ? BRONZE : STEEL;
  // Face with soft shading, eye, brow and nose (facing right).
  disc(c, fx, hy, s(10), rgrad(c, fx, hy, s(10), skin));
  oval(c, fx - s(8.5), hy + s(1), s(2), s(3), shade(skin, 0.85)); // ear
  disc(c, fx + s(5), hy - s(1), s(1.5), '#2a1d14');
  line(c, fx + s(3), hy - s(4), fx + s(7.5), hy - s(3.6), s(1.2), shade(HAIR[f], 0.9));
  oval(c, fx + s(9.5), hy + s(1.5), s(1.6), s(2.2), shade(skin, 0.85));
  line(c, fx + s(4), hy + s(5.5), fx + s(7), hy + s(5), s(0.9), shade(skin, 0.6)); // mouth
  if (f === 'hrimfolk') {
    // Braided beard.
    c.fillStyle = vgrad(c, hy, hy + s(16), HAIR[f]);
    c.beginPath();
    c.moveTo(fx - s(5), hy + s(2));
    c.quadraticCurveTo(fx + s(4), hy + s(18), fx + s(9.5), hy + s(4));
    c.quadraticCurveTo(fx + s(3), hy + s(7), fx - s(5), hy + s(2));
    c.fill();
    line(c, fx + s(3), hy + s(9), fx + s(3.5), hy + s(14), s(1.2), shade(HAIR[f], 0.7));
    disc(c, fx + s(3.5), hy + s(14.5), s(1.1), GOLD);
  } else if (f === 'aurelian' && def.cls !== 'worker') {
    // Short trimmed beard.
    c.fillStyle = shade(HAIR[f], 0.9);
    c.beginPath();
    c.moveTo(fx - s(6), hy + s(1));
    c.quadraticCurveTo(fx + s(2), hy + s(11), fx + s(9), hy + s(4));
    c.quadraticCurveTo(fx + s(3), hy + s(6), fx - s(6), hy + s(1));
    c.fill();
  }
  const helmDome = (color: string, from = 1.02, to = 1.98): void => {
    c.fillStyle = dgrad(c, fx - s(10), hy - s(14), fx + s(10), hy, color);
    c.beginPath();
    c.arc(fx, hy - s(2), s(11), Math.PI * from, Math.PI * to);
    c.closePath();
    c.fill();
    // Rivets / highlight.
    line(c, fx - s(4), hy - s(11.5), fx + s(2), hy - s(12.5), s(1.4), shade(color, 1.4));
  };
  switch (look.helm) {
    case 'none':
      c.fillStyle = HAIR[f];
      c.beginPath();
      c.arc(fx - s(1), hy - s(2), s(10.5), Math.PI * 0.9, Math.PI * 1.95);
      c.fill();
      if (f === 'aurelian') {
        c.strokeStyle = '#6f9a3a';
        c.lineWidth = s(2.2);
        c.beginPath();
        c.arc(fx, hy - s(1), s(10), Math.PI * 1.05, Math.PI * 1.9);
        c.stroke();
      }
      break;
    case 'cap':
      if (f === 'hrimfolk') {
        c.fillStyle = vgrad(c, hy - s(14), hy - s(2), '#8a6a48');
        c.beginPath();
        c.ellipse(fx - s(1), hy - s(6), s(11), s(7), 0, Math.PI, 0);
        c.fill();
        for (let i = 0; i < 5; i++)
          line(
            c,
            fx - s(10) + i * s(4.5),
            hy - s(6),
            fx - s(9) + i * s(4.5),
            hy - s(3),
            s(1),
            '#5a4430',
          );
      } else {
        // Close-fitting leather cap.
        helmDome(f === 'sahrun' ? '#b08850' : '#8a6040', 1.0, 2.0);
        rr(c, fx - s(11), hy - s(3.5), s(22), s(2.5), s(1.2), shade(LEATHER, 0.8));
      }
      break;
    case 'nasal':
    case 'horned':
      helmDome(metal);
      rr(c, fx - s(11), hy - s(3.5), s(22), s(3), s(1.5), shade(metal, 0.75));
      rr(c, fx + s(5.5), hy - s(3), s(2.5), s(8), s(1), shade(metal, 0.8));
      if (hero) rr(c, fx - s(11), hy - s(3.5), s(22), s(2), s(1), GOLD);
      if (look.helm === 'horned') {
        // Two curved horns sweeping up and outwards.
        for (const [bx, dir, col] of [
          [fx - s(7), -1, shade('#e8dcc0', 0.75)],
          [fx + s(5), 1, '#efe4c8'],
        ] as const) {
          c.fillStyle = vgrad(c, hy - s(23), hy - s(8), col);
          c.beginPath();
          c.moveTo(bx - s(2.5), hy - s(9));
          c.quadraticCurveTo(bx + dir * s(10), hy - s(13), bx + dir * s(9), hy - s(22));
          c.quadraticCurveTo(bx + dir * s(4), hy - s(16), bx + s(2.5), hy - s(9));
          c.fill();
        }
      }
      break;
    case 'wolfhood': {
      // Wolf pelt worn over the head: grey fur, ears, snout over the brow, falling to the back.
      const fur = '#8d8a86';
      c.fillStyle = vgrad(c, hy - s(16), hy + s(14), fur);
      c.beginPath();
      c.moveTo(fx - s(13), hy + s(14));
      c.quadraticCurveTo(fx - s(15), hy - s(6), fx - s(4), hy - s(13));
      c.quadraticCurveTo(fx + s(8), hy - s(15), fx + s(12), hy - s(6));
      c.lineTo(fx + s(15), hy - s(3));
      c.lineTo(fx + s(7), hy - s(4));
      c.quadraticCurveTo(fx - s(4), hy - s(4), fx - s(8), hy + s(6));
      c.closePath();
      c.fill();
      c.fillStyle = shade(fur, 0.7);
      c.beginPath();
      c.moveTo(fx - s(3), hy - s(12));
      c.lineTo(fx - s(1), hy - s(20));
      c.lineTo(fx + s(3), hy - s(12.5));
      c.fill();
      disc(c, fx + s(6), hy - s(9), s(1.2), '#ffd84a');
      oval(c, fx + s(14.5), hy - s(4), s(1.8), s(1.4), '#1a1410');
      for (let i = 0; i < 4; i++)
        line(
          c,
          fx - s(12) + i * s(1.5),
          hy + s(2) + i * s(3),
          fx - s(9) + i * s(1.5),
          hy + s(4) + i * s(3),
          s(0.9),
          shade(fur, 0.6),
        );
      break;
    }
    case 'crested':
    case 'plumed': {
      // Bronze helmet with cheek guard; a transverse crest or a tall flowing plume.
      c.fillStyle = dgrad(c, fx - s(11), hy - s(13), fx + s(10), hy + s(4), metal);
      c.beginPath();
      c.arc(fx, hy - s(1), s(11), Math.PI * 0.95, Math.PI * 2.05);
      c.lineTo(fx + s(4), hy + s(6));
      c.lineTo(fx - s(9), hy + s(6));
      c.closePath();
      c.fill();
      line(c, fx - s(10), hy - s(4), fx + s(10), hy - s(4), s(1.5), shade(metal, 0.7));
      line(c, fx - s(5), hy - s(11), fx + s(3), hy - s(12), s(1.5), shade(metal, 1.45));
      disc(c, fx + s(5), hy - s(1), s(1.5), '#1a120c');
      const plume = hero
        ? '#f3e6c4'
        : def.art.accent && look.helm === 'plumed'
          ? def.art.accent
          : '#b0473a';
      c.fillStyle = vgrad(c, hy - s(30), hy - s(9), plume);
      c.beginPath();
      if (look.helm === 'crested') {
        c.moveTo(fx - s(12), hy - s(10));
        c.quadraticCurveTo(fx - s(4), hy - s(28), fx + s(9), hy - s(13));
        c.quadraticCurveTo(fx - s(2), hy - s(17), fx - s(12), hy - s(10));
      } else {
        c.moveTo(fx + s(2), hy - s(12));
        c.quadraticCurveTo(fx - s(2), hy - s(25), fx - s(16), hy - s(21));
        c.quadraticCurveTo(fx - s(24), hy - s(14), fx - s(20), hy + s(2));
        c.quadraticCurveTo(fx - s(16), hy - s(14), fx - s(4), hy - s(12));
      }
      c.closePath();
      c.fill();
      for (let i = 0; i < 4; i++)
        line(
          c,
          fx - s(8) + i * s(3),
          hy - s(14) - i * s(2),
          fx - s(6) + i * s(3),
          hy - s(20) - i * s(1.5),
          s(0.8),
          shade(plume, 0.75),
        );
      break;
    }
    case 'nemes':
    case 'crown': {
      // Striped headcloth falling to the shoulders; heroes wear a tall golden crown above.
      const cloth = def.cls === 'worker' ? '#efe6cf' : '#2f5fa0';
      c.fillStyle = vgrad(c, hy - s(12), hy + s(10), cloth);
      c.beginPath();
      c.moveTo(fx - s(11), hy + s(9));
      c.lineTo(fx - s(12), hy - s(4));
      c.arc(fx, hy - s(3), s(11), Math.PI, Math.PI * 2);
      c.lineTo(fx + s(6), hy + s(1));
      c.lineTo(fx - s(5), hy + s(9));
      c.closePath();
      c.fill();
      const stripe = def.cls === 'worker' ? '#c9a24a' : GOLD;
      for (let i = 0; i < 4; i++)
        line(
          c,
          fx - s(11) + i * s(1.2),
          hy - s(8) + i * s(4.5),
          fx - s(4) + i * s(1.2),
          hy - s(8) + i * s(4.5),
          s(1.4),
          stripe,
        );
      rr(c, fx - s(11), hy - s(5), s(18), s(2.2), s(1), GOLD);
      if (look.helm === 'crown') {
        c.fillStyle = dgrad(c, fx - s(8), hy - s(28), fx + s(8), hy - s(10), GOLD);
        c.beginPath();
        c.moveTo(fx - s(8), hy - s(11));
        c.lineTo(fx - s(5), hy - s(23));
        c.lineTo(fx + s(5), hy - s(23));
        c.lineTo(fx + s(8), hy - s(11));
        c.closePath();
        c.fill();
        disc(c, fx, hy - s(17), s(2.6), '#2f5fa0');
        disc(c, fx, hy - s(17), s(1.2), '#7fd0ff');
      }
      break;
    }
  }
}

function weapon(c: Ctx, def: UnitDef, hx: number, hy: number, s: (v: number) => number): void {
  const w = def.art.weapon ?? 'none';
  const metal = def.faction === 'aurelian' ? BRONZE : STEEL;
  switch (w) {
    case 'javelin':
      line(c, hx - s(10), hy + s(8), hx + s(14), hy - s(34), s(2.2), WOOD);
      c.fillStyle = dgrad(c, hx + s(12), hy - s(42), hx + s(18), hy - s(32), metal);
      c.beginPath();
      c.moveTo(hx + s(17), hy - s(42));
      c.lineTo(hx + s(16), hy - s(32));
      c.lineTo(hx + s(12), hy - s(34));
      c.closePath();
      c.fill();
      break;
    case 'greatsword': {
      const g = c.createLinearGradient(hx, hy, hx + s(20), hy - s(36));
      g.addColorStop(0, '#f4f7fb');
      g.addColorStop(1, '#8e98a4');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(hx + s(1), hy - s(4));
      c.lineTo(hx + s(20), hy - s(38));
      c.lineTo(hx + s(23), hy - s(36));
      c.lineTo(hx + s(5), hy - s(2));
      c.closePath();
      c.fill();
      line(c, hx + s(3), hy - s(3), hx + s(19), hy - s(33), s(0.8), 'rgba(255,255,255,0.7)');
      line(c, hx - s(4), hy - s(6), hx + s(8), hy + s(1), s(3), GOLD);
      line(c, hx, hy, hx - s(4), hy + s(7), s(2.6), LEATHER);
      disc(c, hx - s(4.5), hy + s(8), s(2), GOLD);
      break;
    }
    case 'greataxe':
      line(c, hx - s(4), hy + s(14), hx + s(10), hy - s(32), s(3.4), WOOD);
      c.fillStyle = dgrad(c, hx + s(6), hy - s(40), hx + s(26), hy - s(14), metal);
      c.beginPath();
      c.moveTo(hx + s(8), hy - s(30));
      c.quadraticCurveTo(hx + s(30), hy - s(40), hx + s(24), hy - s(12));
      c.quadraticCurveTo(hx + s(16), hy - s(20), hx + s(6), hy - s(20));
      c.closePath();
      c.fill();
      line(c, hx + s(22), hy - s(34), hx + s(25), hy - s(15), s(1.2), 'rgba(255,255,255,0.6)');
      break;
    case 'spear':
      line(c, hx - s(2), hy + s(16), hx + s(8), hy - s(42), s(3), WOOD);
      c.fillStyle = dgrad(c, hx + s(4), hy - s(54), hx + s(12), hy - s(40), metal);
      c.beginPath();
      c.moveTo(hx + s(9.5), hy - s(55));
      c.lineTo(hx + s(13), hy - s(41));
      c.lineTo(hx + s(5), hy - s(42.5));
      c.closePath();
      c.fill();
      break;
    case 'sword': {
      const g = c.createLinearGradient(hx, hy, hx + s(18), hy - s(26));
      g.addColorStop(0, '#eef2f7');
      g.addColorStop(1, '#9aa3ad');
      if (def.faction === 'sahrun') {
        // Curved khopesh.
        c.strokeStyle = g;
        c.lineWidth = s(4);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(hx, hy);
        c.lineTo(hx + s(8), hy - s(12));
        c.quadraticCurveTo(hx + s(20), hy - s(22), hx + s(12), hy - s(30));
        c.stroke();
      } else line(c, hx, hy, hx + s(16), hy - s(26), s(4.2), g);
      line(c, hx - s(4), hy + s(2), hx + s(4), hy - s(5), s(3), GOLD);
      break;
    }
    case 'axe':
      line(c, hx - s(1), hy + s(8), hx + s(10), hy - s(24), s(3.2), WOOD);
      c.fillStyle = dgrad(c, hx + s(6), hy - s(30), hx + s(22), hy - s(10), STEEL);
      c.beginPath();
      c.moveTo(hx + s(7), hy - s(20));
      c.quadraticCurveTo(hx + s(26), hy - s(30), hx + s(19), hy - s(8));
      c.quadraticCurveTo(hx + s(14), hy - s(15), hx + s(7), hy - s(13));
      c.closePath();
      c.fill();
      break;
    case 'bow':
      c.strokeStyle = def.faction === 'sahrun' ? '#5a3a1e' : WOOD;
      c.lineWidth = s(3.2);
      c.beginPath();
      c.arc(hx - s(4), hy - s(2), s(18), -1.15, 1.15);
      c.stroke();
      line(c, hx + s(3.5), hy - s(18.5), hx + s(3.5), hy + s(14.5), s(1), '#f3ead8');
      line(c, hx - s(10), hy - s(2), hx + s(10), hy - s(2), s(1.6), '#d8c385');
      break;
    case 'sling':
      line(c, hx, hy, hx + s(9), hy - s(18), s(1.6), WOOD);
      disc(c, hx + s(10), hy - s(19), s(3.2), rgrad(c, hx + s(10), hy - s(19), s(3.2), '#8a8a8a'));
      break;
    case 'staff':
      line(c, hx, hy + s(22), hx + s(3), hy - s(34), s(3), WOOD);
      disc(c, hx + s(3), hy - s(38), s(7), 'rgba(255,230,140,0.35)');
      disc(
        c,
        hx + s(3),
        hy - s(38),
        s(5),
        rgrad(c, hx + s(3), hy - s(38), s(5), def.art.accent ?? GOLD),
      );
      break;
    case 'tool':
      line(c, hx, hy + s(6), hx + s(8), hy - s(20), s(3), WOOD);
      c.fillStyle = dgrad(c, hx - s(4), hy - s(24), hx + s(18), hy - s(14), STEEL);
      c.beginPath();
      c.moveTo(hx - s(4), hy - s(19));
      c.quadraticCurveTo(hx + s(7), hy - s(26), hx + s(18), hy - s(16));
      c.quadraticCurveTo(hx + s(7), hy - s(21), hx - s(4), hy - s(19));
      c.fill();
      break;
    default:
      break;
  }
}

/** A leg (thigh to boot) pivoting at the hip by `ang` radians, dressed for the armour type. */
function leg(
  c: Ctx,
  x: number,
  y: number,
  ang: number,
  s: (v: number) => number,
  look: Look,
  f: FactionId,
  pants: string,
  far: boolean,
): void {
  const bare = f !== 'hrimfolk';
  const tone = (col: string): string => (far ? shade(col, 0.88) : col);
  c.save();
  c.translate(x, y);
  c.rotate(-ang);
  const skin = SKIN[f];
  rr(c, -s(3.75), 0, s(7.5), s(19), s(3), vgrad(c, 0, s(19), tone(bare ? skin : pants)));
  if (look.armor === 'plate' || look.armor === 'scale') {
    // Bronze/steel greave over the shin.
    const m = f === 'aurelian' || look.armor === 'plate' ? BRONZE : STEEL;
    rr(c, -s(4.2), s(8), s(8.4), s(10), s(3), dgrad(c, -s(4), s(8), s(4), s(18), tone(m)));
  } else if (f === 'hrimfolk') {
    // Cross-gartered leg wraps.
    for (let i = 0; i < 3; i++)
      line(c, -s(3.5), s(9) + i * s(3), s(3.5), s(11) + i * s(3), s(1), shade(pants, 0.6));
  }
  if (bare && look.armor !== 'plate') {
    // Sandal straps.
    line(c, -s(3.5), s(15), s(3.5), s(17), s(1), LEATHER);
    rr(c, -s(4.5), s(18), s(10), s(3.5), s(1.5), tone(LEATHER));
  } else rr(c, -s(4.5), s(16), s(10), s(6.5), s(2.5), tone(f === 'hrimfolk' ? '#4a3626' : LEATHER));
  c.restore();
}

/** Torso outline shared by the clothing layers. */
function torsoPath(c: Ctx, fx: number, fy: number, s: (v: number) => number): void {
  c.beginPath();
  c.moveTo(fx - s(13), fy - s(20));
  c.lineTo(fx - s(12), fy - s(46));
  c.quadraticCurveTo(fx, fy - s(54), fx + s(12), fy - s(46));
  c.lineTo(fx + s(13), fy - s(20));
  c.closePath();
}

/** Body armour/clothing by type, with team colours and belt. */
function torso(
  c: Ctx,
  def: UnitDef,
  look: Look,
  team: string,
  fx: number,
  fy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  const body = def.art.body;
  const hero = def.cls === 'hero';
  const metal = hero ? GOLD : f === 'aurelian' ? BRONZE : STEEL;
  const base: Record<Armor, string> = {
    cloth: body,
    fur: shade(body, 0.9),
    leather: '#7a5230',
    mail: STEEL,
    scale: metal,
    plate: metal,
    linen: '#efe6cf',
  };
  c.fillStyle = vgrad(c, fy - s(52), fy - s(20), base[look.armor]);
  torsoPath(c, fx, fy, s);
  c.fill();
  c.save();
  torsoPath(c, fx, fy, s);
  c.clip();
  const tabard = (): void => {
    c.fillStyle = vgrad(c, fy - s(48), fy - s(18), team, 1.25, 0.75);
    c.beginPath();
    c.moveTo(fx - s(6), fy - s(48));
    c.lineTo(fx + s(6), fy - s(48));
    c.lineTo(fx + s(7), fy - s(17));
    c.lineTo(fx, fy - s(20));
    c.lineTo(fx - s(7), fy - s(17));
    c.closePath();
    c.fill();
    disc(c, fx, fy - s(38), s(2.6), shade(team, 1.6));
  };
  switch (look.armor) {
    case 'cloth':
      tabard();
      break;
    case 'fur':
      // Shaggy fur vest edges and a team sash.
      for (let i = 0; i < 9; i++) {
        const y = fy - s(48) + i * s(3.2);
        line(c, fx - s(13), y, fx - s(7), y + s(2), s(1.6), i % 2 ? '#d8c8a8' : '#a8916c');
        line(c, fx + s(13), y, fx + s(8), y + s(2), s(1.6), i % 2 ? '#d8c8a8' : '#a8916c');
      }
      line(c, fx - s(10), fy - s(48), fx + s(9), fy - s(24), s(4), team);
      break;
    case 'leather':
      for (let i = 0; i < 4; i++)
        line(
          c,
          fx - s(12),
          fy - s(42) + i * s(6),
          fx + s(12),
          fy - s(42) + i * s(6),
          s(0.8),
          shade('#7a5230', 0.6),
        );
      line(c, fx - s(10), fy - s(48), fx + s(9), fy - s(24), s(3.5), team);
      line(c, fx - s(10), fy - s(48), fx + s(9), fy - s(24), s(0.8), shade(team, 1.5));
      break;
    case 'mail': {
      // Ring texture under a team tabard.
      c.strokeStyle = shade(STEEL, 0.62);
      c.lineWidth = s(0.7);
      for (let y = fy - s(52); y < fy - s(18); y += s(2.6))
        for (let x = fx - s(14) + ((y / s(2.6)) % 2) * s(1.3); x < fx + s(14); x += s(2.6)) {
          c.beginPath();
          c.arc(x, y, s(1.1), 0, Math.PI);
          c.stroke();
        }
      tabard();
      break;
    }
    case 'scale': {
      c.strokeStyle = shade(metal, 0.6);
      c.lineWidth = s(0.8);
      let row = 0;
      for (let y = fy - s(50); y < fy - s(18); y += s(3), row++)
        for (let x = fx - s(14) + (row % 2) * s(1.8); x < fx + s(14); x += s(3.6)) {
          c.beginPath();
          c.arc(x, y, s(1.8), 0, Math.PI);
          c.stroke();
        }
      rr(c, fx - s(2.5), fy - s(48), s(5), s(26), s(1), team);
      break;
    }
    case 'plate':
      // Sculpted cuirass: chest and abdominal lines, a bright sheen.
      c.strokeStyle = shade(metal, 0.62);
      c.lineWidth = s(1.1);
      c.beginPath();
      c.moveTo(fx - s(9), fy - s(40));
      c.quadraticCurveTo(fx - s(4), fy - s(36), fx, fy - s(39));
      c.quadraticCurveTo(fx + s(4), fy - s(36), fx + s(9), fy - s(40));
      c.moveTo(fx, fy - s(39));
      c.lineTo(fx, fy - s(24));
      c.moveTo(fx - s(6), fy - s(31));
      c.lineTo(fx + s(6), fy - s(31));
      c.stroke();
      oval(c, fx - s(5), fy - s(45), s(4), s(2.5), 'rgba(255,255,255,0.35)');
      break;
    case 'linen': {
      for (let i = 0; i < 7; i++)
        line(
          c,
          fx - s(10) + i * s(3.3),
          fy - s(44),
          fx - s(11) + i * s(3.6),
          fy - s(20),
          s(0.6),
          'rgba(140,120,80,0.45)',
        );
      // Broad beaded collar.
      const ring = (r: number, col: string, w: number): void => {
        c.strokeStyle = col;
        c.lineWidth = s(w);
        c.beginPath();
        c.arc(fx, fy - s(52), s(r), Math.PI * 0.15, Math.PI * 0.85);
        c.stroke();
      };
      ring(6, GOLD, 2.2);
      ring(8.3, '#3aa8a0', 2);
      ring(10.5, team, 2);
      ring(12.5, GOLD, 1.6);
      break;
    }
  }
  c.restore();
  // Belt with buckle.
  rr(c, fx - s(13), fy - s(26), s(26), s(4), s(2), LEATHER);
  rr(c, fx - s(2), fy - s(26.5), s(4), s(5), s(1), GOLD);
  // Shoulder guards for armoured troops.
  if (look.armor === 'mail' || look.armor === 'scale' || look.armor === 'plate') {
    const m = look.armor === 'mail' ? STEEL : metal;
    oval(
      c,
      fx - s(10),
      fy - s(46),
      s(5.5),
      s(4.2),
      dgrad(c, fx - s(15), fy - s(50), fx - s(5), fy - s(42), m),
    );
    line(c, fx - s(14), fy - s(44), fx - s(6), fy - s(43), s(0.8), shade(m, 0.6));
  } else if (look.armor === 'fur') {
    oval(c, fx - s(9), fy - s(47), s(6), s(4), vgrad(c, fy - s(51), fy - s(43), '#c8b48c'));
  }
}

/** Skirt below the belt: pteruges, pleated kilt or tunic hem. */
function kilt(
  c: Ctx,
  def: UnitDef,
  look: Look,
  team: string,
  fx: number,
  fy: number,
  s: (v: number) => number,
): void {
  const f = def.faction;
  if (f === 'aurelian' && (look.armor === 'plate' || look.armor === 'scale')) {
    for (let i = 0; i < 7; i++) {
      const x = fx - s(12) + i * s(3.6);
      rr(
        c,
        x,
        fy - s(23),
        s(3.2),
        s(10),
        s(1),
        vgrad(c, fy - s(23), fy - s(13), i % 2 ? team : '#e8dcc0'),
      );
    }
  } else if (f === 'sahrun') {
    c.fillStyle = vgrad(c, fy - s(24), fy - s(12), '#f2ead6');
    c.beginPath();
    c.moveTo(fx - s(12), fy - s(24));
    c.lineTo(fx + s(12), fy - s(24));
    c.lineTo(fx + s(14), fy - s(12));
    c.lineTo(fx - s(13), fy - s(12));
    c.closePath();
    c.fill();
    for (let i = 0; i < 6; i++)
      line(
        c,
        fx - s(10) + i * s(4),
        fy - s(23),
        fx - s(11) + i * s(4.6),
        fy - s(12.5),
        s(0.6),
        'rgba(140,120,80,0.5)',
      );
    rr(c, fx - s(3), fy - s(24), s(6), s(11), s(1), team);
  } else {
    c.fillStyle = vgrad(c, fy - s(24), fy - s(14), shade(def.art.body, 0.8));
    c.beginPath();
    c.moveTo(fx - s(12), fy - s(24));
    c.lineTo(fx + s(12), fy - s(24));
    c.lineTo(fx + s(13), fy - s(15));
    c.lineTo(fx - s(13), fy - s(15));
    c.closePath();
    c.fill();
  }
}

/** Shield on the off-hand side. */
function shieldArt(
  c: Ctx,
  kind: ShieldKind,
  team: string,
  sx: number,
  sy: number,
  s: (v: number) => number,
): void {
  switch (kind) {
    case 'round': {
      // Planked wood painted in team quarters, iron rim and boss.
      disc(c, sx, sy, s(12), shade(STEEL, 0.7));
      disc(c, sx, sy, s(10.5), rgrad(c, sx, sy, s(10.5), team));
      c.fillStyle = shade(team, 0.55);
      c.beginPath();
      c.moveTo(sx, sy);
      c.arc(sx, sy, s(10.5), 0, Math.PI / 2);
      c.closePath();
      c.moveTo(sx, sy);
      c.arc(sx, sy, s(10.5), Math.PI, Math.PI * 1.5);
      c.closePath();
      c.fill();
      for (let i = -2; i <= 2; i++)
        line(c, sx + i * s(4), sy - s(9.5), sx + i * s(4), sy + s(9.5), s(0.6), 'rgba(0,0,0,0.2)');
      disc(c, sx, sy, s(3.2), rgrad(c, sx, sy, s(3.2), STEEL));
      break;
    }
    case 'hoplon': {
      // Large bronze-rimmed round shield with a painted sun emblem.
      disc(c, sx, sy, s(14), dgrad(c, sx - s(14), sy - s(14), sx + s(14), sy + s(14), BRONZE));
      disc(c, sx, sy, s(11.5), rgrad(c, sx, sy, s(11.5), team));
      c.strokeStyle = shade(team, 1.7);
      c.lineWidth = s(1.4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        line(
          c,
          sx + Math.cos(a) * s(4),
          sy + Math.sin(a) * s(4),
          sx + Math.cos(a) * s(8.5),
          sy + Math.sin(a) * s(8.5),
          s(1.4),
          shade(team, 1.7),
        );
      }
      disc(c, sx, sy, s(3), shade(team, 1.7));
      break;
    }
    case 'tower':
      rr(
        c,
        sx - s(9),
        sy - s(18),
        s(18),
        s(34),
        s(6),
        dgrad(c, sx - s(9), sy - s(18), sx + s(9), sy + s(16), shade(team, 0.6)),
      );
      rr(c, sx - s(7), sy - s(16), s(14), s(30), s(5), vgrad(c, sy - s(16), sy + s(14), team));
      line(c, sx, sy - s(15), sx, sy + s(13), s(2), GOLD);
      for (let i = 0; i < 3; i++)
        disc(c, sx - s(3.5) + i * s(3.5), sy - s(9) + i * s(9), s(1.6), '#f2ead6');
      break;
    case 'oval':
      oval(c, sx, sy, s(9), s(14), shade(team, 0.55));
      oval(c, sx, sy, s(7), s(12), vgrad(c, sy - s(12), sy + s(12), team));
      line(c, sx, sy - s(10), sx, sy + s(10), s(2), GOLD);
      disc(c, sx, sy, s(2.2), GOLD);
      break;
    case 'none':
      break;
  }
}

/** Hero/officer cape hanging behind the body. */
function capeArt(c: Ctx, team: string, fx: number, fy: number, s: (v: number) => number): void {
  c.fillStyle = vgrad(c, fy - s(52), fy - s(6), team, 1.1, 0.55);
  c.beginPath();
  c.moveTo(fx - s(9), fy - s(50));
  c.quadraticCurveTo(fx - s(26), fy - s(22), fx - s(20), fy - s(5));
  c.quadraticCurveTo(fx - s(9), fy - s(10), fx + s(2), fy - s(12));
  c.lineTo(fx + s(4), fy - s(48));
  c.closePath();
  c.fill();
  // Gold hem.
  c.strokeStyle = GOLD;
  c.lineWidth = s(1.5);
  c.beginPath();
  c.moveTo(fx - s(20), fy - s(5));
  c.quadraticCurveTo(fx - s(9), fy - s(10), fx + s(2), fy - s(12));
  c.stroke();
}

/** Humanoid with feet at (fx, fy); `k` scales it (riders use a smaller one). */
function humanoid(
  c: Ctx,
  def: UnitDef,
  team: string,
  fx: number,
  fy: number,
  k: number,
  pose: Pose = {},
): void {
  const s = (v: number): number => v * k;
  const f = def.faction;
  const skin = SKIN[f];
  const look = lookOf(def);
  const pants = shade(def.art.body, 0.55);
  const armored = look.armor === 'mail' || look.armor === 'scale' || look.armor === 'plate';
  const weaponKind = def.art.weapon ?? 'none';
  if (look.cape) capeArt(c, team, fx, fy, s);
  // Javelins / quiver carried on the back.
  if (!pose.act && !pose.carry) {
    if (weaponKind === 'javelin')
      for (let i = 0; i < 2; i++)
        line(c, fx - s(14) + i * s(3), fy - s(18), fx - s(4) + i * s(3), fy - s(62), s(1.8), WOOD);
    if (weaponKind === 'bow') {
      rr(c, fx - s(16), fy - s(54), s(6.5), s(20), s(2), vgrad(c, fy - s(54), fy - s(34), LEATHER));
      for (let i = 0; i < 3; i++)
        line(
          c,
          fx - s(14) + i * s(1.8),
          fy - s(54),
          fx - s(15) + i * s(1.8),
          fy - s(59),
          s(1.4),
          '#efe6cf',
        );
    }
  }
  // Back arm, with a bracer on armoured or leather-clad troops.
  line(c, fx - s(8), fy - s(44), fx - s(14), fy - s(26), s(6), shade(skin, 0.8));
  if (armored || look.armor === 'leather')
    line(
      c,
      fx - s(12),
      fy - s(32),
      fx - s(13.5),
      fy - s(27),
      s(6.5),
      shade(look.armor === 'leather' ? LEATHER : f === 'aurelian' ? BRONZE : STEEL, 0.85),
    );
  // Legs.
  if (pose.stride) {
    leg(c, fx - s(3), fy - s(23), 0.38, s, look, f, pants, true);
    leg(c, fx + s(3), fy - s(23), -0.32, s, look, f, pants, false);
  } else {
    leg(c, fx - s(5.25), fy - s(24), 0, s, look, f, pants, true);
    leg(c, fx + s(5.25), fy - s(24), 0, s, look, f, pants, false);
  }
  kilt(c, def, look, team, fx, fy, s);
  torso(c, def, look, team, fx, fy, s);
  if (pose.carry === 'gold') sack(c, fx - s(12), fy - s(40), s);
  if (pose.carry === 'wood') {
    // Logs balanced across the shoulders, behind the head.
    for (let i = 0; i < 3; i++) {
      const ly = fy - s(55) + i * s(4.5);
      const lx = fx - s(20) + (i % 2) * s(3);
      rr(c, lx, ly, s(34), s(5.5), s(2.7), vgrad(c, ly, ly + s(5.5), '#8a6440'));
      disc(c, lx + s(34), ly + s(2.75), s(2.7), '#d9b07a');
    }
  }
  head(c, def, look, fx, fy - s(60), s);
  if (pose.act || pose.carry) {
    workerArm(c, pose, fx, fy, s, skin);
    return;
  }
  const hand = (hx: number, hy: number): void =>
    disc(c, hx, hy, s(3.6), rgrad(c, hx, hy, s(3.6), skin));
  if (weaponKind === 'horn') {
    // War horn raised to the lips.
    const hx = fx + s(11);
    const hy = fy - s(55);
    line(c, fx + s(8), fy - s(46), hx, hy, s(6), shade(skin, 0.95));
    c.fillStyle = dgrad(c, fx + s(8), fy - s(62), fx + s(28), fy - s(40), '#efe2c0');
    c.beginPath();
    c.moveTo(fx + s(8), fy - s(56));
    c.quadraticCurveTo(fx + s(18), fy - s(62), fx + s(26), fy - s(50));
    c.lineTo(fx + s(31), fy - s(44));
    c.lineTo(fx + s(22), fy - s(46));
    c.quadraticCurveTo(fx + s(17), fy - s(56), fx + s(9), fy - s(53));
    c.closePath();
    c.fill();
    for (let i = 0; i < 3; i++)
      line(
        c,
        fx + s(13) + i * s(4),
        fy - s(58) + i * s(2),
        fx + s(13) + i * s(4),
        fy - s(54) + i * s(2.5),
        s(1.2),
        GOLD,
      );
    hand(hx, hy);
  } else if (weaponKind === 'banner') {
    // Standard: tall pole, team flag with an emblem, gilded finial.
    const hx = fx + s(13);
    const hy = fy - s(38);
    line(c, fx + s(8), fy - s(46), hx, hy, s(6), shade(skin, 0.95));
    line(c, hx, hy + s(30), hx + s(1), hy - s(44), s(2.6), WOOD);
    c.fillStyle = vgrad(c, hy - s(40), hy - s(14), team, 1.2, 0.7);
    c.beginPath();
    c.moveTo(hx + s(1.5), hy - s(40));
    c.quadraticCurveTo(hx + s(12), hy - s(43), hx + s(22), hy - s(39));
    c.lineTo(hx + s(21), hy - s(16));
    c.quadraticCurveTo(hx + s(12), hy - s(20), hx + s(1.5), hy - s(16));
    c.closePath();
    c.fill();
    disc(c, hx + s(11), hy - s(29), s(4.5), GOLD);
    disc(c, hx + s(11), hy - s(29), s(2.4), shade(team, 0.6));
    line(c, hx - s(1), hy - s(44), hx + s(3), hy - s(44), s(2.4), GOLD);
    disc(c, hx + s(1), hy - s(47), s(2.6), rgrad(c, hx + s(1), hy - s(47), s(2.6), GOLD));
    hand(hx, hy);
  } else {
    // Front arm + hand holding the weapon (two-handed weapons are held lower).
    const two = weaponKind === 'greatsword' || weaponKind === 'greataxe';
    const hx = fx + s(two ? 12 : 14);
    const hy = fy - s(two ? 32 : 36);
    line(c, fx + s(8), fy - s(46), hx, hy, s(6), shade(skin, 0.95));
    if (armored)
      line(
        c,
        hx - s(4),
        hy - s(5),
        hx - s(1),
        hy - s(1.5),
        s(6.5),
        shade(f === 'aurelian' ? BRONZE : STEEL, 0.9),
      );
    weapon(c, def, hx, hy, s);
    hand(hx, hy);
  }
  if (look.shield !== 'none') {
    const big = look.shield === 'tower' || look.shield === 'hoplon';
    shieldArt(c, look.shield, team, fx - s(big ? 12 : 13), fy - s(big ? 32 : 34), s);
  }
}

/** Tool kinds drawn by `tool()`; the handle runs "up" from the hand before rotation. */
type ToolKind = 'axe' | 'pick' | 'hammer' | 'hoe' | 'rod';

/** Draw a tool gripped at (hx, hy), rotated `deg` degrees clockwise from pointing straight up. */
function tool(
  c: Ctx,
  kind: ToolKind,
  hx: number,
  hy: number,
  deg: number,
  s: (v: number) => number,
): void {
  c.save();
  c.translate(hx, hy);
  c.rotate((deg * Math.PI) / 180);
  const metal = (x0: number, y0: number, x1: number, y1: number): CanvasGradient =>
    dgrad(c, x0, y0, x1, y1, STEEL);
  switch (kind) {
    case 'axe':
      line(c, 0, s(6), 0, -s(28), s(3.2), WOOD);
      c.fillStyle = metal(0, -s(34), s(14), -s(18));
      c.beginPath();
      c.moveTo(0, -s(28));
      c.quadraticCurveTo(s(14), -s(34), s(12), -s(16));
      c.quadraticCurveTo(s(7), -s(21), 0, -s(20));
      c.closePath();
      c.fill();
      break;
    case 'pick':
      line(c, 0, s(6), 0, -s(28), s(3.2), WOOD);
      c.strokeStyle = metal(-s(14), -s(30), s(14), -s(24));
      c.lineWidth = s(3.6);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-s(13), -s(20));
      c.quadraticCurveTo(0, -s(33), s(14), -s(21));
      c.stroke();
      break;
    case 'hammer':
      line(c, 0, s(5), 0, -s(20), s(3), WOOD);
      rr(c, -s(5), -s(27), s(12), s(8), s(1.5), metal(-s(5), -s(27), s(7), -s(19)));
      break;
    case 'hoe':
      line(c, 0, s(10), 0, -s(36), s(3), WOOD);
      c.fillStyle = metal(0, -s(40), s(10), -s(30));
      c.beginPath();
      c.moveTo(-s(1), -s(36));
      c.lineTo(s(11), -s(33));
      c.lineTo(s(10), -s(28));
      c.lineTo(-s(1), -s(32));
      c.closePath();
      c.fill();
      break;
    case 'rod':
      c.strokeStyle = WOOD;
      c.lineWidth = s(2.2);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, s(6));
      c.quadraticCurveTo(s(2), -s(18), s(4), -s(36));
      c.stroke();
      break;
  }
  c.restore();
}

/** Worker front arm for work and carry poses (and what the off hand holds). */
function workerArm(
  c: Ctx,
  pose: Pose,
  fx: number,
  fy: number,
  s: (v: number) => number,
  skin: string,
): void {
  const shx = fx + s(8);
  const shy = fy - s(46);
  const arm = (dx: number, dy: number): [number, number] => {
    const hx = shx + s(dx);
    const hy = shy + s(dy);
    line(c, shx, shy, hx, hy, s(6), shade(skin, 0.95));
    return [hx, hy];
  };
  const hand = (hx: number, hy: number): void =>
    disc(c, hx, hy, s(3.6), rgrad(c, hx, hy, s(3.6), skin));
  const f = pose.frame ?? 0;
  if (pose.act) {
    switch (pose.act) {
      case 'chop':
      case 'mine': {
        const kind = pose.act === 'chop' ? 'axe' : 'pick';
        // Wind-up over the shoulder, then the swing lands in front.
        const [hx, hy] = f === 0 ? arm(-2, -12) : arm(14, 5);
        tool(c, kind, hx, hy, f === 0 ? -78 : pose.act === 'chop' ? 95 : 115, s);
        hand(hx, hy);
        break;
      }
      case 'build': {
        const [hx, hy] = f === 0 ? arm(3, -15) : arm(14, 3);
        tool(c, 'hammer', hx, hy, f === 0 ? -35 : 85, s);
        hand(hx, hy);
        break;
      }
      case 'farm': {
        // Two-handed hoe: the back hand also grips the shaft.
        const [hx, hy] = f === 0 ? arm(4, -8) : arm(13, 6);
        tool(c, 'hoe', hx, hy, f === 0 ? -62 : 138, s);
        hand(hx, hy);
        break;
      }
      case 'pick': {
        basket(c, fx + s(13), fy - s(25), s, 'berries');
        if (f === 0) {
          const [hx, hy] = arm(15, -8);
          hand(hx, hy);
          disc(c, hx + s(3), hy - s(3), s(2.4), '#d8304a');
        } else {
          const [hx, hy] = arm(6, 12);
          hand(hx, hy);
        }
        break;
      }
      case 'fish': {
        const [hx, hy] = arm(11, 1);
        tool(c, 'rod', hx, hy, f === 0 ? ROD_DEG[0] : ROD_DEG[1], s);
        hand(hx, hy);
        break;
      }
    }
    return;
  }
  switch (pose.carry) {
    case 'wood': {
      const [hx, hy] = arm(4, -6);
      hand(hx, hy);
      break;
    }
    case 'gold': {
      const [hx, hy] = arm(5, 10);
      hand(hx, hy);
      break;
    }
    case 'berries':
    case 'grain': {
      basket(c, fx + s(14), fy - s(30), s, pose.carry);
      const [hx, hy] = arm(8, 14);
      hand(hx, hy);
      break;
    }
    case 'fish': {
      const [hx, hy] = arm(9, 12);
      line(c, hx, hy, hx + s(1), hy + s(6), s(1.2), '#d8c385');
      for (let i = 0; i < 2; i++) {
        const cx = hx + s(1) + i * s(3);
        const cy = hy + s(13) + i * s(2);
        oval(c, cx, cy, s(2.6), s(7), vgrad(c, cy - s(7), cy + s(7), '#9fb8c8'));
        c.fillStyle = '#7d96a8';
        c.beginPath();
        c.moveTo(cx, cy + s(6));
        c.lineTo(cx - s(3), cy + s(10));
        c.lineTo(cx + s(3), cy + s(10));
        c.closePath();
        c.fill();
      }
      hand(hx, hy);
      break;
    }
  }
}

/** Woven basket with its contents peeking out. */
function basket(
  c: Ctx,
  x: number,
  y: number,
  s: (v: number) => number,
  contents: 'berries' | 'grain',
): void {
  if (contents === 'berries') {
    for (let i = 0; i < 5; i++)
      disc(c, x - s(5) + i * s(2.5), y - s(3) - (i % 2) * s(1.5), s(2.4), '#d8304a');
  } else {
    for (let i = 0; i < 5; i++)
      line(c, x - s(4) + i * s(2), y, x - s(6) + i * s(3), y - s(11), s(1.4), '#e2c060');
  }
  c.fillStyle = vgrad(c, y - s(2), y + s(9), '#b08548');
  c.beginPath();
  c.moveTo(x - s(8), y - s(2));
  c.lineTo(x + s(8), y - s(2));
  c.lineTo(x + s(6), y + s(8));
  c.lineTo(x - s(6), y + s(8));
  c.closePath();
  c.fill();
  for (let i = 0; i < 3; i++)
    line(c, x - s(7), y + i * s(3), x + s(7), y + i * s(3), s(0.8), '#7a5634');
}

/** Bulging ore sack slung on the back, nuggets glinting at the mouth. */
function sack(c: Ctx, x: number, y: number, s: (v: number) => number): void {
  oval(c, x, y + s(4), s(8), s(10), vgrad(c, y - s(6), y + s(14), '#a08060'));
  disc(c, x - s(2), y - s(6), s(2.6), rgrad(c, x - s(2), y - s(6), s(2.6), GOLD));
  disc(c, x + s(2.5), y - s(5), s(2.2), rgrad(c, x + s(2.5), y - s(5), s(2.2), GOLD));
}

const ROD_DEG = [35, 46] as const;

/**
 * Rod tip of the fishing pose in the 100×100 design box (feet at (50, 86)); the renderer draws
 * the line from here to the fishing spot. Hand at (69, 41), tip at local (4, -36) rotated.
 */
export function rodTip(frame: 0 | 1): [number, number] {
  const a = (ROD_DEG[frame] * Math.PI) / 180;
  return [69 + 4 * Math.cos(a) + 36 * Math.sin(a), 41 + 4 * Math.sin(a) - 36 * Math.cos(a)];
}

// ───────────────────────── riders & engines ─────────────────────────

function mount(c: Ctx, kind: 'horse' | 'wolf', color: string, x: number, y: number): void {
  const dark = shade(color, 0.7);
  // Legs (far pair darker).
  for (const [lx, d] of [
    [x - 16, dark],
    [x + 12, dark],
    [x - 10, color],
    [x + 18, color],
  ] as const) {
    line(c, lx, y + 4, lx - 1, y + 26, 5, d);
    oval(c, lx - 1, y + 26, 3.2, 2, '#2a2018');
  }
  // Body.
  oval(c, x, y, 25, 12, vgrad(c, y - 12, y + 12, color));
  // Tail.
  if (kind === 'wolf') {
    c.fillStyle = vgrad(c, y - 16, y, color);
    c.beginPath();
    c.moveTo(x - 22, y - 4);
    c.quadraticCurveTo(x - 38, y - 14, x - 36, y - 2);
    c.quadraticCurveTo(x - 30, y + 2, x - 22, y + 2);
    c.fill();
  } else line(c, x - 23, y - 4, x - 30, y + 14, 5, shade(color, 0.5));
  // Neck + head.
  c.fillStyle = vgrad(c, y - 30, y, color);
  c.beginPath();
  c.moveTo(x + 14, y - 8);
  c.lineTo(x + 26, y - 26);
  c.lineTo(x + 34, y - 22);
  c.lineTo(x + 24, y + 2);
  c.closePath();
  c.fill();
  if (kind === 'wolf') {
    oval(c, x + 33, y - 23, 10, 7, rgrad(c, x + 33, y - 23, 10, color));
    c.fillStyle = dark;
    c.beginPath();
    c.moveTo(x + 27, y - 28);
    c.lineTo(x + 29, y - 38);
    c.lineTo(x + 34, y - 29);
    c.fill();
    oval(c, x + 42, y - 21, 5, 3.5, shade(color, 0.9));
    disc(c, x + 35, y - 25, 1.6, '#ffd84a');
  } else {
    oval(c, x + 35, y - 24, 9, 6, rgrad(c, x + 35, y - 24, 9, color), 0.4);
    disc(c, x + 34, y - 27, 1.4, '#140c08');
    // Mane.
    line(c, x + 22, y - 24, x + 15, y - 6, 4, shade(color, 0.45));
  }
}

/** Camel: long legs, a hump and a long curved neck. */
function camel(c: Ctx, color: string, x: number, y: number): void {
  const dark = shade(color, 0.72);
  for (const [lx, d] of [
    [x - 15, dark],
    [x + 13, dark],
    [x - 9, color],
    [x + 19, color],
  ] as const) {
    line(c, lx, y + 4, lx - 1, y + 30, 4.2, d);
    oval(c, lx - 1, y + 30, 3.4, 1.8, '#3a2c1c');
  }
  oval(c, x, y, 24, 11, vgrad(c, y - 11, y + 11, color));
  oval(c, x - 3, y - 10, 12, 9, vgrad(c, y - 19, y - 2, color));
  line(c, x - 22, y - 2, x - 27, y + 12, 3, shade(color, 0.5));
  c.strokeStyle = vgrad(c, y - 34, y, color);
  c.lineWidth = 8;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x + 18, y - 2);
  c.quadraticCurveTo(x + 30, y - 6, x + 30, y - 26);
  c.stroke();
  oval(c, x + 35, y - 28, 8, 4.5, rgrad(c, x + 35, y - 28, 8, color), 0.2);
  disc(c, x + 34, y - 30, 1.3, '#140c08');
  // Tasselled bridle in team-friendly colours.
  line(c, x + 28, y - 24, x + 38, y - 26, 1.2, '#b0473a');
  disc(c, x + 27, y - 18, 1.6, GOLD);
}

function rider(c: Ctx, def: UnitDef, team: string): void {
  const f = def.faction;
  const kind = def.art.mount ?? (f === 'sahrun' ? 'chariot' : f === 'hrimfolk' ? 'wolf' : 'horse');
  if (kind === 'camel') {
    camel(c, def.art.body, 52, 58);
    c.fillStyle = vgrad(c, 40, 60, team);
    c.beginPath();
    c.moveTo(38, 44);
    c.lineTo(58, 44);
    c.lineTo(56, 60);
    c.lineTo(40, 60);
    c.closePath();
    c.fill();
    humanoid(c, def, team, 49, 50, 0.6);
    return;
  }
  if (kind === 'chariot') {
    // Chariot: horse pulling a light car with a standing archer.
    mount(c, 'horse', '#c9a46a', 64, 58);
    line(c, 30, 64, 50, 58, 3, WOOD);
    rr(c, 8, 50, 30, 24, 6, vgrad(c, 50, 74, def.art.body));
    rr(c, 8, 50, 30, 5, 3, team);
    disc(c, 22, 78, 11, shade(WOOD, 0.7));
    disc(c, 22, 78, 8, shade(WOOD, 1.1));
    for (let a = 0; a < 6; a++)
      line(c, 22, 78, 22 + Math.cos(a) * 8, 78 + Math.sin(a) * 8, 1.5, shade(WOOD, 0.6));
    disc(c, 22, 78, 2.5, GOLD);
    humanoid(c, def, team, 24, 54, 0.6);
    return;
  }
  mount(c, kind, def.art.body, 52, 58);
  // Saddle cloth in team colour.
  c.fillStyle = vgrad(c, 46, 64, team);
  c.beginPath();
  c.moveTo(40, 48);
  c.lineTo(62, 48);
  c.lineTo(60, 66);
  c.lineTo(42, 66);
  c.closePath();
  c.fill();
  humanoid(c, def, team, 52, 56, 0.6);
}

function engine(c: Ctx, def: UnitDef, team: string): void {
  const wood = def.art.body;
  const ranged = !!def.attack && def.attack.range > 2;
  // Chassis.
  rr(c, 10, 52, 78, 16, 4, vgrad(c, 52, 68, wood));
  for (let i = 0; i < 4; i++) line(c, 16 + i * 20, 53, 16 + i * 20, 67, 1.5, shade(wood, 0.6));
  if (ranged) {
    if (def.faction === 'sahrun') {
      // Sun lens: a big polished disc on a frame.
      line(c, 50, 52, 50, 26, 6, shade(wood, 0.8));
      disc(c, 52, 22, 17, '#8a6a1a');
      const g = c.createRadialGradient(46, 16, 2, 52, 22, 15);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.5, def.art.accent ?? '#ffe58a');
      g.addColorStop(1, '#c08a20');
      disc(c, 52, 22, 14, g);
    } else {
      // Torsion arm + bucket.
      rr(c, 26, 40, 46, 12, 3, vgrad(c, 40, 52, shade(wood, 0.9)));
      line(c, 34, 44, 74, 12, 6, vgrad(c, 12, 44, shade(wood, 1.1)));
      disc(c, 76, 11, 8, rgrad(c, 76, 11, 8, def.art.accent ?? '#9a9a9a'));
      oval(c, 34, 46, 7, 5, shade(team, 0.9));
    }
  } else {
    // Covered ram with a metal head.
    c.fillStyle = vgrad(c, 22, 52, shade(wood, 0.95));
    c.beginPath();
    c.moveTo(14, 52);
    c.lineTo(26, 24);
    c.lineTo(72, 24);
    c.lineTo(84, 52);
    c.closePath();
    c.fill();
    for (let i = 0; i < 5; i++) line(c, 28 + i * 10, 25, 22 + i * 12, 51, 1.5, shade(wood, 0.7));
    rr(c, 70, 36, 24, 12, 4, dgrad(c, 70, 36, 94, 48, def.art.accent ?? STEEL));
  }
  for (const wx of [24, 74]) {
    disc(c, wx, 72, 12, shade(WOOD, 0.6));
    disc(c, wx, 72, 9, vgrad(c, 63, 81, WOOD));
    disc(c, wx, 72, 3, GOLD);
  }
  // Team pennant.
  line(c, 16, 52, 16, 14, 3, shade(WOOD, 0.8));
  c.fillStyle = vgrad(c, 14, 30, team);
  c.beginPath();
  c.moveTo(17, 14);
  c.lineTo(36, 20);
  c.lineTo(17, 28);
  c.closePath();
  c.fill();
}

// ───────────────────────── mythic creatures ─────────────────────────

function eye(c: Ctx, x: number, y: number, r: number, glow: string): void {
  disc(c, x, y, r * 2.2, `${glow}55`);
  disc(c, x, y, r, glow);
  disc(c, x - r * 0.3, y - r * 0.3, r * 0.35, '#ffffff');
}

function giant(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  rr(c, 32, 60, 13, 26, 5, vgrad(c, 60, 86, shade(b, 0.65)));
  rr(c, 54, 60, 13, 26, 5, vgrad(c, 60, 86, shade(b, 0.55)));
  line(c, 30, 34, 16, 62, 13, shade(b, 0.75));
  c.fillStyle = vgrad(c, 22, 70, b);
  c.beginPath();
  c.moveTo(26, 64);
  c.quadraticCurveTo(18, 30, 36, 24);
  c.quadraticCurveTo(50, 18, 66, 24);
  c.quadraticCurveTo(84, 32, 74, 64);
  c.closePath();
  c.fill();
  // Crystalline/ember plates.
  for (const [x, y, r] of [
    [38, 36, 6],
    [58, 32, 5],
    [62, 48, 6],
    [42, 52, 4],
  ] as const) {
    c.fillStyle = dgrad(c, x - r, y - r, x + r, y + r, a);
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
    c.fill();
  }
  rr(c, 28, 58, 44, 8, 4, vgrad(c, 58, 66, team));
  disc(c, 50, 18, 12, rgrad(c, 50, 18, 12, shade(b, 1.1)));
  eye(c, 54, 16, 2.4, a);
  eye(c, 46, 16, 2.4, a);
  line(c, 70, 34, 86, 58, 13, shade(b, 0.9));
  disc(c, 87, 60, 9, rgrad(c, 87, 60, 9, shade(b, 0.8)));
}

function serpent(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  c.lineCap = 'round';
  const path = (): void => {
    c.beginPath();
    c.moveTo(8, 80);
    c.bezierCurveTo(30, 58, 48, 94, 62, 66);
    c.bezierCurveTo(70, 50, 60, 38, 74, 28);
  };
  path();
  c.strokeStyle = shade(b, 0.6);
  c.lineWidth = 20;
  c.stroke();
  path();
  c.strokeStyle = b;
  c.lineWidth = 15;
  c.stroke();
  path();
  c.strokeStyle = shade(b, 1.35);
  c.lineWidth = 5;
  c.stroke();
  // Belly scales.
  c.setLineDash([3, 4]);
  path();
  c.strokeStyle = a;
  c.lineWidth = 3;
  c.stroke();
  c.setLineDash([]);
  // Hood/frills and head.
  oval(c, 72, 30, 16, 12, shade(b, 0.8), -0.3);
  oval(c, 82, 24, 13, 9, rgrad(c, 82, 24, 13, b), -0.2);
  eye(c, 86, 20, 2.3, '#ffe066');
  line(c, 93, 27, 97, 33, 2, '#fff');
  rr(c, 62, 34, 15, 6, 3, team);
}

function beast(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.4);
  for (const [lx, d] of [
    [28, 0.6],
    [64, 0.6],
    [38, 0.85],
    [74, 0.85],
  ] as const) {
    line(c, lx, 60, lx - 2, 84, 8, shade(b, d));
    oval(c, lx - 2, 85, 5, 2.5, '#1a1410');
  }
  c.fillStyle = vgrad(c, 40, 72, b);
  c.beginPath();
  c.ellipse(50, 56, 31, 16, 0, 0, Math.PI * 2);
  c.fill();
  // Shaggy mane.
  for (let i = 0; i < 6; i++)
    oval(c, 60 + i * 3, 46 + (i % 2) * 3, 7, 9, shade(b, 0.8 + (i % 3) * 0.1));
  line(c, 22, 50, 6, 36, 7, shade(b, 0.8));
  oval(c, 84, 44, 14, 12, rgrad(c, 84, 44, 14, b));
  c.fillStyle = shade(b, 0.7);
  c.beginPath();
  c.moveTo(77, 36);
  c.lineTo(80, 21);
  c.lineTo(87, 34);
  c.fill();
  oval(c, 95, 49, 7, 5, shade(b, 0.9));
  eye(c, 88, 41, 2.2, a);
  line(c, 90, 54, 96, 54, 1.5, '#fff');
  rr(c, 66, 48, 9, 16, 3, team);
}

function flyer(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? shade(b, 1.3);
  const wing = (x0: number, y0: number, tipx: number, tipy: number, back: boolean): void => {
    c.fillStyle = vgrad(c, tipy, y0 + 8, shade(b, back ? 0.75 : 1));
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + tipx) / 2, tipy - 6, tipx, tipy);
    c.lineTo(x0 + (tipx - x0) * 0.6, y0 + 6);
    c.lineTo(x0 + (tipx - x0) * 0.3, y0 + 10);
    c.closePath();
    c.fill();
    for (let i = 1; i < 4; i++)
      line(
        c,
        x0,
        y0 + 2,
        x0 + (tipx - x0) * (i / 4),
        tipy + (y0 - tipy) * (i / 5),
        1.2,
        shade(b, 0.6),
      );
  };
  wing(52, 46, 92, 8, true);
  oval(c, 50, 52, 24, 12, vgrad(c, 40, 64, b));
  rr(c, 38, 46, 16, 12, 4, team);
  oval(c, 78, 40, 10, 9, rgrad(c, 78, 40, 10, b));
  c.fillStyle = a;
  c.beginPath();
  c.moveTo(86, 38);
  c.lineTo(98, 42);
  c.lineTo(86, 46);
  c.fill();
  eye(c, 81, 37, 2, '#2a1a10');
  c.fillStyle = vgrad(c, 50, 66, shade(b, 0.8));
  c.beginPath();
  c.moveTo(26, 50);
  c.lineTo(6, 44);
  c.lineTo(10, 56);
  c.closePath();
  c.fill();
  wing(48, 46, 10, 10, false);
  line(c, 44, 62, 42, 74, 3, a);
  line(c, 56, 62, 58, 74, 3, a);
}

function construct(c: Ctx, def: UnitDef, team: string): void {
  const b = def.art.body;
  const a = def.art.accent ?? '#ffe58a';
  rr(c, 30, 62, 15, 24, 3, vgrad(c, 62, 86, shade(b, 0.65)));
  rr(c, 55, 62, 15, 24, 3, vgrad(c, 62, 86, shade(b, 0.6)));
  rr(c, 10, 30, 14, 36, 5, vgrad(c, 30, 66, shade(b, 0.8)));
  rr(c, 22, 26, 56, 42, 7, dgrad(c, 22, 26, 78, 68, b));
  rr(c, 34, 6, 32, 22, 5, dgrad(c, 34, 6, 66, 28, shade(b, 1.1)));
  eye(c, 43, 16, 2.6, a);
  eye(c, 57, 16, 2.6, a);
  rr(c, 76, 30, 14, 36, 5, vgrad(c, 30, 66, shade(b, 0.85)));
  disc(c, 50, 46, 9, shade(team, 0.5));
  disc(c, 50, 46, 7, rgrad(c, 50, 46, 7, team));
  for (const [x, y] of [
    [27, 31],
    [73, 31],
    [27, 63],
    [73, 63],
  ] as const)
    disc(c, x, y, 2.4, rgrad(c, x, y, 2.4, a));
  line(c, 22, 40, 78, 40, 1.5, shade(b, 0.6));
}

/** Projectile sprites (drawn at ART_RES). */
export function drawProjectile(kind: 'arrow' | 'stone' | 'orb'): HTMLCanvasElement {
  const S = 24 * ART_RES;
  const [cv, c] = createCanvas(S, S);
  c.scale(ART_RES, ART_RES);
  if (kind === 'arrow') {
    line(c, 2, 12, 20, 12, 2, WOOD);
    c.fillStyle = STEEL;
    c.beginPath();
    c.moveTo(23, 12);
    c.lineTo(17, 9);
    c.lineTo(17, 15);
    c.fill();
    line(c, 2, 12, 6, 9, 2, '#f3ead8');
    line(c, 2, 12, 6, 15, 2, '#f3ead8');
  } else if (kind === 'stone') {
    disc(c, 12, 12, 6.5, rgrad(c, 12, 12, 6.5, '#8a8076'));
  } else {
    disc(c, 12, 12, 10, 'rgba(255,240,160,0.35)');
    disc(c, 12, 12, 6, rgrad(c, 12, 12, 6, '#fff3b0'));
  }
  return cv;
}
