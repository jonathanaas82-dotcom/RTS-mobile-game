import type Phaser from 'phaser';
import type { Entity } from '../../sim/entity';
import type { World } from '../../sim/world';
import { BUILDING_OVERHANG } from '../assets/procedural/buildings';
import type { MatchArt } from '../assets/matchArt';
import { TILE_PX } from '../assets/tileset';

const CARRY_COLORS: Record<string, number> = {
  food: 0xe04858,
  wood: 0x8a5a33,
  gold: 0xe8b830,
  favor: 0xb48cf2,
};

interface View {
  sprite: Phaser.GameObjects.Image;
  /** Foundation scaffold under buildings being constructed. */
  base: Phaser.GameObjects.Image | null;
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
  private frameNo = 0;

  constructor(scene: Phaser.Scene, art: MatchArt) {
    this.scene = scene;
    this.art = art;
    this.rings = scene.add.graphics().setDepth(-0.5);
    this.bars = scene.add.graphics().setDepth(1e6);
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
    const margin = TILE_PX * 3;
    const tick = world.tick;
    for (const e of world.entities) {
      if (e.dead) continue;
      const [x, y] = EntityRenderer.pos(e, alpha);
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
      const v = this.view(e);
      v.seen = fn;
      const s = v.sprite;
      if (e.kind === 'unit') {
        const moving = e.x !== e.px || e.y !== e.py;
        const bob = moving ? -Math.abs(Math.sin(time * 0.018 + e.id)) * 4 : 0;
        const sinceAttack = tick - e.lastAttack;
        const lunge = sinceAttack >= 0 && sinceAttack < 3 ? e.facing * (3 - sinceAttack) * 3 : 0;
        s.setPosition(x + lunge, y + bob);
        s.setFlipX(e.facing < 0);
        s.setDepth(y);
        if (e.stunUntil > tick) s.setTint(0xb8e0ff);
        else if (tick - e.lastHit < 3) s.setTint(0xff9090);
        else s.clearTint();
        if (selected.has(e.id)) {
          rings.lineStyle(3, e.owner === 0 ? 0x7cf29c : 0xff6b6b, 0.95);
          rings.strokeEllipse(x, y + 2, e.radius * TILE_PX * 2.4, e.radius * TILE_PX * 1.1);
        }
        if (selected.has(e.id) || e.hp < e.maxHp)
          this.bar(bars, x, y - s.displayHeight * 0.85, e, 34);
        if (e.carry > 0 && e.carryKind) {
          // Little bundle showing what a worker carries.
          const cy = y - s.displayHeight * 0.45;
          bars.fillStyle(CARRY_COLORS[e.carryKind] ?? 0xffffff, 1);
          bars.fillCircle(x - e.facing * 9, cy, 5);
          bars.lineStyle(1.5, 0x2b2116, 1);
          bars.strokeCircle(x - e.facing * 9, cy, 5);
        }
      } else {
        s.setPosition(
          x - (e.size * TILE_PX) / 2,
          y - (e.size * TILE_PX) / 2 - BUILDING_OVERHANG * TILE_PX,
        );
        s.setDepth(y + (e.size * TILE_PX) / 2 - 10);
        if (e.kind === 'building') {
          if (!e.built) {
            // Rising construction: reveal the sprite from the bottom up.
            const h = s.height;
            const shown = Math.max(0.08, e.progress) * h;
            s.setCrop(0, h - shown, s.width, shown);
            s.setAlpha(0.9);
            if (!v.base) {
              const [key, frame] = this.art.frame(`found:${Math.min(3, e.size)}`);
              v.base = this.scene.add.image(0, 0, key, frame).setOrigin(0, 0);
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
    const h = 6;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
    const color =
      e.kind === 'building' && !e.built
        ? 0xf0cf72
        : frac > 0.6
          ? 0x5fd36a
          : frac > 0.3
            ? 0xf2c14e
            : 0xe5484d;
    g.fillStyle(color, 1);
    g.fillRect(cx - w / 2, y, w * frac, h);
  }

  private frameFor(e: Entity): string {
    if (e.kind === 'unit') return `u:${e.def}:${e.owner}`;
    if (e.kind === 'building') return `b:${e.def}:${e.owner}`;
    return e.def;
  }

  private view(e: Entity): View {
    const name = this.frameFor(e);
    let v = this.views.get(e.id);
    if (v && v.frameName === name) return v;
    if (v) this.release(e.id, v);
    let sprite = this.pool.pop();
    if (e.kind === 'resource') {
      const key = e.def === 'gold' ? 'gold_mine' : 'berry_bush';
      sprite = sprite ? sprite.setTexture(key) : this.scene.add.image(0, 0, key);
      // Resources reuse the building positioning maths: no overhang in their texture.
      sprite.setOrigin(0, -BUILDING_OVERHANG / e.size);
    } else {
      const [key, frame] = this.art.frame(name);
      sprite = sprite ? sprite.setTexture(key, frame) : this.scene.add.image(0, 0, key, frame);
      if (e.kind === 'unit') sprite.setOrigin(0.5, 0.85);
      else sprite.setOrigin(0, 0);
    }
    sprite.setVisible(true).setAlpha(1).clearTint().setCrop();
    v = { sprite, base: null, frameName: name, seen: 0 };
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
    this.views.delete(id);
  }

  /** Screen-space sprite of an entity if currently drawn (for effects). */
  spriteOf(id: number): Phaser.GameObjects.Image | undefined {
    return this.views.get(id)?.sprite;
  }
}
