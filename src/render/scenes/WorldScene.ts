import Phaser from 'phaser';
import { SIM, TICK_MS } from '../../data/balance/sim';
import { t } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { haptic } from '../../platform/pwa';
import { FixedStepLoop } from '../../sim/core/loop';
import { featureSize } from '../../sim/map/mapgen';
import { Simulation } from '../../sim/simulation';
import { GestureRecognizer, type GestureEvent } from '../../ui/input/gestures';
import { TILESET_MARGIN, TILESET_SPACING, TILE_PX, tileFrame } from '../assets/tileset';
import { CameraModel } from '../camera/CameraModel';
import { CONTEXT_KEY, type AppContext, type MatchStartData } from '../context';
import { PointerInput } from '../input/PointerInput';

/** On-screen size of one tile in CSS px at default / min / max zoom. */
const TILE_CSS_DEFAULT = 46;
const TILE_CSS_MIN = 12;
const TILE_CSS_MAX = 120;

/**
 * The in-match scene: owns the Simulation, drives it with a fixed-step loop and renders it.
 * Rendering reads sim state; input becomes camera moves now and sim commands from M2 on.
 */
export class WorldScene extends Phaser.Scene {
  private ctx!: AppContext;
  private sim!: Simulation;
  private loop!: FixedStepLoop;
  private camModel!: CameraModel;
  private gestures!: GestureRecognizer;
  private pointer!: PointerInput;
  private rings: Phaser.GameObjects.Image[] = [];
  private nextStatsAt = 0;

  constructor() {
    super('World');
  }

