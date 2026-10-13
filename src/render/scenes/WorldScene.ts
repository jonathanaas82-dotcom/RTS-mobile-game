import Phaser from 'phaser';
import { buildingDef, godDef, loc } from '../../data';
import { AGES } from '../../data/factions';
import { SIM, TICK_MS } from '../../data/balance/sim';
import { getLanguage, t } from '../../i18n';
import { haptic } from '../../platform/pwa';
import type { Command } from '../../sim/commands';
import { FixedStepLoop } from '../../sim/core/loop';
import type { Entity } from '../../sim/entity';
import { Simulation } from '../../sim/simulation';
import { canAdvance, nextAge } from '../../sim/rules';
import type { World } from '../../sim/world';
import { CommandCard, costText, denialText } from '../../ui/commandCard';
import { GestureRecognizer, type GestureEvent } from '../../ui/input/gestures';
import { MatchArt } from '../assets/matchArt';
import { BUILDING_OVERHANG } from '../assets/procedural/buildings';
import { TILESET_MARGIN, TILESET_SPACING, TILE_PX, tileFrame } from '../assets/tileset';
import { CameraModel } from '../camera/CameraModel';
import { CONTEXT_KEY, type AppContext, type MatchStartData } from '../context';
import { EntityRenderer } from '../entities/EntityRenderer';
import { InputController, type InputHost } from '../input/InputController';
import { PointerInput } from '../input/PointerInput';

/** On-screen size of one tile in CSS px at default / min / max zoom. */
const TILE_CSS_DEFAULT = 46;
const TILE_CSS_MIN = 12;
const TILE_CSS_MAX = 120;
/** Local human player slot. */
const ME = 0;

/**
 * The in-match scene: owns the Simulation, drives it with a fixed-step loop and renders it.
 * Rendering reads sim state; input becomes camera moves and sim commands.
 */
export class WorldScene extends Phaser.Scene {
  ctx!: AppContext;
  sim!: Simulation;
  private loop!: FixedStepLoop;
  camModel!: CameraModel;
  private gestures!: GestureRecognizer;
  private pointer!: PointerInput;
  private art!: MatchArt;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private entities!: EntityRenderer;
  input2!: InputController;
  private card!: CommandCard;
  private rings: Phaser.GameObjects.Image[] = [];
  private ghostImg: Phaser.GameObjects.Image | null = null;
  private nextStatsAt = 0;
  private nextHudAt = 0;
  private alpha = 0;
  private alertPos: { x: number; y: number } | null = null;

  constructor() {
    super('World');
  }

