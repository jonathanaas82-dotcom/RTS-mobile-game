# Godforge

A mobile-first, touch-only **mythology real-time strategy** game: gather, build, advance through
four ages, choose your gods, summon mythic creatures and raze the enemy's base. Built with
**TypeScript + Phaser 3 + Vite**, delivered as an installable, offline-capable **PWA**, ready to
be wrapped with **Capacitor** for Android/iOS.

All names, factions and art are original. See [PLAN.md](PLAN.md) for milestones and design
decisions and [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organised.

> Status: **M1** — project setup, PWA, procedural map, touch camera, fixed-timestep simulation.

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

URL parameters for testing: `?seed=anyword&size=48` (map seed and size, 32–128).

## Playing on a phone

- **Dev:** `npm run dev`, then open `http://<your-computer-ip>:5173` on the phone (same Wi-Fi).
  Service workers need HTTPS (or localhost), so offline mode is only active in deployed builds.
- **Install:** open the deployed HTTPS URL → browser menu → _Add to Home Screen / Install app_.
  The game launches fullscreen in landscape and works offline after the first load.

Controls: one finger drag = pan, pinch = zoom, tap = inspect (select/command from M2), double tap =
quick zoom, long press = context ping. Mouse: drag + wheel.

## Deploying as a PWA

`npm run build` produces a static site in `dist/` with relative paths, so it can be hosted from
any folder on any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, S3…). Just upload
`dist/`. Each build gets a new cache name, so players get updates on the next launch.

## Native apps (Capacitor)

`capacitor.config.json` is already present (`webDir: dist`). When ready (M9):

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npm run build
npx cap add android   # and/or ios
npx cap sync
npx cap open android
```

## Renaming the game

Change `GAME_NAME` in `src/config/game.ts`, plus `name`/`short_name` in
`public/manifest.webmanifest`, `<title>`/`apple-mobile-web-app-title` in `index.html` and
`appName` in `capacitor.config.json`.

## Replacing placeholder art

All textures are listed in `src/render/assets/manifest.ts`. Replace a `generate` entry with
`url: 'assets/your-file.png'` (file in `public/assets/`). Keep the same key and dimensions; the
terrain tileset must follow the layout in `src/render/assets/tileset.ts`.

## Adding a faction or unit

Factions, units, buildings, gods and techs are data files in `src/data` (introduced in M2–M6;
this section will list the exact steps once those files exist). Balance values never live in code.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md).
