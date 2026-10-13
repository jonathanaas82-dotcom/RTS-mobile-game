import { PALETTE } from './palette';
import {
  generateBanner,
  generateBerryBush,
  generateGoldMine,
  generateRing,
} from './procedural/features';
import { generateTileset } from './procedural/tiles';

/**
 * Asset manifest: the single list of every texture the game uses.
 *
 * To replace placeholder art, change an entry from `generate` to `url` (put the file in
 * /public/assets). Keys, sizes and anchors stay the same so no game code changes.
 * The terrain tileset must follow the layout documented in `tileset.ts`.
 */
export type AssetEntry =
  { key: string; url: string } | { key: string; generate: () => HTMLCanvasElement };

export const ASSETS: readonly AssetEntry[] = [
  { key: 'tiles', generate: generateTileset },
  { key: 'gold_mine', generate: generateGoldMine },
  { key: 'berry_bush', generate: generateBerryBush },
  { key: 'ring', generate: generateRing },
  ...PALETTE.players.map((color, i) => ({
    key: `banner_${i}`,
    generate: () => generateBanner(color),
  })),
];
