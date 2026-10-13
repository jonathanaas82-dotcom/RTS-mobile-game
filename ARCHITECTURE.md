# Architecture

```
src/
  config/      Game name/version (rename the game here)
  data/        All balance & tuning values (pure data, no logic)
  sim/         Deterministic simulation — pure TS, no Phaser/DOM (lint-enforced)
    core/      Rng (mulberry32), FixedStepLoop
    map/       Terrain, value noise, procedural map generator
    world.ts   World state + state hash
    commands.ts Command types (the only way to change the world)
    simulation.ts  Tick driver: applies commands, runs systems in order
  ai/          (M7) AI players — issue Commands like a human; no Phaser/DOM
  render/      Phaser: scenes, camera, procedural placeholder art, asset manifest
  ui/          DOM HUD/menus, gesture recognizer, settings
  i18n/        t(key) + en/nb dictionaries
  platform/    PWA, fullscreen/orientation, haptics
build/         Vite plugins (service-worker precache)
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
