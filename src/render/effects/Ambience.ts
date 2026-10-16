import type Phaser from 'phaser';
import { Terrain } from '../../sim/map/terrain';
import type { World } from '../../sim/world';
import { TILE_PX } from '../assets/tileset';

interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number;
}

interface Bird {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  phase: number;
}

interface Mote {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  phase: number;
}

interface Leaf {
  img: Phaser.GameObjects.Image;
  x: number;
  y0: number;
  fall: number;
  t: number;
  life: number;
  spin: number;
  phase: number;
}

interface Butterfly {
  img: Phaser.GameObjects.Image;
  hx: number;
  hy: number;
  phase: number;
  speed: number;
}

/** Tiny procedural textures for birds (two wing frames) and a butterfly. */
function makeCritterTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('bird0')) return;
  for (const [key, up] of [
    ['bird0', true],
    ['bird1', false],
  ] as const) {
    const cv = document.createElement('canvas');
    cv.width = 28;
    cv.height = 16;
    const c = cv.getContext('2d')!;
    c.strokeStyle = '#2a2622';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(2, up ? 4 : 11);
    c.quadraticCurveTo(8, up ? 2 : 13, 14, 8);
    c.quadraticCurveTo(20, up ? 2 : 13, 26, up ? 4 : 11);
    c.stroke();
    c.fillStyle = '#2a2622';
    c.beginPath();
    c.ellipse(14, 8.5, 2.6, 1.8, 0, 0, Math.PI * 2);
    c.fill();
    scene.textures.addCanvas(key, cv);
  }
  const cv = document.createElement('canvas');
  cv.width = 14;
  cv.height = 12;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#ffffff';
  for (const dx of [-1, 1]) {
    c.beginPath();
    c.ellipse(7 + dx * 3.2, 4.5, 3, 3.6, dx * 0.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(7 + dx * 2.4, 8.5, 2, 2.4, dx * 0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#2a2018';
  c.fillRect(6.4, 2.5, 1.2, 8);
  scene.textures.addCanvas('butterfly', cv);
  // A falling leaf (tinted per leaf) and a soft cloud shadow made of overlapping puffs.
  {
    const [lv, lc] = canvas(14, 9);
    lc.fillStyle = '#ffffff';
    lc.beginPath();
    lc.moveTo(1, 4.5);
    lc.quadraticCurveTo(7, -1.5, 13, 4.5);
    lc.quadraticCurveTo(7, 10.5, 1, 4.5);
    lc.fill();
    lc.strokeStyle = 'rgba(0,0,0,0.35)';
    lc.lineWidth = 0.8;
    lc.beginPath();
    lc.moveTo(1.5, 4.5);
    lc.lineTo(12, 4.5);
    lc.stroke();
    scene.textures.addCanvas('leaf', lv);
  }
  {
    const W = 320;
    const H = 200;
    const [cl, cc] = canvas(W, H);
    let s = 11;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let k = 0; k < 14; k++) {
      const x = W * (0.2 + rnd() * 0.6);
      const y = H * (0.3 + rnd() * 0.4);
      const r = 40 + rnd() * 45;
      const g = cc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.32)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cc.fillStyle = g;
      cc.fillRect(0, 0, W, H);
    }
    scene.textures.addCanvas('cloudShadow', cl);
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')!];
}

const LEAF_TINTS = [0x6f9a3a, 0x9ab846, 0xd8a03a, 0xc8642a, 0x7fae48];

const BUTTERFLY_TINTS = [0xffd84a, 0xffffff, 0xff9ab8, 0x8ec8ff, 0xffa64d];

/**
 * Purely decorative life: slow cloud shadows drifting over the map and glints twinkling on
 * water near the camera. Uses render-only randomness (never touches the simulation).
 */
export class Ambience {
  private readonly scene: Phaser.Scene;
  private readonly clouds: Cloud[] = [];
  private readonly glints: Phaser.GameObjects.Image[] = [];
  private readonly water: number[] = [];
  private readonly mapW: number;
  private readonly mapH: number;
  private nextGlint = 0;
  private readonly birds: Bird[] = [];
  private nextFlock = 4000;
  private readonly butterflies: Butterfly[] = [];
  private readonly land: number[] = [];
  private readonly motes: Mote[] = [];
  private readonly leaves: Leaf[] = [];
  private readonly forest: number[] = [];
  private nextLeaf = 0;
  enabled = true;

  constructor(scene: Phaser.Scene, world: World, quality: 'low' | 'medium' | 'high') {
    this.scene = scene;
    this.mapW = world.map.width * TILE_PX;
    this.mapH = world.map.height * TILE_PX;
    for (let i = 0; i < world.map.tiles.length; i++)
      if (world.map.tiles[i] === Terrain.Water) this.water.push(i);
    this.enabled = quality !== 'low';
    makeCritterTextures(scene);
    const n = quality === 'high' ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const img = scene.add
        .image(Math.random() * this.mapW, Math.random() * this.mapH, 'cloudShadow')
        .setTint(0x0a1830)
        .setAlpha(0.5)
        .setScale((4 + Math.random() * 3) * (TILE_PX / 128))
        .setAngle(Math.random() * 40 - 20)
        .setDepth(4.9e5);
      img.setVisible(this.enabled);
      this.clouds.push({ img, speed: 0.012 + Math.random() * 0.01 });
    }
    for (let i = 0; i < world.map.tiles.length; i++) {
      if (world.map.tiles[i] === Terrain.Grass) this.land.push(i);
      else if (world.map.tiles[i] === Terrain.Forest) this.forest.push(i);
    }
    // Sunlit pollen and dust motes drifting near the camera.
    const motes = quality === 'high' ? 26 : 12;
    for (let i = 0; i < motes; i++) {
      const img = scene.add
        .image(0, 0, 'spark')
        .setTint(i % 3 ? 0xfff0b8 : 0xffffff)
        .setBlendMode('ADD')
        .setDepth(4.45e5)
        .setScale(0.1 + Math.random() * 0.1)
        .setVisible(false);
      this.motes.push({
        img,
        vx: 0.004 + Math.random() * 0.01,
        vy: -0.002 - Math.random() * 0.006,
        phase: Math.random() * 6.28,
      });
    }
    if (quality === 'high')
      for (let i = 0; i < 7; i++) {
        const img = scene.add
          .image(0, 0, 'butterfly')
          .setTint(BUTTERFLY_TINTS[i % BUTTERFLY_TINTS.length]!)
          .setDepth(4.4e5)
          .setScale(0.9)
          .setVisible(false);
        this.butterflies.push({
          img,
          hx: 0,
          hy: 0,
          phase: Math.random() * 6,
          speed: 0.6 + Math.random() * 0.6,
        });
      }
    for (let i = 0; i < 18; i++) {
      this.glints.push(
        scene.add.image(0, 0, 'glint').setDepth(-1.5).setVisible(false).setBlendMode('ADD'),
      );
    }
  }

  update(dt: number, view: Phaser.Geom.Rectangle, map: World['map']): void {
    if (!this.enabled) return;
    for (const c of this.clouds) {
      c.img.x += c.speed * dt * TILE_PX * 0.05;
      c.img.y += c.speed * dt * TILE_PX * 0.02;
      if (c.img.x - c.img.displayWidth / 2 > this.mapW) c.img.x = -c.img.displayWidth / 2;
      if (c.img.y - c.img.displayHeight / 2 > this.mapH) c.img.y = -c.img.displayHeight / 2;
    }
    const now = this.scene.time.now;
    this.updateMotes(dt, view, now);
    this.updateLeaves(dt, view, now, map);
    this.updateBirds(dt, view, now);
    this.updateButterflies(view, now, map);
    if (now < this.nextGlint || this.water.length === 0) return;
    this.nextGlint = now + 120;
    const free = this.glints.find((g) => !g.visible);
    if (!free) return;
    // Pick a random water tile inside the view (a few tries).
    for (let k = 0; k < 6; k++) {
      const i = this.water[Math.floor(Math.random() * this.water.length)]!;
      const x = ((i % map.width) + Math.random()) * TILE_PX;
      const y = (Math.floor(i / map.width) + Math.random()) * TILE_PX;
      if (!view.contains(x, y)) continue;
      free.setPosition(x, y).setVisible(true).setScale(0).setAlpha(0.9);
      this.scene.tweens.add({
        targets: free,
        scale: 0.5 + Math.random() * 0.4,
        duration: 450,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => free.setVisible(false),
      });
      return;
    }
  }

  /** Motes drift slowly with the breeze, twinkling; any that leave the view respawn inside it. */
  private updateMotes(dt: number, view: Phaser.Geom.Rectangle, now: number): void {
    const k = TILE_PX / 64;
    for (const m of this.motes) {
      const img = m.img;
      if (!img.visible || !view.contains(img.x, img.y)) {
        img.setPosition(view.x + Math.random() * view.width, view.y + Math.random() * view.height);
        img.setVisible(true);
      }
      img.x += (m.vx + Math.sin(now * 0.0007 + m.phase) * 0.006) * dt * k;
      img.y += (m.vy + Math.cos(now * 0.0009 + m.phase) * 0.004) * dt * k;
      img.setAlpha(0.2 + 0.5 * Math.max(0, Math.sin(now * 0.0015 + m.phase)));
    }
  }

  /** Now and then a leaf drifts down from a forest tree in view, tumbling and fading out. */
  private updateLeaves(
    dt: number,
    view: Phaser.Geom.Rectangle,
    now: number,
    map: World['map'],
  ): void {
    if (now > this.nextLeaf && this.forest.length && this.leaves.length < 10) {
      this.nextLeaf = now + 260;
      for (let k = 0; k < 5; k++) {
        const i = this.forest[Math.floor(Math.random() * this.forest.length)]!;
        if (map.tiles[i] !== Terrain.Forest) continue;
        const x = ((i % map.width) + Math.random()) * TILE_PX;
        const y = (Math.floor(i / map.width) + Math.random() * 0.6) * TILE_PX;
        if (!view.contains(x, y)) continue;
        const img = this.scene.add
          .image(x, y, 'leaf')
          .setTint(LEAF_TINTS[Math.floor(Math.random() * LEAF_TINTS.length)]!)
          .setDepth(y + TILE_PX)
          .setScale(0.9);
        this.leaves.push({
          img,
          x,
          y0: y - TILE_PX * 0.9,
          fall: TILE_PX * (1.1 + Math.random() * 0.6),
          t: 0,
          life: 3200 + Math.random() * 1800,
          spin: (Math.random() - 0.5) * 0.01,
          phase: Math.random() * 6.28,
        });
        break;
      }
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i]!;
      l.t += dt;
      const f = l.t / l.life;
      if (f >= 1) {
        l.img.destroy();
        this.leaves.splice(i, 1);
        continue;
      }
      const sway = Math.sin(l.t * 0.003 + l.phase);
      l.img.setPosition(l.x + sway * 12 + f * 30, l.y0 + f * l.fall);
      l.img.setRotation(sway * 0.9 + l.t * l.spin);
      l.img.setScale(0.9 * (0.4 + 0.6 * Math.abs(Math.cos(l.t * 0.004 + l.phase))), 0.9);
      l.img.setAlpha(Math.min(1, (1 - f) * 4, f * 8));
    }
  }

  /** Now and then a small flock crosses the view high up, its shadows gliding over the ground. */
  private updateBirds(dt: number, view: Phaser.Geom.Rectangle, now: number): void {
    if (now > this.nextFlock && this.birds.length === 0) {
      this.nextFlock = now + 14000 + Math.random() * 16000;
      const n = 3 + Math.floor(Math.random() * 4);
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? view.x - 60 : view.right + 60;
      const y0 = view.y + view.height * (0.2 + Math.random() * 0.5);
      const vx = (fromLeft ? 1 : -1) * (0.09 + Math.random() * 0.04);
      const vy = (Math.random() - 0.5) * 0.04;
      for (let i = 0; i < n; i++) {
        const ox = -Math.abs(i - n / 2) * 26 * Math.sign(vx);
        const oy = (i - n / 2) * 18;
        const img = this.scene.add
          .image(x0 + ox, y0 + oy, 'bird0')
          .setDepth(4.95e5)
          .setFlipX(vx < 0);
        const shadow = this.scene.add
          .image(x0 + ox + 70, y0 + oy + 110, 'bird0')
          .setTint(0x000000)
          .setAlpha(0.18)
          .setDepth(-0.8)
          .setFlipX(vx < 0);
        this.birds.push({ img, shadow, vx, vy, phase: Math.random() * 6 });
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]!;
      const dx = b.vx * dt * (TILE_PX / 32);
      const dy = b.vy * dt * (TILE_PX / 32);
      b.img.x += dx;
      b.img.y += dy;
      b.shadow.x += dx;
      b.shadow.y += dy;
      const key = Math.sin(now * 0.012 + b.phase) > 0 ? 'bird0' : 'bird1';
      b.img.setTexture(key);
      b.shadow.setTexture(key);
      if (b.img.x < view.x - 300 || b.img.x > view.right + 300) {
        b.img.destroy();
        b.shadow.destroy();
        this.birds.splice(i, 1);
      }
    }
  }

  /** A few butterflies flutter over the meadows near the camera. */
  private updateButterflies(view: Phaser.Geom.Rectangle, now: number, map: World['map']): void {
    for (const b of this.butterflies) {
      if (!b.img.visible || !view.contains(b.hx, b.hy)) {
        // Respawn over a random grass tile inside the view.
        for (let k = 0; k < 8 && this.land.length; k++) {
          const i = this.land[Math.floor(Math.random() * this.land.length)]!;
          const x = ((i % map.width) + 0.5) * TILE_PX;
          const y = (Math.floor(i / map.width) + 0.5) * TILE_PX;
          if (!view.contains(x, y)) continue;
          b.hx = x;
          b.hy = y;
          b.img.setVisible(true);
          break;
        }
        if (!b.img.visible) continue;
      }
      const t = now * 0.001 * b.speed + b.phase;
      b.img.setPosition(
        b.hx + Math.sin(t * 1.3) * 26 + Math.sin(t * 3.1) * 6,
        b.hy + Math.cos(t * 0.9) * 16 - 10 + Math.sin(t * 5) * 3,
      );
      // Wing beat: squash horizontally.
      b.img.setScale(0.9 * (0.35 + Math.abs(Math.sin(now * 0.025 + b.phase)) * 0.65), 0.9);
      b.hx += Math.sin(t * 0.2) * 0.15;
    }
  }
}
