import Phaser from 'phaser';
import { CONTEXT_KEY, type AppContext } from './context';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

/**
 * Create the Phaser game. The canvas is rendered at `renderScale` × CSS size (crisp on high-DPI
 * screens) and displayed at CSS size via the scale manager's zoom.
 */
export function createGame(parent: HTMLElement, ctx: AppContext): Phaser.Game {
  const rs = ctx.renderScale;
  const size = (): [number, number] => [
    Math.max(1, Math.round(window.innerWidth * rs)),
    Math.max(1, Math.round(window.innerHeight * rs)),
  ];
  const [w, h] = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#16241a',
    banner: false,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / rs },
    render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
    // Pointer input is handled by our own gesture layer (src/render/input/PointerInput.ts).
    input: { mouse: false, touch: false, keyboard: true, gamepad: false },
    fps: { target: 60, smoothStep: true },
    scene: [],
  });
  game.registry.set(CONTEXT_KEY, ctx);
  game.scene.add('Boot', BootScene);
  game.scene.add('World', WorldScene);
  game.scene.start('Boot');

  const onResize = (): void => {
    const [nw, nh] = size();
    game.scale.resize(nw, nh);
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  return game;
}
