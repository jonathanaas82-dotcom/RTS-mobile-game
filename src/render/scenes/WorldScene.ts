import Phaser from 'phaser';
import { buildingDef, factionDef, godDef, loc, powerDef, techDef } from '../../data';
import { AGES } from '../../data/factions';
import { SIM, TICK_MS } from '../../data/balance/sim';
import { getLanguage, t, type TranslationKey } from '../../i18n';
import { haptic } from '../../platform/pwa';
import type { Command } from '../../sim/commands';
import { FixedStepLoop } from '../../sim/core/loop';
import type { Entity } from '../../sim/entity';
import type { Simulation } from '../../sim/simulation';
import { createMatch } from '../../game/match';
import { Tutorial } from '../../ui/tutorial';
import { spawnUnit } from '../../sim/world';
import type { AIController } from '../../ai/AIController';
import { canAdvance, nextAge } from '../../sim/rules';
import type { SimEvent, World } from '../../sim/world';
import { CommandCard, costText, denialText, powerIcon } from '../../ui/commandCard';
import { GestureRecognizer, type GestureEvent } from '../../ui/input/gestures';
import { MatchArt } from '../assets/matchArt';
import { BUILDING_OVERHANG } from '../assets/procedural/buildings';
import { TILE_PX } from '../assets/tileset';
import { ART_RES } from '../assets/procedural/draw';
import { GROUND_PAD, GROUND_PX, WAVE_PX, paintGround, type GroundChunk } from '../terrain/ground';
import { TreeLayer } from '../terrain/trees';
import { Ambience } from '../effects/Ambience';
import { CameraModel } from '../camera/CameraModel';
import { CONTEXT_KEY, type AppContext, type MatchStartData } from '../context';
import { EntityRenderer } from '../entities/EntityRenderer';
import { InputController, type InputHost } from '../input/InputController';
import { PointerInput } from '../input/PointerInput';
import { EffectsRenderer } from '../effects/EffectsRenderer';
import { FogRenderer } from '../effects/FogRenderer';
import { Minimap } from '../Minimap';
import type { SoundName } from '../../audio/Sfx';
import type { WorkAct } from '../assets/procedural/units';

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
  ais: AIController[] = [];
  private loop!: FixedStepLoop;
  camModel!: CameraModel;
  private gestures!: GestureRecognizer;
  private pointer!: PointerInput;
  private art!: MatchArt;
  private trees!: TreeLayer;
  private ambience!: Ambience;
  private entities!: EntityRenderer;
  input2!: InputController;
  private card!: CommandCard;
  private rings: Phaser.GameObjects.Image[] = [];
  private ghostImg: Phaser.GameObjects.Image | null = null;
  private nextStatsAt = 0;
  private nextHudAt = 0;
  private alpha = 0;
  private alertPos: { x: number; y: number } | null = null;
  private fogR!: FogRenderer;
  private fx!: EffectsRenderer;
  private minimap!: Minimap;
  private groundChunks: GroundChunk[] = [];
  /** Animated water layers (two per watery chunk). */
  private waves: Array<{
    img: Phaser.GameObjects.Image;
    x: number;
    y: number;
    k: number;
    phase: number;
  }> = [];
  /** Scene time of the last fight the player could see (drives the battle music). */
  private lastCombat = -1e9;
  private nextMinimapAt = 0;
  private gameOverShown = false;
  /** Accumulated per-section frame time (ms) for the debug overlay / perf tests. */
  readonly prof = { sim: 0, events: 0, fx: 0, mini: 0, ents: 0, hud: 0, n: 0 };
  private tutorial: Tutorial | null = null;
  private nextTutorialAt = 0;

  constructor() {
    super('World');
  }

  create(data: MatchStartData): void {
    this.ctx = this.registry.get(CONTEXT_KEY) as AppContext;
    const m = createMatch(data.config);
    this.sim = m.sim;
    this.ais = m.ais;
    this.gameOverShown = false;
    this.loop = new FixedStepLoop({
      stepMs: TICK_MS,
      maxStepsPerFrame: SIM.maxStepsPerFrame,
      onStep: () => this.sim.step(),
    });
    this.art = new MatchArt(this.textures, data.config.players);
    this.buildTerrain();
    this.entities = new EntityRenderer(this, this.art);
    this.fx = new EffectsRenderer(this, this.art);
    this.entities.onWorkImpact = (act, x, y, facing) => {
      this.fx.workImpact(act, x, y, facing);
      const a = this.audioAt(x / TILE_PX, y / TILE_PX);
      this.ctx.sfx.play(WORK_SOUND[act], a.gain * 0.8, a.pan);
    };
    this.entities.onSplash = (x, y) => {
      this.fx.splash(x, y);
      const a = this.audioAt(x / TILE_PX, y / TILE_PX);
      this.ctx.sfx.play('splash', a.gain * 0.6, a.pan);
    };
    this.entities.onSmoke = (x, y) => this.fx.smoke(x, y);
    this.fx.particles = this.ctx.settings.graphics !== 'low';
    this.fogR = new FogRenderer(this, this.world);
    this.ambience = new Ambience(this, this.world, this.ctx.settings.graphics);
    this.minimap = new Minimap(
      this.ctx.hud.minimapSlot,
      this.world,
      (x, y) => this.centerOnTile(x, y),
      this.groundChunks.map((ch) => ({ ...ch, pad: GROUND_PAD })),
    );
    this.setupCamera();
    this.setupInput();
    this.exposeControls();
    this.ctx.hud.show(true);
    this.ctx.hud.showModal(null);
    this.ctx.hud.showBanner(null);
    this.ctx.hud.onPauseChange(false);
    this.ctx.hud.onSpeedChange(1);
    this.refreshHud(true);
    this.tutorial = data.tutorial ? this.createTutorial() : null;
    this.ctx.sfx.music('peace');
    this.ctx.sfx.ambience(true);
    this.lastCombat = -1e9;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ctx.sfx.ambience(false);
      this.pointer.destroy();
      this.tutorial?.destroy();
      this.tutorial = null;
      this.ctx.match = null;
    });
  }

  get world(): World {
    return this.sim.world;
  }

  /** Paint the ground into chunk textures and plant the forests. */
  private buildTerrain(): void {
    const map = this.world.map;
    for (let i = 0; this.textures.exists(`ground_${i}`); i++) this.textures.remove(`ground_${i}`);
    this.groundChunks = paintGround(map);
    this.waves = [];
    this.groundChunks.forEach((ch, i) => {
      ch.waves?.forEach((wl, k) => {
        const wk = `waves_${i}_${k}`;
        if (this.textures.exists(wk)) this.textures.remove(wk);
        this.textures.addCanvas(wk, wl.canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
        const img = this.add
          .image(wl.x * TILE_PX, wl.y * TILE_PX, wk)
          .setOrigin(0, 0)
          .setScale(TILE_PX / WAVE_PX)
          .setDepth(-1.6)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0);
        this.waves.push({ img, x: img.x, y: img.y, k, phase: i * 1.7 });
      });
      const key = `ground_${i}`;
      this.textures.addCanvas(key, ch.canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
      const k = TILE_PX / GROUND_PX;
      this.add
        .image(ch.tx * TILE_PX - GROUND_PAD * k, ch.ty * TILE_PX - GROUND_PAD * k, key)
        .setOrigin(0, 0)
        .setCrop(
          GROUND_PAD,
          GROUND_PAD,
          ch.canvas.width - 2 * GROUND_PAD,
          ch.canvas.height - 2 * GROUND_PAD,
        )
        .setScale(k)
        .setDepth(-2);
    });
    this.trees = new TreeLayer(this, map);
    this.trees.sway = this.ctx.settings.graphics !== 'low';
  }

  /** A forest tile was cut down: fell its trees. */
  private refreshTile(i: number): void {
    this.trees.removeTile(i);
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
    this.applyPostFX();
  }

  /**
   * Screen-space polish (WebGL only): a warm, slightly richer colour grade on Medium/High and,
   * on High, a soft vignette.
   */
  private applyPostFX(): void {
    const cam = this.cameras.main;
    const q = this.ctx.settings.graphics;
    if (this.renderer.type !== Phaser.WEBGL || !cam.postFX || q === 'low') return;
    cam.postFX.clear();
    const grade = cam.postFX.addColorMatrix();
    grade.saturate(0.06);
    grade.contrast(0.08, true);
    // Warm the midtones slightly (sunny afternoon) without tinting the shadows.
    grade.multiply([1.04, 0, 0, 0, 0, 0, 1.01, 0, 0, 0, 0, 0, 0.95, 0, 0, 0, 0, 0, 1, 0], true);
    // A soft vignette frames the battlefield and draws the eye to the centre.
    if (q === 'high') cam.postFX.addVignette(0.5, 0.5, 0.92, 0.18);
  }

  /** Drift and cross-fade the two ripple layers of each watery chunk (only when on screen). */
  private animateWater(time: number): void {
    if (this.ctx.settings.graphics === 'low') return;
    const view = this.cameras.main.worldView;
    for (const w of this.waves) {
      const vis =
        w.x < view.right &&
        w.x + w.img.displayWidth > view.x &&
        w.y < view.bottom &&
        w.y + w.img.displayHeight > view.y;
      w.img.setVisible(vis);
      if (!vis) continue;
      const t = time * 0.0009 + w.phase;
      const s = Math.sin(t + w.k * Math.PI);
      w.img.setAlpha(0.12 + 0.24 * (0.5 + 0.5 * s));
      w.img.setPosition(w.x + Math.sin(t * 0.7 + w.k) * 5, w.y + Math.cos(t * 0.5 + w.k) * 3);
    }
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
      explored: (tx, ty) => (this.world.fog[ME]?.[ty * this.world.map.width + tx] ?? 0) > 0,
      marker: (x, y, kind) =>
        this.ring(
          x * TILE_PX,
          y * TILE_PX,
          { move: 0x7cf29c, attack: 0xff5a5a, gather: 0xffd166, build: 0xf0cf72 }[kind],
        ),
      ghost: (def, tx, ty, ok) => this.ghost(def, tx ?? 0, ty ?? 0, ok ?? false),
      sound: (name) => this.ctx.sfx.play(name),
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

  /**
   * Advance the simulation instantly by `ticks` (dev/test helper used for staged screenshots and
   * e2e checks). Visual events in between are skipped; trees are re-synced with the map.
   */
  fastForward(ticks: number): void {
    for (let i = 0; i < ticks && this.world.winner < 0; i++) this.sim.step();
    this.sim.drainEvents();
    this.trees.sync();
    this.minimap.markDirty();
  }

  /** Fog state of the tile under a point for the local player (0 unexplored, 1 explored, 2 visible). */
  fogAt(x: number, y: number): number {
    const w = this.world.map.width;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= w || ty >= this.world.map.height) return 0;
    return this.world.fog[ME]?.[ty * w + tx] ?? 2;
  }

  /** Own things are always visible; enemy units need vision; buildings/resources once explored. */
  isVisible(e: Entity): boolean {
    if (e.owner === ME) return true;
    const f = this.fogAt(e.x, e.y);
    return e.kind === 'unit' ? f === 2 : f > 0;
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
        .setScale(1 / ART_RES)
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
          body:
            loc(d.desc, lang) +
            `\n${t('age.power')}: ${loc(powerDef(d.power).name, lang)}` +
            (chk.ok ? '' : `\n${denialText(chk)}`),
          icon: d.mythic
            ? this.art.icon(`u:${d.mythic}:${ME}`)
            : powerIcon(powerDef(d.power).kind, powerDef(d.power).color),
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
      openMenu: () => this.openPauseMenu(),
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

  /** Average ms per frame per section since the last call (then resets). */
  profText(): string {
    const p = this.prof;
    const n = Math.max(1, p.n);
    const f = (v: number): string => (v / n).toFixed(1);
    const txt = `ms/frame sim ${f(p.sim)} ev ${f(p.events)} fx ${f(p.fx)} map ${f(p.mini)} ents ${f(p.ents)} hud ${f(p.hud)}`;
    p.sim = p.events = p.fx = p.mini = p.ents = p.hud = p.n = 0;
    return txt;
  }

  private nextAreaMotes = 0;

  /** Lingering god-power areas shed particles (healing motes, embers, snowflakes). */
  private areaMotes(time: number): void {
    if (time < this.nextAreaMotes) return;
    this.nextAreaMotes = time + 160;
    for (const e of this.world.effects) {
      if (e.until <= this.world.tick || e.kind === 'reveal' || this.fogAt(e.x, e.y) !== 2) continue;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * e.radius;
      const color =
        e.kind === 'heal'
          ? 0x9cff9c
          : e.kind === 'freeze'
            ? 0xe6f4ff
            : e.kind === 'slow'
              ? 0xd8c385
              : parseInt(powerDef(e.power).color.slice(1), 16);
      this.fx.motes((e.x + Math.cos(a) * r) * TILE_PX, (e.y + Math.sin(a) * r) * TILE_PX, color, 3);
    }
  }

  /**
   * Loudness and stereo position of a sound at tile (x, y): fades with distance from the screen
   * centre and when zoomed far out, panned left/right by its horizontal offset.
   */
  private audioAt(x: number, y: number): { gain: number; pan: number } {
    const v = this.cameras.main.worldView;
    const dx = (x * TILE_PX - v.centerX) / (v.width / 2);
    const dy = (y * TILE_PX - v.centerY) / (v.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const zoomF = Math.max(0.25, Math.min(1, 1100 / v.width));
    return {
      gain: Math.max(0, Math.min(1, 1.35 - dist * 0.75)) * zoomF,
      pan: Math.max(-0.8, Math.min(0.8, dx * 0.7)),
    };
  }

  /** A visible fight: switch to (or stay on) the battle music. */
  private combatSeen(): void {
    this.lastCombat = this.time.now;
    if (this.world.winner < 0 && this.ctx.sfx.track !== 'battle') this.ctx.sfx.music('battle');
  }

  /** Map sim events to sound effects (only for things the player can perceive). */
  private soundFor(ev: SimEvent): void {
    const sfx = this.ctx.sfx;
    const onScreen = (x: number, y: number): boolean =>
      this.fogAt(x, y) === 2 && this.cameras.main.worldView.contains(x * TILE_PX, y * TILE_PX);
    const at = (name: SoundName, x: number, y: number, gain: number): void => {
      const a = this.audioAt(x, y);
      sfx.play(name, gain * a.gain, a.pan);
    };
    switch (ev.type) {
      case 'hit':
        if (this.fogAt(ev.x, ev.y) === 2) this.combatSeen();
        if (onScreen(ev.x, ev.y)) at('hit', ev.x, ev.y, 0.7);
        break;
      case 'attack':
        if (ev.ranged) {
          const e = this.world.byId.get(ev.id);
          if (e && onScreen(e.x, e.y)) at('arrow', e.x, e.y, 0.7);
        }
        break;
      case 'death':
        if (ev.kind !== 'resource' && onScreen(ev.x, ev.y))
          at('death', ev.x, ev.y, ev.kind === 'building' ? 1 : 0.7);
        break;
      case 'charge':
        if (onScreen(ev.x, ev.y)) {
          at('charge', ev.x, ev.y, 0.9);
          this.fx.dustAt(ev.x * TILE_PX, ev.y * TILE_PX, 10);
        }
        break;
      case 'treeCut': {
        const w = this.world.map.width;
        const tx = (ev.tile % w) + 0.5;
        const ty = Math.floor(ev.tile / w) + 0.5;
        if (onScreen(tx, ty)) at('treeFall', tx, ty, 0.8);
        break;
      }
      case 'gathered': {
        const e = this.world.byId.get(ev.id);
        if (ev.owner === ME && e && onScreen(e.x, e.y)) at('gather', e.x, e.y, 0.8);
        break;
      }
      case 'built':
        if (ev.owner === ME) sfx.play('built');
        break;
      case 'trained':
        if (ev.owner === ME) sfx.play('trained', 0.7);
        break;
      case 'ageUp':
        if (ev.owner === ME) sfx.play('ageUp');
        break;
      case 'power':
        if (ev.owner === ME || this.fogAt(ev.x, ev.y) === 2) sfx.play('power');
        break;
      case 'underAttack':
        if (ev.owner === ME) {
          sfx.play('alert');
          this.combatSeen();
        }
        break;
      case 'error':
        if (ev.owner === ME) sfx.play('error');
        break;
      case 'gameOver':
        sfx.play(ev.winner === ME ? 'victory' : 'defeat');
        sfx.music(ev.winner === ME ? 'victory' : null);
        break;
      default:
        break;
    }
  }

  private resume(): void {
    this.ctx.hud.showModal(null);
    this.loop.paused = false;
    this.ctx.hud.onPauseChange(false);
  }

  private openPauseMenu(): void {
    this.loop.paused = true;
    this.ctx.hud.onPauseChange(true);
    this.ctx.hud.showModal({
      title: t('hud.paused'),
      body: this.pantheonText(),
      actions: [
        { label: t('hud.resume'), primary: true, onPress: () => this.resume() },
        {
          label: t('pause.settings'),
          onPress: () => {
            this.ctx.hud.showModal(null);
            this.ctx.openSettings?.(() => this.openPauseMenu());
          },
        },
        {
          label: t('pause.surrender'),
          onPress: () =>
            this.ctx.hud.showModal({
              title: t('pause.confirmSurrender'),
              actions: [
                {
                  label: t('pause.yes'),
                  primary: true,
                  onPress: () => {
                    this.ctx.hud.showModal(null);
                    this.loop.paused = false;
                    this.issue({ type: 'resign', player: ME });
                  },
                },
                { label: t('pause.no'), onPress: () => this.openPauseMenu() },
              ],
            }),
        },
        { label: t('pause.quit'), onPress: () => this.ctx.toMenu?.() },
      ],
    });
  }

  private createTutorial(): Tutorial {
    return new Tutorial(
      {
        world: () => this.world,
        me: ME,
        selected: () => this.input2.selection.entities(this.world),
        spawnEnemies: (n) => {
          const w = this.world;
          const hall = w.entities.find((e) => e.owner === ME && e.def === 'town_hall');
          const enemy = w.config.players[1]!;
          const worker = factionDef(enemy.faction).worker;
          const cx = (hall?.x ?? w.map.width / 2) + 7;
          const cy = (hall?.y ?? w.map.height / 2) + 5;
          const ids: number[] = [];
          for (let i = 0; i < n; i++) {
            const u = spawnUnit(w, 1, worker, cx + i * 0.7, cy);
            u.order = {
              type: 'attackMove',
              x: hall?.x ?? cx,
              y: hall?.y ?? cy,
              target: -1,
              tile: -1,
            };
            u.needsPath = false;
            ids.push(u.id);
          }
          this.centerOnTile(cx - 2, cy - 1);
          return ids;
        },
        grant: (res) => {
          const p = this.world.players[ME]!;
          for (const k of Object.keys(res) as Array<'food' | 'wood' | 'gold'>)
            p.res[k] += res[k] ?? 0;
        },
        finish: (toMenu) => {
          this.tutorial = null;
          if (toMenu) this.ctx.toMenu?.();
        },
      },
      document.getElementById('hud') as HTMLElement,
    );
  }

  /** Summary of the local player's faction, gods and powers (pause menu). */
  private pantheonText(): string {
    const p = this.world.players[ME]!;
    const lang = getLanguage();
    const f = factionDef(p.faction);
    const major = godDef(p.majorGod);
    const lines = [
      `${loc(f.name, lang)} · ${loc(AGES[p.age]!.name, lang)}`,
      `${t('pantheon.major')}: ${loc(major.name, lang)} ${loc(major.title, lang)} — ${loc(major.desc, lang)}`,
      ...p.gods.map((g) => {
        const d = godDef(g);
        return `${loc(AGES[d.age]!.name, lang)}: ${loc(d.name, lang)} — ${loc(d.desc, lang)}`;
      }),
      `${t('pantheon.favor')}: ${loc(f.favorDesc, lang)}`,
    ];
    return lines.join('\n');
  }

  private showGameOver(winner: number): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    const p = this.world.players[ME]!;
    const won = winner === ME;
    const secs = Math.floor(this.world.tick / SIM.ticksPerSecond);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const s = p.stats;
    this.ctx.onMatchEnd?.(won, this.world);
    this.time.delayedCall(won ? 600 : 1200, () => {
      this.loop.paused = true;
      this.ctx.hud.showModal({
        title: won ? t('end.victory') : t('end.defeat'),
        body: t('end.stats', {
          time,
          trained: s.unitsTrained,
          killed: s.unitsKilled,
          lost: s.unitsLost,
          built: s.buildingsBuilt,
          gathered: Math.floor(s.gathered),
        }),
        actions: [
          { label: t('end.again'), primary: true, onPress: () => this.ctx.restart?.() },
          { label: t('end.menu'), onPress: () => this.ctx.toMenu?.() },
        ],
      });
    });
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
      if (e.dead || e.owner !== ME || e.kind !== 'unit' || e.inside >= 0) continue;
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
    const pr = this.prof;
    let tp = performance.now();
    const lap = (k: keyof typeof pr): void => {
      const now = performance.now();
      pr[k] += now - tp;
      tp = now;
    };
    this.alpha = this.loop.advance(dt);
    lap('sim');
    for (const ev of this.sim.drainEvents()) {
      this.fx.onEvent(
        ev,
        ME,
        (x, y) => this.fogAt(x, y) === 2,
        (x, y) => this.cameras.main.worldView.contains(x * TILE_PX, y * TILE_PX),
      );
      this.soundFor(ev);
      if (ev.type === 'treeCut') {
        this.refreshTile(ev.tile);
        this.minimap.markDirty();
      } else if (ev.type === 'ability' && this.fogAt(ev.x, ev.y) === 2) {
        this.fx.burst(
          ev.x * TILE_PX,
          ev.y * TILE_PX,
          3,
          ev.kind === 'thunderclap' ? 0xcfe8ff : 0xfff3b0,
          500,
        );
      } else if (ev.type === 'ageUp' && ev.owner === ME) {
        const lang = getLanguage();
        const g = godDef(ev.god);
        this.ctx.hud.announce(
          loc(AGES[ev.age]!.name, lang),
          `${loc(g.name, lang)} ${loc(g.title, lang)}`,
        );
        if (this.ctx.settings.haptics) haptic([30, 50, 60]);
      } else if (ev.type === 'ageUp' && ev.owner !== ME) {
        this.ctx.hud.showInfo(t('ev.enemyAge', { age: loc(AGES[ev.age]!.name, getLanguage()) }));
      } else if (ev.type === 'power') {
        const d = powerDef(ev.power);
        const color = parseInt(d.color.slice(1), 16);
        const lang = getLanguage();
        if (ev.owner === ME || this.fogAt(ev.x, ev.y) === 2) {
          if (d.kind === 'strike') {
            this.fx.bolt(ev.x * TILE_PX, ev.y * TILE_PX, color);
            this.cameras.main.shake(ev.owner === ME ? 260 : 140, ev.owner === ME ? 0.006 : 0.003);
            if (ev.owner === ME) this.cameras.main.flash(90, 200, 200, 180, false);
            this.fx.dustAt(ev.x * TILE_PX, ev.y * TILE_PX, 20);
          }
          this.fx.motes(ev.x * TILE_PX, ev.y * TILE_PX, color, 30);
          this.fx.burst(
            ev.x * TILE_PX,
            ev.y * TILE_PX,
            Math.max(2, d.radius),
            color,
            d.kind === 'strike' ? 600 : 900,
          );
          if (ev.owner !== ME)
            this.ctx.hud.showInfo(t('ev.enemyPower', { name: loc(d.name, lang) }));
          else if (d.kind === 'boost')
            this.ctx.hud.showInfo(t('ev.boost', { name: loc(d.name, lang) }));
          if (this.ctx.settings.haptics) haptic(d.kind === 'strike' ? [20, 30, 60] : 25);
        }
      } else if (ev.type === 'gameOver') {
        this.showGameOver(ev.winner);
      } else if (ev.type === 'error' && ev.owner === ME) {
        this.ctx.hud.showInfo(t(`err.${ev.code}` as TranslationKey));
      } else if (ev.type === 'built' && this.world.byId.get(ev.id)) {
        const b = this.world.byId.get(ev.id)!;
        if (this.fogAt(b.x, b.y) === 2) {
          this.fx.dustAt(b.x * TILE_PX, (b.y + b.size / 2) * TILE_PX, 18);
          this.fx.motes(b.x * TILE_PX, b.y * TILE_PX, 0xffd84a, 16);
        }
        if (ev.owner === ME)
          this.ctx.hud.showInfo(
            t('ev.built', { name: loc(buildingDef(ev.def).name, getLanguage()) }),
          );
      } else if (
        ev.type === 'trained' &&
        this.world.byId.get(ev.id) &&
        this.fogAt(this.world.byId.get(ev.id)!.x, this.world.byId.get(ev.id)!.y) === 2
      ) {
        const u = this.world.byId.get(ev.id)!;
        this.fx.motes(u.x * TILE_PX, u.y * TILE_PX, 0xfff3b0, 8);
      } else if (ev.type === 'built' && ev.owner === ME) {
        this.ctx.hud.showInfo(
          t('ev.built', { name: loc(buildingDef(ev.def).name, getLanguage()) }),
        );
      } else if (ev.type === 'researched' && ev.owner === ME) {
        this.ctx.hud.showInfo(
          t('ev.researched', { name: loc(techDef(ev.tech).name, getLanguage()) }),
        );
      } else if (ev.type === 'underAttack' && ev.owner === ME) {
        this.alertPos = { x: ev.x, y: ev.y };
        this.ctx.hud.alert();
        this.minimap.flash(ev.x, ev.y, this.time.now);
        if (this.ctx.settings.haptics) haptic([40, 60, 40]);
      }
    }
    lap('events');
    this.input2.update();
    if (this.tutorial && time >= this.nextTutorialAt) {
      this.nextTutorialAt = time + 400;
      this.tutorial.update();
    }
    this.fogR.update(this.world, ME);
    const vis = (x: number, y: number): boolean => this.fogAt(x, y) === 2;
    this.fx.update(this.world, this.alpha, vis);
    this.fx.drawAreas(this.world, vis, (power) => parseInt(powerDef(power).color.slice(1), 16));
    lap('fx');
    // Back to the peaceful music once no fighting has been seen for a while.
    if (this.ctx.sfx.track === 'battle' && this.world.winner < 0 && time - this.lastCombat > 20000)
      this.ctx.sfx.music('peace');
    if (time >= this.nextMinimapAt) {
      this.nextMinimapAt = time + 250;
      const v = this.cameras.main.worldView;
      this.minimap.draw(
        this.world,
        ME,
        { x: v.x / TILE_PX, y: v.y / TILE_PX, w: v.width / TILE_PX, h: v.height / TILE_PX },
        time,
      );
    }
    lap('mini');
    this.trees.update(this.cameras.main.worldView, time);
    this.animateWater(time);
    this.ambience.update(dt, this.cameras.main.worldView, this.world.map);
    this.areaMotes(time);
    this.entities.update(
      this.world,
      this.alpha,
      time,
      this.input2.selection.ids,
      (e) => this.isVisible(e),
      this.cameras.main.worldView,
    );
    lap('ents');
    this.refreshHud();
    lap('hud');
    pr.n++;

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
        extra: [this.profText(), ...this.ais.map((a) => a.debugText())].join('\n'),
      });
    }
  }
}

/** Sound for each worker activity's tool strike. */
const WORK_SOUND: Record<WorkAct, SoundName> = {
  chop: 'chop',
  mine: 'mine',
  build: 'hammer',
  farm: 'hoe',
  pick: 'pick',
  fish: 'plop',
};
