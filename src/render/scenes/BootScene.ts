import Phaser from 'phaser';
import { ASSETS } from '../assets/manifest';
import type { MatchStartData } from '../context';

/** Loads file assets and generates procedural placeholder textures, then starts the match. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const a of ASSETS) {
      if ('url' in a) this.load.image(a.key, a.url);
    }
  }

  create(data: MatchStartData): void {
    for (const a of ASSETS) {
      if ('generate' in a && !this.textures.exists(a.key)) {
        this.textures.addCanvas(a.key, a.generate());
      }
    }
    document.getElementById('loading')?.remove();
    this.scene.start('World', data);
  }
}
