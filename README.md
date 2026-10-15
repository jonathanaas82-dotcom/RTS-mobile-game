# Godforge

A mobile-first, touch-only **mythology real-time strategy** game: gather, build, advance through
four ages, choose your gods, summon mythic creatures and raze the enemy's base. Built with
**TypeScript + Phaser 3 + Vite**, delivered as an installable, offline-capable **PWA**, ready to
be wrapped with **Capacitor** for Android/iOS.

All names, factions and art are original. See [PLAN.md](PLAN.md) for milestones and design
decisions and [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organised.

> Status: **M1–M9 complete** — full single-player game (menus, tutorial, three factions, four ages, heroes, mythic units, god powers, AI Easy/Normal/Hard, Norwegian and English) as an offline PWA, plus configured Android/iOS Capacitor projects. See [STORE_CHECKLIST.md](STORE_CHECKLIST.md) for what's left before store release.

## Requirements

Node 20+ (22 recommended) and npm.

## Scripts

| Command           | What it does                                                               |
| ----------------- | -------------------------------------------------------------------------- |
| `npm install`     | Install dependencies                                                       |
| `npm run dev`     | Dev server on your LAN (`--host`) — open the printed URL on your phone     |
| `npm run build`   | Type-check and build to `dist/` (includes the service worker)              |
| `npm run preview` | Serve the production build locally                                         |
| `npm test`        | Unit tests (Vitest)                                                        |
| `npm run lint`    | ESLint + Prettier check (`npm run format` fixes formatting)                |
| `npm run e2e`     | Phone-viewport touch test of the build with Playwright (run `build` first) |
| `npm run icons`   | Regenerate PWA PNG icons from `public/icons/icon.svg`                      |

URL parameters for testing (skip the menus): `?play=1&seed=anyword&size=48&faction=aurelian&god=thalassine&ai=hard`,
or `?tutorial=1`. Without parameters the game opens on the main menu.

## Playing on a phone

- **Dev:** `npm run dev`, then open `http://<your-computer-ip>:5173` on the phone (same Wi-Fi).
  Service workers need HTTPS (or localhost), so offline mode is only active in deployed builds.
- **Install:** open the deployed HTTPS URL → browser menu → _Add to Home Screen / Install app_.
  The game launches fullscreen in landscape and works offline after the first load.

### Touch controls

| Gesture                         | Action                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| One-finger drag                 | Pan the camera (with momentum)                                 |
| Pinch                           | Zoom                                                           |
| Tap own unit/building           | Select it                                                      |
| Tap ground / enemy / resource   | Move / attack / gather with the selection                      |
| Tap a fishing spot (ripples)    | Workers fish from the shore (food)                             |
| Tap own unfinished building     | Selected workers help build or repair                          |
| Tap ground with a building sel. | Set its rally point (rally on a resource = new workers gather) |
| Double-tap a unit               | Select all units of that type on screen                        |
| Long-press then drag            | Box selection (or use the box button on the left)              |
| Left buttons                    | Box-select mode · select idle workers · select whole army      |
| Groups 1–5                      | Tap = select (tap again = jump to it), hold = assign           |
| Hold any command button         | Show what it does / cancel one queued unit                     |
| Minimap                         | Tap or drag to move the camera; red ping = attack, ⚠ = jump    |

Mouse works too (drag, click, wheel to zoom).

## Deploying as a PWA

**GitHub Pages (automatic):** `.github/workflows/pages.yml` builds and publishes the game on
every push. One-time setup: repo **Settings → Pages → Source: GitHub Actions** (Pages on a private
repo needs a paid GitHub plan; otherwise make the repo public). The game is then served at
`https://<user>.github.io/RTS-mobile-game/`.

`npm run build` produces a static site in `dist/` with relative paths, so it can be hosted from
any folder on any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, S3…). Just upload
`dist/`. Each build gets a new cache name, so players get updates on the next launch.

## Saving

Settings and statistics are stored locally (`localStorage`). Saving a match in progress is not
implemented yet (the deterministic command log makes it possible later; see ARCHITECTURE.md).

## Native apps (Capacitor)

The Android (`android/`) and iOS (`ios/`, Swift Package Manager) projects are generated and
configured: landscape only, fullscreen/immersive, notch-aware, native haptics, generated icons and
splash screens. The web build is copied into them with `cap sync`.

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run cap:sync`      | Build the web app and copy it into both native projects        |
| `npm run cap:android`   | Sync, then open Android Studio (build/run/sign there)          |
| `npm run cap:ios`       | Sync, then open Xcode (macOS only)                             |
| `npm run native:assets` | Regenerate launcher icons and splash screens from the SVG icon |

Requirements: Android Studio with SDK 35+ (JDK 21) for Android; Xcode 16+ on macOS for iOS. See
[STORE_CHECKLIST.md](STORE_CHECKLIST.md) for signing, store listings and the remaining manual steps.

## Renaming the game

Change `GAME_NAME` in `src/config/game.ts`, plus `name`/`short_name` in
`public/manifest.webmanifest`, `<title>`/`apple-mobile-web-app-title` in `index.html` and
`appName` in `capacitor.config.json`.

## Replacing placeholder art

All textures are listed in `src/render/assets/manifest.ts`. Replace a `generate` entry with
`url: 'assets/your-file.png'` (file in `public/assets/`). Keep the same key and dimensions.
Unit/building art is drawn at `ART_RES`× resolution (`src/render/assets/procedural/draw.ts`) and
displayed at `1/ART_RES` scale, so replacement sprites should be authored at that density.
Terrain is painted per pixel into chunk textures (`src/render/terrain/ground.ts`) and forests are
individual tree sprites (`src/render/terrain/trees.ts`).

Preview all procedural art with `npm run build && node scripts/art-sheet.mjs` (contact sheets in
`e2e-output/`) and capture staged gameplay screenshots with `node scripts/shots.mjs`.

## Adding a faction or unit

Everything is data in `src/data`; the simulation, UI and AI pick new entries up automatically.

**A unit:** add a `UnitDef` to `src/data/units.ts` (stats, cost, `trainedAt` building, `age`,
procedural `art` description; mythic units also need `god`). Add its name in both languages.
Optional `traits` (see `src/data/traits.ts`: braced spears, shield wall, frenzy, charge, cleave,
phalanx, piercing, demolisher, regeneration, inspire, harrier, scout) and a one-line `role` show
up in the in-game Codex and selection panel. Humanoid art takes `helm`, `armor`, `shield`, `cape`
and riders a `mount`.

**A god:** add a `GodDef` to `src/data/gods.ts` (bonuses as `Modifier`s, a `power` id from
`src/data/powers.ts`, optional `mythic` unit / `tech`), then list it in its faction's
`majorGods` or `minorGods[age]`.

**A god power:** add a `PowerDef` to `src/data/powers.ts` using one of the existing kinds
(`strike`, `dot`, `heal`, `freeze`, `slow`, `summon`, `boost`, `reveal`).

**A faction:** add the id to `FactionId` in `src/data/types.ts`, a `FactionDef` to
`src/data/factions.ts` (style colours, favor mode, bonuses, worker id, gods), a full roster
(worker, infantry, ranged, cavalry, siege, hero, four mythic units) and its gods. Add an army mix
in `src/data/ai.ts`. `npm test` validates every cross-reference (`tests/data.test.ts`).

Balance numbers (gather rates, costs, counters in `src/data/counters.ts`, AI tuning in
`src/data/ai.ts`) never live in code. Use `npm run balance` to see how changes play out.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md).
