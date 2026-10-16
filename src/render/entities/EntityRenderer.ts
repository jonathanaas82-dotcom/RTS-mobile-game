import type Phaser from 'phaser';
import type { Entity } from '../../sim/entity';
import type { World } from '../../sim/world';
import { BUILDING_OVERHANG } from '../assets/procedural/buildings';
import type { MatchArt } from '../assets/matchArt';
import { TILE_PX } from '../assets/tileset';
import { ART_RES } from '../assets/procedural/draw';
import { PALETTE } from '../assets/palette';
import { UNIT_FEET, rodTip, type WorkAct } from '../assets/procedural/units';

const TEAM = PALETTE.players.map((c) => parseInt(c.slice(1), 16));
/** Buildings that send up hearth smoke. */
const SMOKY = new Set(['house', 'town_hall', 'workshop']);

const CARRY_COLORS: Record<string, number> = {
  food: 0xe04858,
  wood: 0x8a5a33,
  gold: 0xe8b830,
  favor: 0xb48cf2,
};

interface View {
  sprite: Phaser.GameObjects.Image;
  /** Last work key frame shown (to fire impact effects on the strike frame). */
  workFrame: number;
  /** Foundation scaffold under buildings being constructed. */
  base: Phaser.GameObjects.Image | null;
  /** Cast shadow on the ground (buildings). */
  shadow: Phaser.GameObjects.Image | null;
  frameName: string;
  seen: number;
}

/**
 * Draws all units, buildings and resources from sim state each frame, with interpolation,
 * simple procedural animation (walk bob, attack lunge, hit flash) and pooled sprites.
 */