  create(data: MatchStartData): void {
    this.ctx = this.registry.get(CONTEXT_KEY) as AppContext;
    this.sim = new Simulation({ seed: data.seed, mapSize: data.mapSize, players: 2 });
    this.loop = new FixedStepLoop({
      stepMs: TICK_MS,
      maxStepsPerFrame: SIM.maxStepsPerFrame,
      onStep: () => this.sim.step(),
    });

    this.buildTerrain();
    this.buildFeatures();
    this.setupCamera();
    this.setupInput();
    this.exposeControls();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.pointer.destroy());
  }

  private buildTerrain(): void {
    const map = this.sim.world.map;
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
    tm.createLayer(0, tileset, 0, 0)?.setDepth(-1);
  }

  private buildFeatures(): void {
    const map = this.sim.world.map;
    for (const f of map.features) {
      const s = featureSize(f.kind) * TILE_PX;
      const key = f.kind === 'gold' ? 'gold_mine' : 'berry_bush';
      const img = this.add.image(f.x * TILE_PX + s / 2, f.y * TILE_PX + s / 2, key);
      img.setDepth(img.y);
    }
    map.starts.forEach((s, i) => {
      const img = this.add.image((s.x + 0.5) * TILE_PX, (s.y + 0.5) * TILE_PX, `banner_${i}`);
      img.setOrigin(0.5, 0.9).setDepth(img.y);
    });
  }

  private setupCamera(): void {
    const map = this.sim.world.map;
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
    const home = map.starts[0] ?? { x: map.width / 2, y: map.height / 2 };
    this.camModel.centerOn((home.x + 0.5) * TILE_PX, (home.y + 0.5) * TILE_PX);
    this.cameras.main.setBackgroundColor('#16241a');
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      this.camModel.setViewport(size.width, size.height);
    });
    this.applyCamera();
  }

  private setupInput(): void {
    this.gestures = new GestureRecognizer((e) => this.onGesture(e));
    this.pointer = new PointerInput(this.game.canvas, this.gestures, (deltaY, x, y) => {
      const rs = this.ctx.renderScale;
      this.camModel.zoomAt(Math.exp(-deltaY * 0.0015), x * rs, y * rs);
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
      },
      getSpeed: () => this.loop.speed,
    };
  }

  /** Gesture coordinates arrive in CSS px; the camera works in canvas px. */
  private onGesture(e: GestureEvent): void {
    const rs = this.ctx.renderScale;
    const cam = this.camModel;
    switch (e.type) {
      case 'panstart':
        cam.stopFling();
        break;
      case 'pan':
        cam.panByScreen(e.dx * rs, e.dy * rs);
        break;
      case 'panend':
        cam.fling(e.vx * rs, e.vy * rs);
        break;
      case 'pinchstart':
        cam.stopFling();
        break;
      case 'pinch':
        cam.panByScreen(e.dx * rs, e.dy * rs);
        cam.zoomAt(e.scale, e.cx * rs, e.cy * rs);
        break;
      case 'tap':
        this.inspect(e.x * rs, e.y * rs);
        break;
      case 'doubletap':
        this.tweenZoom(1.6, e.x * rs, e.y * rs);
        break;
      case 'longpress': {
        const w = cam.screenToWorld(e.x * rs, e.y * rs);
        this.ring(w.x, w.y, 0xffd166);
        if (this.ctx.settings.haptics) haptic(20);
        break;
      }
      default:
        break;
    }
  }

  /** M1 tap behaviour: show what is under the finger. Becomes select/command in M2. */
  private inspect(sx: number, sy: number): void {
    const w = this.camModel.screenToWorld(sx, sy);
    const map = this.sim.world.map;
    const tx = Math.floor(w.x / TILE_PX);
    const ty = Math.floor(w.y / TILE_PX);
    this.ring(w.x, w.y, 0xffffff);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;
    const feature = map.features.find((f) => {
      const s = featureSize(f.kind);
      return tx >= f.x && tx < f.x + s && ty >= f.y && ty < f.y + s;
    });
    const terrain = t(`terrain.${map.tiles[ty * map.width + tx]}` as TranslationKey);
    let text = t('hud.tapInfo', { x: tx, y: ty, terrain });
    if (feature) {
      text +=
        ' · ' +
        t(feature.kind === 'gold' ? 'feature.gold' : 'feature.berries', { amount: feature.amount });
    }
    this.ctx.hud.showInfo(text);
  }

  private tweenZoom(factor: number, sx: number, sy: number): void {
    const cam = this.camModel;
    let applied = 1;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 180,
      ease: 'Sine.easeOut',
      onUpdate: (tw) => {
        const target = Math.pow(factor, tw.getValue() ?? 0);
        cam.zoomAt(target / applied, sx, sy);
        applied = target;
      },
    });
  }

  /** Expanding ring feedback, pooled to avoid allocations on every tap. */
  private ring(x: number, y: number, tint: number): void {
    let img = this.rings.find((r) => !r.visible);
    if (!img) {
      img = this.add.image(0, 0, 'ring').setDepth(1e6);
      this.rings.push(img);
    }
    img.setPosition(x, y).setTint(tint).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.killTweensOf(img);
    const target = img;
    this.tweens.add({
      targets: target,
      scale: 0.9,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => target.setVisible(false),
    });
  }

  private applyCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(this.camModel.zoom);
    cam.centerOn(this.camModel.centerX, this.camModel.centerY);
  }

  override update(time: number): void {
    // Phaser's `delta` is smoothed and capped at the target frame time, which would slow the
    // match down on a struggling device. Game time must follow real time, so use the raw delta.
    const dt = this.game.loop.rawDelta;
    this.gestures.update(performance.now());
    this.camModel.update(dt);
    this.applyCamera();
    // Interpolation alpha is unused until entities move (M2).
    this.loop.advance(dt);

    if (time >= this.nextStatsAt && this.ctx.settings.showDebug) {
      this.nextStatsAt = time + 250;
      this.ctx.hud.setDebugStats({
        fps: this.game.loop.actualFps,
        tick: this.sim.world.tick,
        zoom: (this.camModel.zoom * TILE_PX) / this.ctx.renderScale,
        seed: this.sim.world.config.seed,
        camTileX: this.camModel.centerX / TILE_PX,
        camTileY: this.camModel.centerY / TILE_PX,
      });
    }
  }
}
