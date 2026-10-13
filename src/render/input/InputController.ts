import { buildingDef, loc, powerDef } from '../../data';
import { getLanguage, t } from '../../i18n';
import type { Command } from '../../sim/commands';
import type { Entity } from '../../sim/entity';
import { Terrain } from '../../sim/map/terrain';
import type { World } from '../../sim/world';
import type { GestureEvent } from '../../ui/input/gestures';
import { Selection, pickEntity, unitsInRect } from '../../ui/selection';
import type { Hud } from '../../ui/hud/Hud';

/** Services the controller needs from the scene (keeps it free of Phaser). */
export interface InputHost {
  world(): World;
  me: number;
  issue(c: Command): void;
  hud: Hud;
  /** CSS px -> world tile coordinates. */
  screenToTile(x: number, y: number): { x: number; y: number };
  /** Tile coordinates of the view centre. */
  viewCenterTile(): { x: number; y: number };
  /** Finger tolerance in tiles at the current zoom. */
  slopTiles(): number;
  /** Is the entity visible to the local player (fog)? */
  visible(e: Entity): boolean;
  /** Is the tile explored by the local player? */
  explored(tx: number, ty: number): boolean;
  /** Visual feedback ring at a tile position. */
  marker(x: number, y: number, kind: 'move' | 'attack' | 'gather' | 'build'): void;
  /** Placement ghost: show at tile with validity, or hide (null). */
  ghost(def: string | null, tx?: number, ty?: number, ok?: boolean): void;
  sound(name: 'select' | 'command' | 'error'): void;
  haptic(ms?: number): void;
  /** Units of a def visible on screen (double-tap). */
  onScreen(e: Entity): boolean;
  /** Pan / zoom the camera from gestures in default mode. */
  cameraGesture(e: GestureEvent): void;
  refreshHud(): void;
}

type Mode =
  | { kind: 'normal' }
  | { kind: 'box' }
  | { kind: 'place'; def: string; tx: number; ty: number }
  | { kind: 'power'; power: string };

export class InputController {
  readonly selection = new Selection();
  private mode: Mode = { kind: 'normal' };
  /** True while dragging a box (box mode pan or long-press drag). */
  private boxing = false;
  private boxStart = { x: 0, y: 0 };
  private readonly host: InputHost;

  constructor(host: InputHost) {
    this.host = host;
  }

  get modeKind(): Mode['kind'] {
    return this.mode.kind;
  }

  // ───────────── modes ─────────────

  toggleBoxMode(): void {
    this.setMode(this.mode.kind === 'box' ? { kind: 'normal' } : { kind: 'box' });
  }

  startPlacement(def: string): void {
    const c = this.host.viewCenterTile();
    const size = buildingDef(def).size;
    this.setMode({
      kind: 'place',
      def,
      tx: Math.floor(c.x - size / 2 + 0.5),
      ty: Math.floor(c.y - size / 2 + 0.5),
    });
  }

  startPowerTarget(power: string): void {
    this.setMode({ kind: 'power', power });
  }

  cancelMode(): void {
    this.setMode({ kind: 'normal' });
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.boxing = false;
    this.host.hud.showBox(null);
    this.host.ghost(null);
    const hud = this.host.hud;
    switch (m.kind) {
      case 'normal':
        hud.showBanner(null);
        break;
      case 'box':
        hud.showBanner({ text: t('hud.boxBanner'), onCancel: () => this.cancelMode() });
        break;
      case 'place': {
        const name = loc(buildingDef(m.def).name, getLanguage());
        hud.showBanner({
          text: t('hud.placeBanner', { name }),
          onConfirm: () => this.confirmPlacement(),
          onCancel: () => this.cancelMode(),
        });
        this.updateGhost();
        break;
      }
      case 'power': {
        const name = loc(powerDef(m.power).name, getLanguage());
        hud.showBanner({ text: t('hud.powerBanner', { name }), onCancel: () => this.cancelMode() });
        break;
      }
    }
    this.host.refreshHud();
  }

  /** Called every frame: in placement mode the ghost follows the view centre while panning. */
  update(): void {
    if (this.mode.kind === 'place') this.updateGhost();
  }

