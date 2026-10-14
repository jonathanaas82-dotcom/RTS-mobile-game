import {
  generateBerryBush,
  generateFishJump,
  generateFishSpot,
  generateGlint,
  generateGoldMine,
  generateRing,
  generateSoft,
  generateSpark,
} from './procedural/features';

/**
 * Asset manifest: the list of shared textures the game uses.
 *
 * To replace placeholder art, change an entry from `generate` to `url` (put the file in
 * /public/assets). Keep the key and the texture-pixel scale (ART_RES = 2 for gold_mine and
 * berry_bush). Per-match art (units, buildings in player colours, terrain, trees) is generated in
 * `matchArt.ts`, `terrain/ground.ts` and `terrain/trees.ts`.
 */
export type AssetEntry =
  { key: string; url: string } | { key: string; generate: () => HTMLCanvasElement };

export const ASSETS: readonly AssetEntry[] = [
  { key: 'gold_mine', generate: generateGoldMine },
  { key: 'berry_bush', generate: generateBerryBush },
  { key: 'fish_spot', generate: generateFishSpot },
  { key: 'fish_jump', generate: generateFishJump },
  { key: 'ring', generate: generateRing },
  { key: 'spark', generate: generateSpark },
  { key: 'soft', generate: generateSoft },
  { key: 'glint', generate: generateGlint },
];
