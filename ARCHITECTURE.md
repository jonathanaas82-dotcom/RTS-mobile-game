# Architecture

```
src/
  config/      Game name/version (rename the game here)
  data/        All balance & tuning values (pure data, no logic)
  sim/         Deterministic simulation — pure TS, no Phaser/DOM (lint-enforced)
    core/      Rng (mulberry32), FixedStepLoop
    map/       Terrain, value noise, procedural map generator
    path/      A* pathfinder + path smoothing
    systems/   orders, combat, powers/favor, production, economy, movement, fog, victory
    entity.ts  Flat entity shape (units, buildings, resources)
    player.ts  Player state, modifiers (cached), costs
    rules.ts   Shared rule queries (can train/place/research/advance/cast)
    grid.ts    Occupancy, passability, connected regions
    spatial.ts Zero-allocation spatial hash
    world.ts   World state, spawn/kill helpers, state hash
    commands.ts Command types (the only way to change the world)
    simulation.ts  Tick driver: controllers -> commands -> systems
  ai/          AIController (economy, build order, army, waves, powers) + placement
  game/        createMatch(): Simulation + AI controllers (no Phaser)
  render/      Phaser: scenes, camera, entity/effects/fog renderers, minimap, procedural art
  ui/          DOM HUD, command card, menus, tutorial, gestures, selection, settings, stats
  audio/       Procedural Web Audio sound effects (+ music hook)
  i18n/        t(key) + en/nb dictionaries
  platform/    PWA, fullscreen/orientation, haptics; native.ts = Capacitor detection + native haptics
build/         Vite plugins (service-worker precache)
android/, ios/ Capacitor native shells (generated, then configured: landscape, immersive, icons)
scripts/       Icon generation, Playwright mobile e2e
tests/         Vitest unit tests (sim, input, camera, i18n)
```

## Data flow

```
 touch ──► PointerInput ──► GestureRecognizer ──► WorldScene ──► CameraModel (pan/zoom)
                                                        │
                                                        └──► Simulation.enqueue(Command)   (M2+)
 AI (M7) ─────────────────────────────────────────────────► Simulation.enqueue(Command)

 requestAnimationFrame ─► WorldScene.update ─► FixedStepLoop.advance(rawDelta)
                                                  └─► Simulation.step() × N   (20 ticks/s)
                                                        ├─ apply due commands
                                                        └─ systems (movement, combat, …)
                         ─► render reads World, interpolates with alpha
                         ─► HUD updates throttled (~4 Hz)
```

## Key rules

- **Sim is the source of truth.** Rendering never mutates sim state; it reads it.
- **Determinism.** Only `world.rng` for randomness; no `Date`, `Math.random`, or transcendental
  math (`sin`, `cos`, `atan2`, `pow`, `exp`) inside `src/sim`. `hashWorld()` compares states.
- **Commands only.** Players/AI change the world exclusively through `Simulation.enqueue`. The
  history of applied commands + the match config replays a match.
- **Units.** Sim positions are in **tiles** (floats). The renderer multiplies by `TILE_PX` (64).
- **Data-driven.** Balance numbers live in `src/data`. Factions/units/gods are added as data.
- **Art behind a manifest.** `src/render/assets/manifest.ts` lists every texture; entries are
  procedurally generated now and can point to files later without code changes. The terrain
  tileset follows the layout contract in `src/render/assets/tileset.ts`.
- **Real time.** The sim is driven by Phaser's `rawDelta` (unsmoothed); Phaser's capped `delta`
  would slow the match on a struggling device.

## Entities and systems

All entities share one flat object shape (`src/sim/entity.ts`) with component-like field groups
(unit: order/path/carry/combat timers; building: footprint/queue/rally; resource: amount). A single
shape keeps V8 objects monomorphic and serialisation trivial. Systems run in a fixed order each
tick: `orderSystem` (unit behaviours: gather/build/attack/attack-move/auto-acquire) → `combat`
(cooldowns, projectiles, towers, regen) → `powerEffects` → `favor` → `production` → `path`
(budgeted A*) → `movement` (steering + separation via the spatial hash) → `fog` → `victory`.

## AI

`AIController` (src/ai) is a `Controller` attached by `createMatch`. It thinks every N ticks,
reads only fog-visible enemy information (plus the public enemy start position) and emits the
same Commands as the touch UI. Tuning lives in `src/data/ai.ts`. Its decision log is shown in the
debug overlay (Settings → Debug info).

## Performance

- Sim: ~1 ms/tick for a 200-unit battle (node); pathfinding is budgeted per tick, skipped for
  straight lines, backs off after unreachable goals, and units ignore enemies in other regions.
- Render: one atlas per match for all unit/building sprites (batched draws), off-screen culling,
  pooled sprites/projectiles/damage digits, bars and rings drawn into two Graphics objects, HUD
  refresh throttled to 5 Hz, minimap 4 Hz, fog texture re-uploaded only on fog ticks.
- The debug overlay shows per-section frame cost; `npm run e2e` measures it with 180+ units.

## Rendering & input

- Canvas renders at `devicePixelRatio` (capped by graphics quality) and is shown at CSS size via
  Phaser's scale zoom → crisp on phones.
- Phaser's own pointer input is disabled; DOM pointer events (with pointer capture) feed the
  engine-agnostic `GestureRecognizer`: tap, double tap, long press, pan (+fling), pinch.
- `CameraModel` holds camera math (pan, anchor-preserving zoom, clamping, inertia) and is unit
  tested; `WorldScene` copies it to the Phaser camera each frame.
- Terrain is a single Phaser tilemap layer (culled, one draw call per visible chunk); edge-masked
  water/cliff tiles draw shores and rims. Tiles are extruded by 1px to avoid seams when zooming.

## PWA

`build/pwa-plugin.ts` emits `sw.js` with a precache of all built files and `public/`. Cache
name = content hash, so each deploy replaces the cache. Cache-first fetch; navigations fall back
to the cached shell offline. The SW is only registered in production builds.

## Native (Capacitor)

The same `dist/` build runs in the browser, as an installed PWA and inside the Capacitor shells.
`src/platform/native.ts` detects the native shell: the service worker and the fullscreen button are
skipped there (the app is bundled and always fullscreen) and haptics use `@capacitor/haptics`.
Orientation lock, immersive mode and notch handling are configured in the native projects
(`AndroidManifest.xml`, `styles.xml`, `MainActivity.java`, `Info.plist`).
