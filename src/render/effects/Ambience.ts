import type Phaser from 'phaser';
import { Terrain } from '../../sim/map/terrain';
import type { World } from '../../sim/world';
import { TILE_PX } from '../assets/tileset';

interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number;
}

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
  enabled = true;

  constructor(scene: Phaser.Scene, world: World, quality: 'low' | 'medium' | 'high') {
    this.scene = scene;
    this.mapW = world.map.width * TILE_PX;
    this.mapH = world.map.height * TILE_PX;
    for (let i = 0; i < world.map.tiles.length; i++)
      if (world.map.tiles[i] === Terrain.Water) this.water.push(i);
    this.enabled = quality !== 'low';
    const n = quality === 'high' ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const img = scene.add
        .image(Math.random() * this.mapW, Math.random() * this.mapH, 'soft')
        .setTint(0x0b1a0e)
        .setAlpha(0.2)
        .setScale(
          (8 + Math.random() * 7) * (TILE_PX / 128) * 2,
          (5 + Math.random() * 4) * (TILE_PX / 128) * 2,
        )
        .setDepth(4.9e5);
      img.setVisible(this.enabled);
      this.clouds.push({ img, speed: 0.012 + Math.random() * 0.01 });
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
}
