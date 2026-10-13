# Godforge — development plan

Working title **Godforge** (change it in `src/config/game.ts` and `public/manifest.webmanifest`).

A mobile-first, landscape, touch-only mythology RTS. All names, factions, units and lore below are
original; real-world mythology is used only as loose public-domain inspiration.

## Milestones

| #   | Scope                                                                                                                                                                                                                                             | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M1  | Project setup (Vite, TS strict, ESLint/Prettier, Vitest), PWA (manifest, offline SW, landscape, no browser gestures), Phaser scene, procedural tile map, touch camera (pan / pinch / inertia), fixed-timestep sim loop, asset manifest, HUD shell | ✅ done |
| M2  | Entities/ECS, units, tap/box/double-tap selection, move commands, A\* + flow fields, separation/avoidance with a spatial hash                                                                                                                     | ✅ done |
| M3  | Economy: gathering, drop-off, construction, houses/pop cap, training queues, command/build panels                                                                                                                                                 | ✅ done |
| M4  | Combat, counter matrix, health bars, projectiles, fog of war, minimap, win/lose                                                                                                                                                                   | ✅ done |
| M5  | Ages, minor god choice per age, tech tree, heroes                                                                                                                                                                                                 | ✅ done |
| M6  | Favor (per-faction income mode), mythic units, god powers, the three factions fully data-driven                                                                                                                                                   | ✅ done |
| M7  | AI opponent (utility AI + build orders), Easy/Normal/Hard, AI debug overlay                                                                                                                                                                       | ✅ done |
| M8  | Menus, pre-match, tutorial, settings, i18n (nb/en) completion, audio, polish, performance + balance pass                                                                                                                                          | ✅ done |
| M9  | Capacitor (Android/iOS) config, store-readiness checklist                                                                                                                                                                                         |         |

Every milestone ends with: `npm run lint && npm test && npm run build && npm run e2e` (Playwright, phone
viewport with touch emulation, screenshot in `e2e-output/`), then a git commit.

## Design decisions (defaults chosen — tell me if you want any changed)

### Technical

1. **Top-down orthographic view, not isometric.** Tap hit-testing, box selection and pathfinding stay
   trivial and precise on small screens; sprites are drawn in a slight 3/4 style to keep depth. Tile =
   32 world px.
2. **Simulation is pure TypeScript** (`src/sim`) with **no Phaser/DOM** (enforced by ESLint). It runs at a
   fixed **20 ticks/s**; the renderer interpolates between the previous and current tick.
3. **Determinism:** one seeded PRNG (mulberry32) owned by the world; the sim avoids `Math.random`,
   `Date`, and transcendental functions (`sin/cos/atan2/pow/exp`), which are not guaranteed bit-identical
   across JS engines. `+ - * / sqrt` are IEEE-exact, so same inputs ⇒ same state on every device. This
   keeps lockstep multiplayer and replays possible later.
4. **All player/AI intent goes through a command queue** applied at tick boundaries (the same path a
   network or replay would use). The AI gets the same API as the player.
5. **Component-style entities without an ECS library:** one flat entity shape with component
   field groups (monomorphic, trivially serialisable) and systems as plain functions run in a fixed
   order (see ARCHITECTURE.md).
6. **HUD/menus are DOM overlays, the world is Phaser.** CSS gives us `env(safe-area-inset-*)`, scalable
   text, 48 dp targets, dark/light themes and accessibility for free. HUD updates are throttled
   (event-driven or ~5 Hz) so they never cost frame time.
7. **Canvas renders at devicePixelRatio (capped at 2)** for crisp art; the cap becomes a graphics
   quality setting.
8. **Pathfinding:** A\* on the tile grid (octile, binary heap, reused buffers) with string-pulling,
   skipped entirely for straight lines; group moves use formation slots so units don't fight over
   one point; separation steering via a spatial hash; connected-region checks avoid hopeless
   searches. (Flow fields were not needed at this map size.)
9. **Fog of war (M4)** lives in the sim as a per-player visibility grid so the AI can be held to the same
   information rules; the renderer just displays it.
10. **PWA without workbox:** a ~40-line Vite plugin emits `sw.js` with a precache list of the built files
    (offline after first load). Avoids a large dependency tree for something small.
11. **Placeholder art is generated in code** at boot (canvas drawing) and registered behind an asset
    manifest (`src/render/assets/manifest.ts`). Replacing an entry's generator with a file URL swaps in
    real art with no other code changes.
12. **Maps are point-symmetric** (rotated 180°) for fairness in 1v1; connectivity between bases is
    verified (and a corridor carved if needed) by flood fill.