  private placementValid(def: string, tx: number, ty: number): boolean {
    const world = this.host.world();
    const size = buildingDef(def).size;
    if (!world.grid.canPlace(tx, ty, size)) return false;
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) if (!this.host.explored(x, y)) return false;
    return true;
  }

  private updateGhost(): void {
    const m = this.mode;
    if (m.kind !== 'place') return;
    const ok = this.placementValid(m.def, m.tx, m.ty);
    this.host.ghost(m.def, m.tx, m.ty, ok);
    this.host.hud.setBannerConfirm(ok);
  }

  private confirmPlacement(): void {
    const m = this.mode;
    if (m.kind !== 'place') return;
    if (!this.placementValid(m.def, m.tx, m.ty)) {
      this.host.sound('error');
      return;
    }
    const workers = this.selection
      .ownUnits(this.host.world(), this.host.me)
      .filter((u) => u.cls === 'worker');
    this.host.issue({
      type: 'build',
      player: this.host.me,
      ids: workers.map((w) => w.id),
      def: m.def,
      tileX: m.tx,
      tileY: m.ty,
    });
    const size = buildingDef(m.def).size;
    this.host.marker(m.tx + size / 2, m.ty + size / 2, 'build');
    this.host.sound('command');
    this.cancelMode();
  }

  // ───────────── gestures ─────────────

  onGesture(e: GestureEvent): void {
    const m = this.mode;
    // Box mode turns one-finger pan into a selection rectangle; long-press-drag always does.
    if (m.kind === 'box' && (e.type === 'panstart' || e.type === 'pan' || e.type === 'panend')) {
      this.boxGesture(e);
      return;
    }
    switch (e.type) {
      case 'tap':
        this.tap(e.x, e.y);
        return;
      case 'doubletap':
        this.doubleTap(e.x, e.y);
        return;
      case 'longpress':
        if (m.kind === 'normal') {
          this.boxing = true;
          this.boxStart = { x: e.x, y: e.y };
          this.host.haptic(15);
          this.host.hud.showBox({ x0: e.x, y0: e.y, x1: e.x, y1: e.y });
        }
        return;
      case 'pressdrag':
        if (this.boxing) this.host.hud.showBox({ x0: e.startX, y0: e.startY, x1: e.x, y1: e.y });
        return;
      case 'pressend':
        if (this.boxing) this.finishBox(e.startX, e.startY, e.x, e.y);
        return;
      default:
        this.host.cameraGesture(e);
    }
  }

  private boxGesture(e: GestureEvent): void {
    if (e.type === 'panstart') {
      this.boxing = true;
      this.boxStart = { x: e.x, y: e.y };
    } else if (e.type === 'pan' && this.boxing) {
      this.host.hud.showBox({ x0: this.boxStart.x, y0: this.boxStart.y, x1: e.x, y1: e.y });
    } else if (e.type === 'panend' && this.boxing) {
      this.finishBox(this.boxStart.x, this.boxStart.y, e.x, e.y);
    }
  }

  private finishBox(x0: number, y0: number, x1: number, y1: number): void {
    this.boxing = false;
    this.host.hud.showBox(null);
    const a = this.host.screenToTile(x0, y0);
    const b = this.host.screenToTile(x1, y1);
    const units = unitsInRect(this.host.world(), this.host.me, a.x, a.y, b.x, b.y);
    if (units.length > 0) {
      this.selection.set(units.map((u) => u.id));
      this.host.sound('select');
      this.host.haptic(10);
    }
    if (this.mode.kind === 'box') this.cancelMode();
    this.host.refreshHud();
  }

  private tap(sx: number, sy: number): void {
    const world = this.host.world();
    const me = this.host.me;
    const p = this.host.screenToTile(sx, sy);
    const m = this.mode;
    if (m.kind === 'place') {
      const size = buildingDef(m.def).size;
      m.tx = Math.floor(p.x - size / 2 + 0.5);
      m.ty = Math.floor(p.y - size / 2 + 0.5);
      this.updateGhost();
      return;
    }
    if (m.kind === 'power') {
      this.host.issue({ type: 'castPower', player: me, power: m.power, x: p.x, y: p.y });
      this.host.haptic(30);
      this.cancelMode();
      return;
    }
    if (m.kind === 'box') return;

    const hit = pickEntity(world, p.x, p.y, this.host.slopTiles(), (e) => this.host.visible(e));
    const units = this.selection.ownUnits(world, me);
    const workers = units.filter((u) => u.cls === 'worker');

    if (hit && hit.owner === me) {
      // Workers tapping an unfinished/damaged own building help build/repair it.
      if (
        hit.kind === 'building' &&
        workers.length > 0 &&
        workers.length === units.length &&
        (!hit.built || hit.hp < hit.maxHp)
      ) {
        this.host.issue({
          type: 'construct',
          player: me,
          ids: workers.map((w) => w.id),
          target: hit.id,
        });
        this.host.marker(hit.x, hit.y, 'build');
        this.host.sound('command');
        return;
      }
      // Workers tapping an own farm go farm it.
      if (
        hit.kind === 'building' &&
        hit.def === 'farm' &&
        hit.built &&
        workers.length > 0 &&
        workers.length === units.length
      ) {
        this.host.issue({
          type: 'gather',
          player: me,
          ids: workers.map((w) => w.id),
          target: hit.id,
          tile: -1,
        });
        this.host.marker(hit.x, hit.y, 'gather');
        this.host.sound('command');
        return;
      }
      this.selection.set([hit.id]);
      this.host.sound('select');
      this.host.refreshHud();
      return;
    }

    if (units.length > 0) {
      if (hit && hit.owner >= 0 && hit.owner !== me) {
        this.host.issue({
          type: 'attack',
          player: me,
          ids: units.map((u) => u.id),
          target: hit.id,
        });
        this.host.marker(hit.x, hit.y, 'attack');
        this.host.sound('command');
        return;
      }
      const tx = Math.floor(p.x);
      const ty = Math.floor(p.y);
      const isForest =
        world.grid.inBounds(tx, ty) &&
        world.map.tiles[ty * world.map.width + tx] === Terrain.Forest;
      if (workers.length > 0 && ((hit && hit.kind === 'resource') || isForest)) {
        this.host.issue({
          type: 'gather',
          player: me,
          ids: workers.map((w) => w.id),
          target: hit && hit.kind === 'resource' ? hit.id : -1,
          tile: hit && hit.kind === 'resource' ? -1 : ty * world.map.width + tx,
        });
        const others = units.filter((u) => u.cls !== 'worker');
        if (others.length)
          this.host.issue({
            type: 'move',
            player: me,
            ids: others.map((u) => u.id),
            x: p.x,
            y: p.y,
          });
        this.host.marker(hit ? hit.x : tx + 0.5, hit ? hit.y : ty + 0.5, 'gather');
        this.host.sound('command');
        return;
      }
      this.host.issue({ type: 'move', player: me, ids: units.map((u) => u.id), x: p.x, y: p.y });
      this.host.marker(p.x, p.y, 'move');
      this.host.sound('command');
      return;
    }

    // Only own buildings selected: tapping the ground sets their rally point.
    const sel = this.selection.entities(world);
    const ownBuildings = sel.filter((e) => e.owner === me && e.kind === 'building');
    if (!hit && ownBuildings.length > 0 && ownBuildings.length === sel.length) {
      for (const b of ownBuildings)
        this.host.issue({ type: 'rally', player: me, building: b.id, x: p.x, y: p.y });
      this.host.marker(p.x, p.y, 'move');
      this.host.sound('command');
      return;
    }

    if (hit) {
      // Inspect enemies/resources.
      this.selection.set([hit.id]);
      this.host.sound('select');
    } else {
      this.selection.clear();
    }
    this.host.refreshHud();
  }

  private doubleTap(sx: number, sy: number): void {
    if (this.mode.kind !== 'normal') return;
    const world = this.host.world();
    const p = this.host.screenToTile(sx, sy);
    const hit = pickEntity(world, p.x, p.y, this.host.slopTiles(), (e) => this.host.visible(e));
    if (!hit || hit.owner !== this.host.me || hit.kind !== 'unit') return;
    const same = world.entities.filter(
      (e) => !e.dead && e.owner === this.host.me && e.def === hit.def && this.host.onScreen(e),
    );
    this.selection.set(same.map((e) => e.id));
    this.host.haptic(10);
    this.host.refreshHud();
  }

  // ───────────── HUD buttons ─────────────

  selectIdleWorkers(): Entity[] {
    const world = this.host.world();
    const idle = world.entities.filter(
      (e) =>
        !e.dead &&
        e.owner === this.host.me &&
        e.cls === 'worker' &&
        e.order.type === 'idle' &&
        e.inside < 0,
    );
    if (idle.length) this.selection.set(idle.map((e) => e.id));
    this.host.refreshHud();
    return idle;
  }

  selectArmy(): Entity[] {
    const world = this.host.world();
    const army = world.entities.filter(
      (e) =>
        !e.dead &&
        e.owner === this.host.me &&
        e.kind === 'unit' &&
        e.cls !== 'worker' &&
        e.inside < 0,
    );
    if (army.length) this.selection.set(army.map((e) => e.id));
    this.host.refreshHud();
    return army;
  }
}
