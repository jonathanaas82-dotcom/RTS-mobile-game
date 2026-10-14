import type Phaser from 'phaser';
import { BUILDINGS, UNITS, buildingDef, factionDef } from '../../data';
import type { FactionId } from '../../data/types';
import { PALETTE } from './palette';
import { AtlasBuilder } from './atlas';
import { buildingShadow, drawBuilding, drawFoundation } from './procedural/buildings';
import {
  CARRY_ARTS,
  WORK_ACTS,
  drawProjectile,
  drawUnit,
  poseName,
  unitShadow,
  type Pose,
} from './procedural/units';

/**
 * Generates and packs all sprites needed for a match (units + buildings per player colour).
 * Frame names: `u:<unitId>:<slot>[:<pose>]` (see `poseName`), `b:<buildingId>:<slot>`, `found:<size>`, `p:<kind>`.
 */
export class MatchArt {
  private readonly lookup: Map<string, string>;
  /** Data-URL portraits for HTML buttons, generated lazily. */
  private readonly icons = new Map<string, string>();
  private readonly canvases = new Map<string, HTMLCanvasElement>();

  constructor(textures: Phaser.Textures.TextureManager, players: Array<{ faction: FactionId }>) {
    const atlas = new AtlasBuilder();
    const shadowed = new Set<string>();
    players.forEach((p, slot) => {
      const team = PALETTE.players[slot] ?? '#ffffff';
      const f = factionDef(p.faction);
      for (const u of UNITS) {
        if (u.faction !== p.faction) continue;
        const cv = drawUnit(u, team);
        atlas.add(`u:${u.id}:${slot}`, cv);
        this.canvases.set(`u:${u.id}:${slot}`, cv);
        if (!shadowed.has(u.id)) {
          shadowed.add(u.id);
          const sh = unitShadow(u, cv);
          if (sh) atlas.add(`us:${u.id}`, sh);
        }
        if (u.art.shape !== 'humanoid') continue;
        // Animation poses: a stride frame for everyone on foot; work and carry poses for workers.
        const poses: Pose[] = [{ stride: true }];
        if (u.cls === 'worker') {
          for (const act of WORK_ACTS) poses.push({ act, frame: 0 }, { act, frame: 1 });
          for (const carry of CARRY_ARTS) poses.push({ carry }, { carry, stride: true });
        }
        for (const pose of poses)
          atlas.add(`u:${u.id}:${slot}:${poseName(pose)}`, drawUnit(u, team, pose));
      }
      for (const b of BUILDINGS) {
        if (b.factions && !b.factions.includes(p.faction)) continue;
        const cv = drawBuilding(b, f, team);
        atlas.add(`b:${b.id}:${slot}`, cv);
        const sh = buildingShadow(b, cv);
        if (sh) atlas.add(`bs:${b.id}:${slot}`, sh);
        this.canvases.set(`b:${b.id}:${slot}`, cv);
      }
    });
    for (const size of [2, 3]) atlas.add(`found:${size}`, drawFoundation(size));
    atlas.add('p:arrow', drawProjectile('arrow'));
    atlas.add('p:stone', drawProjectile('stone'));
    atlas.add('p:orb', drawProjectile('orb'));
    this.lookup = atlas.build(textures, 'match');
  }

  /** Texture key + frame for a frame name. */
  frame(name: string): [string, string] {
    const key = this.lookup.get(name);
    if (!key) throw new Error(`missing sprite ${name}`);
    return [key, name];
  }

  has(name: string): boolean {
    return this.lookup.has(name);
  }

  /** PNG data URL of a sprite (for DOM buttons). */
  icon(name: string): string {
    let url = this.icons.get(name);
    if (!url) {
      const cv = this.canvases.get(name);
      url = cv ? cv.toDataURL() : '';
      this.icons.set(name, url);
    }
    return url;
  }

  buildingFootprint(def: string): number {
    return buildingDef(def).size;
  }
}