13. **i18n:** a tiny in-house `t(key, vars)` with typed English keys and Norwegian (bokmål) from day one.
14. Dependencies: `phaser` only at runtime. Dev: vite, typescript, vitest, eslint/typescript-eslint,
    prettier, playwright-core (pinned to the container's Chromium build for mobile e2e checks).

### Gameplay

- **Match:** 1v1 vs AI, 64×64 default map (48/64/80 options), 12–20 minutes.
- **Resources:** Food, Wood, Gold, Favor. Starting: 300/200/100/0, 1 Town Hall, 3 workers, pop cap 10
  (houses +10, max 200).
- **Ages:** Archaic → Classical → Heroic → Mythic. Advancing costs resources + time at the Town Hall and
  requires picking one of **two minor gods** (bonus + unique tech + a god power + a mythic unit).
- **Counter matrix** (damage multipliers in `src/data/balance`): infantry > cavalry > ranged > infantry;
  heroes ≫ mythic; mythic > infantry & cavalry; ranged > mythic (mild); siege ≫ buildings, weak vs
  cavalry/infantry. The UI shows "strong vs / weak vs" icons on every unit card.
- **God powers:** each major god has 1 power, each minor god 1 more ⇒ 4 per match. One use each
  (some recharge for Favor). Tap the power, then tap the map.
- **Win:** destroy the enemy Town Hall(s) and all military buildings (later: hold a Wonder N minutes).
- **Hard AI** gets an explicit **+15% gather rate** bonus (shown on the pre-match screen); Easy/Normal
  get none.

### Factions (original names)

| Faction                                                 | Flavour                                     | Favor income                                          | Unique mechanics                                                                       |
| ------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **The Hrimfolk** (northern, Norse-inspired)             | Cheap, tough infantry; aggressive           | Dealing/taking damage in combat                       | _Warhorn_: nearby infantry gain attack speed after a kill; builders are also soldiers. |
| **The Aurelian League** (Mediterranean, Greek-inspired) | Balanced; strongest heroes                  | Shrines generate Favor, more with garrisoned acolytes | Heroes level up from kills; extra hero slot per age.                                   |
| **The Sahrun Dominion** (desert, Egyptian-inspired)     | Strong economy and buildings; slow military | Monuments (5 tiers) generate Favor passively          | _Sun Obelisks_ extend build radius and boost nearby gathering; buildings +25% HP.      |

Major gods (pick one at match start, 2 per faction to start, data-driven to add more):

- Hrimfolk: **Thunrak the Storm-Father** (infantry attack, power: _Skyhammer_ lightning strike),
  **Veyla the Winter Queen** (cheaper mythic units, power: _Whiteout_ freezes an area).
- Aurelian: **Aetheon, Lord of the High Air** (hero HP/regeneration, power: _Radiant Ward_ heal zone),
  **Thalassine of the Tides** (faster economy and ships, power: _Tidal Surge_ knockback wave).
- Sahrun: **Solenkh the Radiant** (cheaper buildings, power: _Sunfire Lens_ burning beam),
  **Merit-Asha the Veiled** (stronger monuments, power: _Sandstorm Veil_ hides units / slows enemies).

Example units (full lists live in `src/data`): Hrimfolk _Hearthkin_ (worker), _Shieldbrother_
(infantry), _Ravenbow_ (ranged), _Wolfrider_ (cavalry), _Frostram_ (siege), hero _Stormsworn_, mythic
_Rimehulk_ and _Fenwyrm_. Aurelian _Citizen_, _Bronzeguard_, _Slinger_, _Lancer_, _Torsion Engine_,
hero _Lionheart Paragon_, mythic _Gorgonath_ and _Hydrake_. Sahrun _Toiler_, _Khopesh Guard_, _Sandbow_,
_Dune Chariot_, _Sun Lens_, hero _Sun-Priest_, mythic _Scarab Colossus_ and _Jackal Sentinel_.

## Balance notes (M8)

Tuned with `npm run balance` (Normal AI vs Normal AI, 3 seeds × 3 matchups). Latest report: wins
Hrimfolk 3 · Aurelian 2 · Sahrun 3, one AI-vs-AI stalemate; decisive games last 23–36 game-minutes
between two cautious AIs (human-vs-AI games are shorter; the Hard AI beats Easy in ~20).
Changes made during the pass: Hrimfolk favor from combat +67% and sturdier workers/infantry;
Aurelian hero, shrine and Lancer nerfs and Slingers now cost some gold; Sahrun faster training and
stronger infantry/chariots; cheaper Heroic and Mythic ages; +10% gather rates; more gold on maps;
shelter arrows +20% per unit; the AI scouts for distant gold, mines it with storehouses, and
commits harder late in the match.

## Not done / later

- Saving a match in progress (settings and statistics are saved).
- Ships and a Wonder victory condition.
- Real art and music (all assets are generated placeholders behind the asset manifest / music hook).

## Open questions (non-blocking)

- Ships: planned as an optional post-M9 milestone (maps already generate water).
- Online multiplayer: architecture allows lockstep later; not in scope now.