  create(data: MatchStartData): void {
    this.ctx = this.registry.get(CONTEXT_KEY) as AppContext;
    this.sim = new Simulation(data);
    this.loop = new FixedStepLoop({
      stepMs: TICK_MS,
      maxStepsPerFrame: SIM.maxStepsPerFrame,
      onStep: () => this.sim.step(),
    });
    this.art = new MatchArt(this.textures, data.players);
    this.buildTerrain();
    this.entities = new EntityRenderer(this, this.art);
    this.setupCamera();
    this.setupInput();
    this.exposeControls();
    this.ctx.hud.show(true);
    this.refreshHud(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.pointer.destroy();
      this.ctx.match = null;
    });
  }

  get world(): World {
    return this.sim.world;
  }

  private buildTerrain(): void {
    const map = this.world.map;
    const data: number[][] = [];
    for (let y = 0; y < map.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < map.width; x++) row.push(tileFrame(map, x, y));
      data.push(row);
    }
    const tm = this.make.tilemap({ data, tileWidth: TILE_PX, tileHeight: TILE_PX });
    const tileset = tm.addTilesetImage(
      'tiles',
      'tiles',
      TILE_PX,
      TILE_PX,
      TILESET_MARGIN,
      TILESET_SPACING,
    );
    if (!tileset) throw new Error('tileset missing');
    const layer = tm.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('layer missing');
    this.layer = layer.setDepth(-1);
  }

  /** A forest tile was cut down: redraw it and its neighbours (edge masks may change). */
  private refreshTile(i: number): void {
    const map = this.world.map;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        this.layer.putTileAt(tileFrame(map, nx, ny), nx, ny);
      }
    }
  }

  private setupCamera(): void {
    const map = this.world.map;
    const rs = this.ctx.renderScale;
    const toZoom = (cssPerTile: number): number => (cssPerTile * rs) / TILE_PX;
    this.camModel = new CameraModel({
      worldWidth: map.width * TILE_PX,
      worldHeight: map.height * TILE_PX,
      minZoom: toZoom(TILE_CSS_MIN),
      maxZoom: toZoom(TILE_CSS_MAX),
      overscroll: TILE_PX * 2,
    });
    this.camModel.zoom = toZoom(TILE_CSS_DEFAULT);
    this.camModel.setViewport(this.scale.width, this.scale.height);
    const home = map.starts[ME] ?? { x: map.width / 2, y: map.height / 2 };
    this.camModel.centerOn((home.x + 0.5) * TILE_PX, (home.y + 2) * TILE_PX);
    this.cameras.main.setBackgroundColor('#16241a');
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      this.camModel.setViewport(size.width, size.height);
    });
    this.applyCamera();
  }

  /** Centre the camera on a tile position. */
  centerOnTile(x: number, y: number): void {
    this.camModel.centerOn(x * TILE_PX, y * TILE_PX);
  }

  private setupInput(): void {
    this.input2 = new InputController(this.inputHost());
    this.card = new CommandCard({
      world: () => this.world,
      me: ME,
      issue: (c) => this.issue(c),
      icon: (f) => (f && this.art.has(f) ? this.art.icon(f) : ''),
      startPlacement: (def) => this.input2.startPlacement(def),
      startPowerTarget: (p) => this.input2.startPowerTarget(p),
      openAgeChoice: (b) => this.openAgeChoice(b),
      select: (ids) => {
        this.input2.selection.set(ids);
        this.refreshHud(true);
      },
      deselect: () => {
        this.input2.selection.clear();
        this.refreshHud(true);
      },
      hint: (s) => this.ctx.hud.showInfo(s),
    });
    this.gestures = new GestureRecognizer((e) => this.input2.onGesture(e));
    this.pointer = new PointerInput(this.game.canvas, this.gestures, (deltaY, x, y) => {
      const rs = this.ctx.renderScale;
      this.camModel.zoomAt(Math.exp(-deltaY * 0.0015), x * rs, y * rs);
    });
  }

  private inputHost(): InputHost {
    const rs = (): number => this.ctx.renderScale;
    return {
      world: () => this.world,
      me: ME,
      issue: (c) => this.issue(c),
      hud: this.ctx.hud,
      screenToTile: (x, y) => {
        const w = this.camModel.screenToWorld(x * rs(), y * rs());
        return { x: w.x / TILE_PX, y: w.y / TILE_PX };
      },
      viewCenterTile: () => ({
        x: this.camModel.centerX / TILE_PX,
        y: this.camModel.centerY / TILE_PX,
      }),
      slopTiles: () => (22 * rs()) / (this.camModel.zoom * TILE_PX),
      visible: (e) => this.isVisible(e),
      explored: () => true,
      marker: (x, y, kind) =>
        this.ring(
          x * TILE_PX,
          y * TILE_PX,
          { move: 0x7cf29c, attack: 0xff5a5a, gather: 0xffd166, build: 0xf0cf72 }[kind],
        ),
      ghost: (def, tx, ty, ok) => this.ghost(def, tx ?? 0, ty ?? 0, ok ?? false),
      sound: () => undefined,
      haptic: (ms) => {
        if (this.ctx.settings.haptics) haptic(ms ?? 15);
      },
      onScreen: (e) => this.cameras.main.worldView.contains(e.x * TILE_PX, e.y * TILE_PX),
      cameraGesture: (e) => this.cameraGesture(e),
      refreshHud: () => this.refreshHud(true),
    };
  }

  issue(c: Command): void {
    this.sim.enqueue(c);
  }

  /** Entities hidden by fog of war are not drawn or pickable (M4 adds the fog). */
  isVisible(_e: Entity): boolean {
    return true;
  }

  private cameraGesture(e: GestureEvent): void {
    const rs = this.ctx.renderScale;
    const cam = this.camModel;
    switch (e.type) {
      case 'panstart':
      case 'pinchstart':
        cam.stopFling();
        break;
      case 'pan':
        cam.panByScreen(e.dx * rs, e.dy * rs);
        break;
      case 'panend':
        cam.fling(e.vx * rs, e.vy * rs);
        break;
      case 'pinch':
        cam.panByScreen(e.dx * rs, e.dy * rs);
        cam.zoomAt(e.scale, e.cx * rs, e.cy * rs);
        break;
      default:
        break;
    }
  }

  private ghost(def: string | null, tx: number, ty: number, ok: boolean): void {
    if (!def) {
      this.ghostImg?.setVisible(false);
      return;
    }
    const [key, frame] = this.art.frame(`b:${def}:${ME}`);
    if (!this.ghostImg)
      this.ghostImg = this.add
        .image(0, 0, key, frame)
        .setOrigin(0, 0)
        .setDepth(1e6 - 1);
    this.ghostImg
      .setTexture(key, frame)
      .setVisible(true)
      .setAlpha(0.7)
      .setTint(ok ? 0x9cff9c : 0xff7070)
      .setPosition(tx * TILE_PX, ty * TILE_PX - BUILDING_OVERHANG * TILE_PX);
    void buildingDef(def);
  }

  private openAgeChoice(b: Entity): void {
    const p = this.world.players[ME]!;
    const info = nextAge(p);
    if (!info) return;
    const lang = getLanguage();
    const ageName = loc(AGES[info.next]!.name, lang);
    this.ctx.hud.showModal({
      title: t('cmd.advance', { age: ageName }),
      body: `${t('age.cost')}: ${costText(info.cost)} · ${info.time}s\n${t('age.choose')}`,
      dismissable: true,
      choices: info.gods.map((g) => {
        const d = godDef(g);
        const chk = canAdvance(p, b, g);
        return {
          id: g,
          title: loc(d.name, lang),
          subtitle: loc(d.title, lang),
          body: loc(d.desc, lang) + (chk.ok ? '' : `\n${denialText(chk)}`),
          disabled: !chk.ok,
          onChoose: () => {
            this.issue({ type: 'advanceAge', player: ME, building: b.id, god: g });
            this.ctx.hud.showModal(null);
          },
        };
      }),
    });
  }

  private exposeControls(): void {
    this.ctx.match = {
      setPaused: (p) => {
        this.loop.paused = p;
        this.ctx.hud.onPauseChange(p);
      },
      isPaused: () => this.loop.paused,
      setSpeed: (s) => {
        this.loop.speed = s;
        this.ctx.hud.onSpeedChange(s);
      },
      getSpeed: () => this.loop.speed,
      openMenu: () => {
        this.loop.paused = true;
        this.ctx.hud.onPauseChange(true);
        this.ctx.hud.showModal({
          title: t('hud.paused'),
          actions: [
            {
              label: t('hud.resume'),
              primary: true,
              onPress: () => {
                this.ctx.hud.showModal(null);
                this.loop.paused = false;
                this.ctx.hud.onPauseChange(false);
              },
            },
          ],
        });
      },
      toggleBoxMode: () => this.input2.toggleBoxMode(),
      selectIdleWorkers: () => {
        const idle = this.input2.selectIdleWorkers();
        if (idle.length) this.centerOnTile(idle[0]!.x, idle[0]!.y);
        else this.ctx.hud.showInfo(t('hud.noIdle'));
      },
      selectArmy: () => {
        if (this.input2.selectArmy().length === 0) this.ctx.hud.showInfo(t('hud.noArmy'));
      },
      groupPress: (i) => {
        const sel = this.input2.selection;
        const g = sel.groups[i]!;
        const wasSame =
          g.length > 0 && sel.ids.size === g.length && g.every((id) => sel.ids.has(id));
        if (sel.recallGroup(i) && wasSame) {
          // Second tap on an already-selected group centres the camera on it.
          const ents = sel.entities(this.world);
          if (ents.length) this.centerOnTile(ents[0]!.x, ents[0]!.y);
        }
        this.refreshHud(true);
      },
      groupAssign: (i) => {
        this.input2.selection.assignGroup(i);
        if (this.ctx.settings.haptics) haptic(25);
        this.ctx.hud.showInfo(
          t('hud.groupSet', { n: i + 1, count: this.input2.selection.ids.size }),
        );
        this.refreshHud(true);
      },
      jumpToAlert: () => {
        if (this.alertPos) this.centerOnTile(this.alertPos.x, this.alertPos.y);
      },
    };
  }

  /** Expanding ring feedback, pooled to avoid allocations on every tap. */
  ring(x: number, y: number, tint: number): void {
    let img = this.rings.find((r) => !r.visible);
    if (!img) {
      img = this.add.image(0, 0, 'ring').setDepth(1e6);
      this.rings.push(img);
    }
    img.setPosition(x, y).setTint(tint).setVisible(true).setAlpha(1).setScale(0.25);
    this.tweens.killTweensOf(img);
    const target = img;
    this.tweens.add({
      targets: target,
      scale: 0.7,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => target.setVisible(false),
    });
  }

  private applyCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(this.camModel.zoom);
    cam.centerOn(this.camModel.centerX, this.camModel.centerY);
  }

  /** Push current state to the HUD (throttled unless forced). */
  refreshHud(force = false): void {
    const now = this.time.now;
    if (!force && now < this.nextHudAt) return;
    this.nextHudAt = now + 200;
    const w = this.world;
    const p = w.players[ME];
    if (!p) return;
    const hud = this.ctx.hud;
    hud.setResources(p.res, p.pop, p.popCap, loc(AGES[p.age]!.name, getLanguage()));
    const sel = this.input2.selection;
    sel.prune(w);
    let idle = 0;
    let army = 0;
    for (const e of w.entities) {
      if (e.dead || e.owner !== ME || e.kind !== 'unit') continue;
      if (e.cls === 'worker') {
        if (e.order.type === 'idle') idle++;
      } else army++;
    }
    hud.setTools(this.input2.modeKind === 'box', idle, army);
    hud.setGroups(sel.groups.map((g) => g.length));
    const ents = sel.entities(w);
    hud.setSelection(this.card.selectionView(ents));
    hud.setCommands(this.card.commands(ents));
    hud.setPowers(this.card.powers());
  }

  override update(time: number): void {
    // Phaser's `delta` is smoothed and capped at the target frame time, which would slow the
    // match down on a struggling device. Game time must follow real time, so use the raw delta.
    const dt = this.game.loop.rawDelta;
    this.gestures.update(performance.now());
    this.camModel.update(dt);
    this.applyCamera();
    this.alpha = this.loop.advance(dt);
    for (const ev of this.sim.drainEvents()) {
      if (ev.type === 'treeCut') this.refreshTile(ev.tile);
      else if (ev.type === 'underAttack' && ev.owner === ME) {
        this.alertPos = { x: ev.x, y: ev.y };
        this.ctx.hud.alert();
        if (this.ctx.settings.haptics) haptic([40, 60, 40]);
      }
    }
    this.input2.update();
    this.entities.update(
      this.world,
      this.alpha,
      time,
      this.input2.selection.ids,
      (e) => this.isVisible(e),
      this.cameras.main.worldView,
    );
    this.refreshHud();

    if (time >= this.nextStatsAt && this.ctx.settings.showDebug) {
      this.nextStatsAt = time + 250;
      this.ctx.hud.setDebugStats({
        fps: this.game.loop.actualFps,
        tick: this.world.tick,
        zoom: (this.camModel.zoom * TILE_PX) / this.ctx.renderScale,
        seed: this.world.config.seed,
        camTileX: this.camModel.centerX / TILE_PX,
        camTileY: this.camModel.centerY / TILE_PX,
        entities: this.world.entities.length,
      });
    }
  }
}
