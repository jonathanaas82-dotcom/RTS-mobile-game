import type Phaser from 'phaser';
import type { SimEvent, World } from '../../sim/world';
import type { MatchArt } from '../assets/matchArt';
import { TILE_PX } from '../assets/tileset';

interface Floater {
  text: Phaser.GameObjects.Text;
  until: number;
}

const MAX_FLOATERS = 24;

/** Projectiles, damage numbers, death fades and other short-lived visuals. */
export class EffectsRenderer {
  private readonly scene: Phaser.Scene;
  private readonly art: MatchArt;
  private readonly shots: Phaser.GameObjects.Image[] = [];
  private readonly floaters: Floater[] = [];
  private readonly fx: Phaser.GameObjects.Graphics;
  /** Graphics quality: disables purely decorative particles when false. */
  particles = true;

  constructor(scene: Phaser.Scene, art: MatchArt) {
    this.scene = scene;
    this.art = art;
    this.fx = scene.add.graphics().setDepth(4e5);
  }

  update(world: World, alpha: number, visible: (x: number, y: number) => boolean): void {
    // Projectiles: one pooled image each, oriented along their flight.
    let n = 0;
    for (const p of world.projectiles) {
      if (!visible(p.x, p.y)) continue;
      let img = this.shots[n];
      const frame =
        p.sourceCls === 'siege'
          ? 'p:stone'
          : p.sourceCls === 'mythic' || p.sourceCls === 'hero'
            ? 'p:orb'
            : 'p:arrow';
      const [key, f] = this.art.frame(frame);
      if (!img) {
        img = this.scene.add.image(0, 0, key, f).setDepth(3e5);
        this.shots.push(img);
      } else if (img.frame.name !== f) img.setTexture(key, f);
      const x = (p.px + (p.x - p.px) * alpha) * TILE_PX;
      const y = (p.py + (p.y - p.py) * alpha) * TILE_PX;
      img
        .setPosition(x, y)
        .setVisible(true)
        .setRotation(Math.atan2(p.ty - p.y, p.tx - p.x));
      n++;
    }
    for (let i = n; i < this.shots.length; i++) this.shots[i]!.setVisible(false);
    // Damage numbers float up and fade.
    const now = this.scene.time.now;
    for (const fl of this.floaters) {
      if (!fl.text.visible) continue;
      const left = fl.until - now;
      if (left <= 0) {
        fl.text.setVisible(false);
        continue;
      }
      fl.text.y -= 0.6;
      fl.text.setAlpha(Math.min(1, left / 300));
    }
  }

  onEvent(
    ev: SimEvent,
    me: number,
    visible: (x: number, y: number) => boolean,
    onScreen: (x: number, y: number) => boolean,
  ): void {
    if (ev.type === 'hit') {
      if (!visible(ev.x, ev.y) || !onScreen(ev.x, ev.y) || ev.amount < 1) return;
      const jitter = ((ev.target * 7919) % 17) - 8;
      this.floater(
        ev.x * TILE_PX + jitter,
        ev.y * TILE_PX - 40,
        String(Math.round(ev.amount)),
        ev.owner === me ? '#ffe58a' : '#ff8080',
      );
    } else if (ev.type === 'death') {
      if (!visible(ev.x, ev.y) || !onScreen(ev.x, ev.y)) return;
      this.puff(
        ev.x * TILE_PX,
        ev.y * TILE_PX,
        ev.kind === 'building' ? 2.2 : 0.8,
        ev.kind === 'resource' ? 0xd8c385 : 0x8a7a66,
      );
      if (ev.kind === 'unit' && this.art.has(`u:${ev.def}:${ev.owner}`)) {
        const [key, f] = this.art.frame(`u:${ev.def}:${ev.owner}`);
        const ghost = this.scene.add
          .image(ev.x * TILE_PX, ev.y * TILE_PX, key, f)
          .setOrigin(0.5, 0.85)
          .setDepth(ev.y * TILE_PX)
          .setTint(0x555555);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          angle: 80,
          y: ghost.y + 6,
          duration: 700,
          onComplete: () => ghost.destroy(),
        });
      }
    }
  }

  /** Expanding ring for impacts and deaths. */
  puff(x: number, y: number, scale: number, color: number): void {
    if (!this.particles) return;
    const ring = this.scene.add
      .image(x, y, 'ring')
      .setDepth(4e5)
      .setTint(color)
      .setScale(0.2 * scale)
      .setAlpha(0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: 0.8 * scale,
      alpha: 0,
      duration: 500,
      onComplete: () => ring.destroy(),
    });
  }

  /** Large coloured burst used by god powers and hero abilities. */
  burst(x: number, y: number, radiusTiles: number, color: number, duration = 700): void {
    const r = radiusTiles * TILE_PX;
    const g = this.scene.add.graphics().setDepth(4e5);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration,
      onUpdate: () => {
        g.clear();
        g.fillStyle(color, 0.35 * (1 - state.t));
        g.fillCircle(x, y, r * (0.4 + 0.6 * state.t));
        g.lineStyle(6, color, 1 - state.t);
        g.strokeCircle(x, y, r * (0.4 + 0.6 * state.t));
      },
      onComplete: () => g.destroy(),
    });
  }

  /** Jagged lightning bolt from the sky to a point. */
  bolt(x: number, y: number, color: number): void {
    const g = this.scene.add.graphics().setDepth(4.5e5);
    const pts: Array<[number, number]> = [];
    let cx = x + 60;
    for (let k = 0; k <= 8; k++) {
      const yy = y - 520 + k * 65;
      cx += ((k * 37) % 5) * 9 - 18;
      pts.push([k === 8 ? x : cx, yy]);
    }
    const draw = (a: number): void => {
      g.clear();
      g.lineStyle(10, color, 0.35 * a);
      g.strokePoints(pts.map(([px, py]) => ({ x: px, y: py })));
      g.lineStyle(4, 0xffffff, a);
      g.strokePoints(pts.map(([px, py]) => ({ x: px, y: py })));
    };
    draw(1);
    const st = { a: 1 };
    this.scene.tweens.add({
      targets: st,
      a: 0,
      duration: 450,
      onUpdate: () => draw(st.a),
      onComplete: () => g.destroy(),
    });
  }

  private floater(x: number, y: number, s: string, color: string): void {
    let fl = this.floaters.find((f) => !f.text.visible);
    if (!fl) {
      if (this.floaters.length >= MAX_FLOATERS) return;
      const text = this.scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#fff',
          stroke: '#000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(6e5);
      fl = { text, until: 0 };
      this.floaters.push(fl);
    }
    fl.text.setText(s).setColor(color).setPosition(x, y).setVisible(true).setAlpha(1);
    fl.until = this.scene.time.now + 700;
  }

  /** Persistent area effects (god powers) drawn each frame. */
  drawAreas(
    world: World,
    visible: (x: number, y: number) => boolean,
    colorOf: (power: string) => number,
  ): void {
    const g = this.fx;
    g.clear();
    const t = this.scene.time.now;
    for (const e of world.effects) {
      if (e.until <= world.tick || e.kind === 'reveal' || !visible(e.x, e.y)) continue;
      const c = colorOf(e.power);
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.008);
      g.fillStyle(c, 0.18 + 0.1 * pulse);
      g.fillCircle(e.x * TILE_PX, e.y * TILE_PX, e.radius * TILE_PX);
      g.lineStyle(4, c, 0.6 + 0.3 * pulse);
      g.strokeCircle(e.x * TILE_PX, e.y * TILE_PX, e.radius * TILE_PX);
    }
  }
}