export class EntityRenderer {
  private readonly scene: Phaser.Scene;
  private readonly art: MatchArt;
  private readonly views = new Map<number, View>();
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  /** Fishing lines (rod tip to bobber). */
  private readonly lines: Phaser.GameObjects.Graphics;
  private frameNo = 0;
  /** Called when a worker's tool lands (wood chips, sparks, splashes...). */
  onWorkImpact: ((act: WorkAct, x: number, y: number, facing: number) => void) | null = null;
  /** Called when a fish leaps at a fishing spot (for the splash). */
  onSplash: ((x: number, y: number) => void) | null = null;
  /** Called now and then for inhabited buildings (chimney / smoke-hole puffs). */
  onSmoke: ((x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene, art: MatchArt) {
    this.scene = scene;
    this.art = art;
    this.rings = scene.add.graphics().setDepth(-0.5);
    this.bars = scene.add.graphics().setDepth(1e6);
    this.lines = scene.add.graphics().setDepth(9e4);
  }

  private toForestEdge(world: World, e: Entity, x: number, y: number): [number, number] {
    const w = world.map.width;
    const tx = (e.order.tile % w) * TILE_PX;
    const ty = Math.floor(e.order.tile / w) * TILE_PX;
    // Nearest point of the tile (trunks stand in its lower part, so aim a little low).
    const cx = Math.min(Math.max(x, tx + TILE_PX * 0.15), tx + TILE_PX * 0.85);
    const cy = Math.min(Math.max(y, ty + TILE_PX * 0.45), ty + TILE_PX * 0.95);
    const dx = cx - x;
    const dy = cy - y;
    const d = Math.hypot(dx, dy);
    const keep = TILE_PX * 0.3;
    if (d <= keep) return [x, y];
    const k = Math.min(d - keep, TILE_PX * 0.7) / d;
    return [x + dx * k, y + dy * k];
  }

  /** World-pixel position of an entity at interpolation `alpha`. */
  static pos(e: Entity, alpha: number): [number, number] {
    return [(e.px + (e.x - e.px) * alpha) * TILE_PX, (e.py + (e.y - e.py) * alpha) * TILE_PX];
  }

  update(
    world: World,
    alpha: number,
    time: number,
    selected: ReadonlySet<number>,
    visible: (e: Entity) => boolean,
    viewRect: Phaser.Geom.Rectangle,
  ): void {
    this.frameNo++;
    const fn = this.frameNo;
    const rings = this.rings;
    const bars = this.bars;
    rings.clear();
    bars.clear();
    this.lines.clear();
    const margin = TILE_PX * 3;
    const tick = world.tick;
    for (const e of world.entities) {
      if (e.dead || e.inside >= 0) continue;
      let [x, y] = EntityRenderer.pos(e, alpha);
      // Cull off-screen entities entirely (cheap; keeps the scene graph small).
      if (
        x < viewRect.x - margin ||
        x > viewRect.right + margin ||
        y < viewRect.y - margin ||
        y > viewRect.bottom + margin
      ) {
        this.hide(e.id);
        continue;
      }
      if (!visible(e)) {
        this.hide(e.id);
        continue;
      }
      const moving = e.x !== e.px || e.y !== e.py;
      const step = Math.sin(time * 0.018 + e.id);
      const anim = e.kind === 'unit' ? this.unitPose(world, e, moving, step, time) : null;
      const v = this.view(e, anim?.name);
      v.seen = fn;
      const s = v.sprite;
      if (e.kind === 'unit') {
        // Woodcutters work from up to a tile away (sim reach): draw them stepped up to the
        // forest edge so the axe meets the trees.
        if (anim?.act === 'chop') [x, y] = this.toForestEdge(world, e, x, y);
        const working = anim?.act != null;
        if (working && anim.frame !== v.workFrame) {
          if (anim.frame === 1) this.onWorkImpact?.(anim.act!, x, y, e.facing);
          v.workFrame = anim.frame;
        } else if (!working) v.workFrame = -1;
        const bob = moving ? -Math.abs(step) * 4 : 0;
        const sinceAttack = tick - e.lastAttack;
        const lunge =
          !working && sinceAttack >= 0 && sinceAttack < 3 ? e.facing * (3 - sinceAttack) * 3 : 0;
        s.setPosition(x + lunge, y + bob);
        s.setFlipX(e.facing < 0);
        // Long cast shadow (never mirrored: the sun stays in the north-west).
        const usk = `us:${e.def}`;
        if (!v.shadow && this.art.has(usk)) {
          const [key, frame] = this.art.frame(usk);
          const img = this.scene.add
            .image(0, 0, key, frame)
            .setScale(1 / ART_RES)
            .setDepth(-0.85);
          img.setOrigin((s.width * 0.5) / img.width, (s.height * UNIT_FEET) / img.height);
          v.shadow = img;
        }
        v.shadow?.setPosition(x + lunge, y).setVisible(true);
        if (anim?.act === 'fish') this.fishingLine(world, e, s, anim.frame as 0 | 1, time);
        // Walking sway and a forward lean while striking.
        s.setAngle((moving ? step * 3 : 0) + (lunge !== 0 ? e.facing * 6 : 0));
        s.setDepth(y);
        // Team-coloured footprint ring for readability in crowds.
        rings.fillStyle(TEAM[e.owner] ?? 0xffffff, 0.28);
        rings.fillEllipse(x, y + 1, e.radius * TILE_PX * 2.1, e.radius * TILE_PX * 0.9);
        if (e.stunUntil > tick) s.setTint(0xb8e0ff);
        else if (tick - e.lastHit < 3) s.setTint(0xff9090);
        else s.clearTint();
        if (selected.has(e.id)) {
          const rw = e.radius * TILE_PX * 2.6;
          const rh = e.radius * TILE_PX * 1.2;
          const col = e.owner === 0 ? 0x7cf29c : 0xff6b6b;
          rings.lineStyle(6, col, 0.25);
          rings.strokeEllipse(x, y + 2, rw + 4, rh + 3);
          rings.lineStyle(2.5, col, 1);
          rings.strokeEllipse(x, y + 2, rw, rh);
        }
        if (selected.has(e.id) || e.hp < e.maxHp)
          this.bar(bars, x, y - s.displayHeight * 0.85, e, 34);
        if (e.carry > 0 && e.carryKind && !anim) {
          // Little bundle showing what a worker carries.
          const cy = y - s.displayHeight * 0.45;
          bars.fillStyle(CARRY_COLORS[e.carryKind] ?? 0xffffff, 1);
          bars.fillCircle(x - e.facing * 9, cy, 5);
          bars.lineStyle(1.5, 0x2b2116, 1);
          bars.strokeCircle(x - e.facing * 9, cy, 5);
        }
      } else if (e.kind === 'resource' && e.def === 'fish') {
        // Flat on the water: gently breathing ripples and the odd leaping fish.
        s.setPosition(x, y);
        s.setDepth(-1.2);
        s.setScale((1 + 0.05 * Math.sin(time * 0.003 + e.id)) / ART_RES);
        if (Math.random() < 0.006) this.leap(x, y);
      } else if (e.kind === 'resource') {
        s.setPosition(x, y);
        s.setDepth(y + (e.size * TILE_PX) / 4);
        if (selected.has(e.id)) {
          rings.lineStyle(2.5, 0xf3e6c4, 0.9);
          rings.strokeEllipse(
            x,
            y + (e.size * TILE_PX) / 4,
            e.size * TILE_PX * 0.95,
            e.size * TILE_PX * 0.5,
          );
        }
      } else {
        s.setPosition(
          x - (e.size * TILE_PX) / 2,
          y - (e.size * TILE_PX) / 2 - BUILDING_OVERHANG * TILE_PX,
        );
        if (e.kind === 'building') {
          const sk = `bs:${e.def}:${e.owner}`;
          if (!v.shadow && this.art.has(sk)) {
            const [key, frame] = this.art.frame(sk);
            v.shadow = this.scene.add
              .image(0, 0, key, frame)
              .setOrigin(0, 0)
              .setScale(1 / ART_RES);
          }
          v.shadow
            ?.setPosition(s.x, s.y)
            .setDepth(-0.9)
            .setAlpha(e.built ? 1 : 0.25 + 0.75 * e.progress)
            .setVisible(true);
        }
        // Fields are flat: keep them on the ground (under footprint rings and units).
        s.setDepth(e.def === 'farm' ? -0.6 : y + (e.size * TILE_PX) / 2 - 10);
        if (e.kind === 'building') {
          if (e.built && SMOKY.has(e.def) && Math.random() < 0.012)
            this.onSmoke?.(
              x + (e.size * TILE_PX) / 8,
              y - (e.size * TILE_PX) / 2 - BUILDING_OVERHANG * TILE_PX * 0.55,
            );
          if (!e.built) {
            // Rising construction: reveal the sprite from the bottom up.
            const h = s.height;
            const shown = Math.max(0.08, e.progress) * h;
            s.setCrop(0, h - shown, s.width, shown);
            s.setAlpha(0.9);
            if (!v.base) {
              const [key, frame] = this.art.frame(`found:${Math.min(3, e.size)}`);
              v.base = this.scene.add
                .image(0, 0, key, frame)
                .setOrigin(0, 0)
                .setScale(1 / ART_RES);
            }
            v.base
              .setPosition(x - (e.size * TILE_PX) / 2, y - (e.size * TILE_PX) / 2)
              .setDepth(-0.4)
              .setVisible(true);
          } else {
            if (s.isCropped) s.setCrop();
            s.setAlpha(1);
            if (v.base) {
              v.base.destroy();
              v.base = null;
            }
          }
          if (tick - e.lastHit < 3) s.setTint(0xffb0b0);
          else s.clearTint();
          if (selected.has(e.id)) {
            rings.lineStyle(3, e.owner === 0 ? 0x7cf29c : 0xff6b6b, 0.95);
            const half = (e.size * TILE_PX) / 2;
            rings.strokeRect(x - half + 2, y - half + 2, half * 2 - 4, half * 2 - 4);
          }
          if (selected.has(e.id) || e.hp < e.maxHp || !e.built) {
            this.bar(bars, x, y - (e.size * TILE_PX) / 2 - 6, e, Math.min(90, e.size * 26));
          }
        } else if (selected.has(e.id)) {
          rings.lineStyle(3, 0xf3e6c4, 0.9);
          const half = (e.size * TILE_PX) / 2;
          rings.strokeRect(x - half + 2, y - half + 2, half * 2 - 4, half * 2 - 4);
        }
      }
    }
    // Release views that weren't drawn this frame (dead or culled).
    for (const [id, v] of this.views) {
      if (v.seen !== fn) this.release(id, v);
    }
  }

  private bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, e: Entity, w: number): void {
    const frac = e.kind === 'building' && !e.built ? e.progress : Math.max(0, e.hp / e.maxHp);
    const h = 7;
    const x0 = cx - w / 2;
    g.fillStyle(0x140e08, 0.75);
    g.fillRoundedRect(x0 - 2, y - 2, w + 4, h + 4, 4);
    const color =
      e.kind === 'building' && !e.built
        ? 0xf0cf72
        : frac > 0.6
          ? 0x5fd36a
          : frac > 0.3
            ? 0xf2c14e
            : 0xe5484d;
    if (frac > 0.02) {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x0, y, Math.max(4, w * frac), h, 3);
      // Glossy highlight.
      g.fillStyle(0xffffff, 0.3);
      g.fillRoundedRect(x0 + 1, y + 1, Math.max(2, w * frac - 2), 2, 1);
    }
    // Team marker at the left end.
    g.fillStyle(TEAM[e.owner] ?? 0xffffff, 1);
    g.fillCircle(x0 - 3, y + h / 2, 3.5);
  }

  /**
   * Pick the animation frame for a unit: work key frames for gathering/building workers, carry
   * poses on the way home, and alternating stride frames while walking.
   */
  private unitPose(
    world: World,
    e: Entity,
    moving: boolean,
    step: number,
    time: number,
  ): { name: string; act: WorkAct | null; frame: number } | null {
    const base = `u:${e.def}:${e.owner}`;
    if (!this.art.has(`${base}:walk`)) return null;
    const pick = (suffix: string, act: WorkAct | null = null, frame = -1) => {
      const name = `${base}:${suffix}`;
      return this.art.has(name) ? { name, act, frame } : null;
    };
    const busy = world.tick - e.lastAttack < 16;
    if (!moving && busy && (e.order.type === 'gather' || e.order.type === 'build')) {
      let act: WorkAct = 'build';
      if (e.order.type === 'gather') {
        const t = world.byId.get(e.order.target);
        if (e.order.tile >= 0) act = 'chop';
        else if (t?.def === 'gold') act = 'mine';
        else if (t?.def === 'fish') act = 'fish';
        else if (t?.def === 'farm') act = 'farm';
        else act = 'pick';
      }
      // Wind-up most of the cycle, then a quick strike (fishing: slow bob of the rod).
      const period = act === 'fish' ? 1700 : act === 'pick' ? 900 : 760;
      const phase = ((time + e.id * 137) % period) / period;
      const frame = phase < (act === 'fish' ? 0.5 : 0.62) ? 0 : 1;
      return pick(`${act}${frame}`, act, frame);
    }
    if (e.carry > 0 && e.carryKind) {
      let art = e.carryKind === 'wood' ? 'wood' : e.carryKind === 'gold' ? 'gold' : 'berries';
      if (e.carryKind === 'food') {
        const t = world.byId.get(e.order.target);
        if (t?.def === 'fish') art = 'fish';
        else if (t?.def === 'farm') art = 'grain';
      }
      const r = pick(`carry_${art}${moving && step > 0 ? '_w' : ''}`);
      if (r) return r;
    }
    if (moving && step > 0) return pick('walk');
    return null;
  }

  /**
   * Line from the rod tip (in the sprite's design box) to a bobber on the fishing spot, sagging
   * a little; the bobber dips on the strike frame and leaves a ripple.
   */
  private fishingLine(
    world: World,
    e: Entity,
    s: Phaser.GameObjects.Image,
    frame: 0 | 1,
    time: number,
  ): void {
    const spot = world.byId.get(e.order.target);
    if (!spot) return;
    const [dx, dy] = rodTip(frame);
    const flip = e.facing < 0 ? -1 : 1;
    const tx = s.x + (dx / 100 - 0.5) * s.displayWidth * flip;
    const ty = s.y + (dy / 100 - 0.86) * s.displayHeight;
    // Each fisher gets their own spot on the shoal, a little towards themselves.
    const cx = spot.x * TILE_PX;
    const cy = spot.y * TILE_PX;
    const ang = Math.atan2(s.y - cy, s.x - cx) + ((e.id % 5) - 2) * 0.35;
    const bx = cx + Math.cos(ang) * TILE_PX * 0.22;
    const by = cy + Math.sin(ang) * TILE_PX * 0.16 + (frame === 1 ? 2 : Math.sin(time * 0.005) * 1);
    const g = this.lines;
    const mx = (tx + bx) / 2;
    const my = Math.max(ty, by) + 10;
    g.lineStyle(1.2, 0xf4f1e6, 0.85);
    g.beginPath();
    g.moveTo(tx, ty);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * mx + t * t * bx;
      const y = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * my + t * t * by;
      g.lineTo(x, y);
    }
    g.strokePath();
    // Ripple ring and the red-and-white float.
    const k = (((time * 0.0012 + e.id * 0.37) % 1) + 1) % 1;
    g.lineStyle(1, 0xffffff, 0.55 * (1 - k));
    g.strokeEllipse(bx, by + 1, 6 + k * 12, 2.5 + k * 5);
    g.fillStyle(0xe8442e, 1);
    g.fillCircle(bx, by - 1, 2.6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(bx, by - 2.6, 1.3);
  }

  /** A fish arcs out of the water and splashes back in. */
  private leap(x: number, y: number): void {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const img = this.scene.add
      .image(x - dir * 10, y, 'fish_jump')
      .setScale(0.5)
      .setFlipX(dir < 0)
      .setDepth(y + 2)
      .setAngle(-dir * 40);
    const st = { t: 0 };
    this.scene.tweens.add({
      targets: st,
      t: 1,
      duration: 650,
      onUpdate: () => {
        img.setPosition(x - dir * 10 + dir * 20 * st.t, y - Math.sin(st.t * Math.PI) * 22);
        img.setAngle(dir * (-40 + 80 * st.t));
      },
      onComplete: () => {
        img.destroy();
        this.onSplash?.(x + dir * 10, y);
      },
    });
  }

  private frameFor(e: Entity): string {
    if (e.kind === 'unit') return `u:${e.def}:${e.owner}`;
    if (e.kind === 'building') return `b:${e.def}:${e.owner}`;
    return e.def;
  }

  private view(e: Entity, pose?: string): View {
    const name = pose ?? this.frameFor(e);
    let v = this.views.get(e.id);
    if (v && v.frameName === name) return v;
    const prevWork = v?.workFrame ?? -1;
    if (v) {
      // Same entity, new animation frame: just swap the texture frame on the sprite.
      if (e.kind === 'unit' && !v.base && !v.shadow) {
        const [key, frame] = this.art.frame(name);
        v.sprite.setTexture(key, frame);
        v.frameName = name;
        return v;
      }
      this.release(e.id, v);
    }
    let sprite = this.pool.pop();
    if (e.kind === 'resource') {
      const key = e.def === 'gold' ? 'gold_mine' : e.def === 'fish' ? 'fish_spot' : 'berry_bush';
      sprite = sprite ? sprite.setTexture(key) : this.scene.add.image(0, 0, key);
      // The mine's rocks sit low in their canvas: lift them onto the footprint.
      sprite.setOrigin(0.5, e.def === 'gold' ? 0.6 : 0.5);
    } else {
      const [key, frame] = this.art.frame(name);
      sprite = sprite ? sprite.setTexture(key, frame) : this.scene.add.image(0, 0, key, frame);
      if (e.kind === 'unit') sprite.setOrigin(0.5, 0.86);
      else sprite.setOrigin(0, 0);
    }
    sprite
      .setVisible(true)
      .setAlpha(1)
      .clearTint()
      .setCrop()
      .setAngle(0)
      .setScale(1 / ART_RES);
    v = { sprite, base: null, shadow: null, frameName: name, seen: 0, workFrame: prevWork };
    this.views.set(e.id, v);
    return v;
  }

  private hide(id: number): void {
    const v = this.views.get(id);
    if (v) this.release(id, v);
  }

  private release(id: number, v: View): void {
    v.sprite.setVisible(false);
    this.pool.push(v.sprite);
    v.base?.destroy();
    v.shadow?.destroy();
    this.views.delete(id);
  }

  /** Screen-space sprite of an entity if currently drawn (for effects). */
  spriteOf(id: number): Phaser.GameObjects.Image | undefined {
    return this.views.get(id)?.sprite;
  }
}
