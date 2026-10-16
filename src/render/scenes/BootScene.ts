import Phaser from 'phaser';
import { ASSETS } from '../assets/manifest';
import { addStaticTexture } from '../assets/atlas';
export const BOOT_READY = 'boot-ready';

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

  create(): void {
    for (const a of ASSETS) {
      if ('generate' in a && !this.textures.exists(a.key)) {
        addStaticTexture(this.textures, a.key, a.generate());
      }
    }
    document.getElementById('loading')?.remove();
    // The app (main.ts) shows the menu once shared assets exist.
    this.game.events.emit(BOOT_READY);
  }
}
