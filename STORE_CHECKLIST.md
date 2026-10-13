# Store readiness checklist

Status legend: ✅ done in this repo · ⬜ needs a person/account/device · ⚠️ decision needed

## Build & identity

- ✅ App id `com.godforge.game`, name **Godforge** (`capacitor.config.json`, native projects).
  ⚠️ Change both before the first upload if the final title differs — store ids are permanent.
- ✅ Version `0.1.0` (web: `src/config/game.ts`; Android `versionName`/`versionCode` in
  `android/app/build.gradle`; iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` in Xcode).
  Bump `versionCode` / build number on every upload.
- ✅ Native projects generated (`android/`, `ios/` — iOS uses Swift Package Manager, no CocoaPods).
- ✅ Landscape only (Android `sensorLandscape`, iOS landscape-left/right on iPhone and iPad).
- ✅ Fullscreen / immersive (Android hides system bars, swipe to peek; iOS hides the status bar,
  `UIRequiresFullScreen`), content drawn into notch areas with CSS safe-area insets.
- ✅ Launcher icons (Android legacy + round + adaptive foreground/background; iOS 1024 opaque)
  and splash screens generated from `public/icons/icon.svg` (`npm run native:assets`).
- ✅ Works fully offline; no network permission needed beyond Capacitor's default `INTERNET`
  (kept for future online features — remove it from `AndroidManifest.xml` if never used).
- ✅ No service worker inside the native shell (assets ship in the app bundle).
- ✅ Haptics through `@capacitor/haptics` on native (iOS has no `navigator.vibrate`).
- ✅ iOS export compliance: `ITSAppUsesNonExemptEncryption = false` (no custom encryption).
- ⬜ Android: install Android Studio / SDK 35+, then `npm run cap:android` → Build → Generate
  Signed Bundle (AAB). Create and back up the upload keystore; enrol in Play App Signing.
  (Not buildable in this CI container: the Android SDK download host is blocked.)
- ⬜ iOS: on a Mac with Xcode 16+, `npm run cap:ios`, set the Team / signing, Product → Archive,
  upload with Organizer to App Store Connect.
- ⬜ Set `minSdkVersion`/`targetSdkVersion` to what Google Play currently requires (Capacitor 8
  defaults are current at the time of writing).

## Quality

- ✅ Unit tests (`npm test`), lint, type checks, production build.
- ✅ Automated phone-viewport touch test incl. offline reload and 180-unit performance check
  (`npm run e2e`).
- ⬜ Real-device testing: at least one low-end Android (2 GB RAM), one mid-range Android, an
  iPhone with a notch/Dynamic Island, an iPad. Check: 60 fps in big battles, no overheating in a
  20-minute match, safe areas, haptics, audio after backgrounding, resume after a phone call.
- ⬜ Test with system font scaling and both OS light/dark themes (menus follow the theme).
- ⬜ Battery/thermal check with Graphics: High vs Low.
- ⬜ Accessibility pass: all buttons have labels (done in code); verify with TalkBack/VoiceOver
  that menus are navigable; colour-blind check of player colours (blue/red) and counters.

## Content & legal

- ✅ All names, factions, units, gods, art, sounds and text are original; real mythology is only
  loose public-domain inspiration (see `PLAN.md`). No third-party assets.
- ✅ Credits screen in the game.
- ✅ Dependencies are permissively licensed (Phaser MIT, Capacitor MIT). ⬜ Generate a license
  notice file if the store reviewer asks (`npx license-checker --production`).
- ⬜ Privacy policy URL (required by both stores even when nothing is collected). The game
  stores settings and statistics only on the device and collects no personal data, has no
  ads, analytics, accounts or in-app purchases — say exactly that.
- ⬜ Google Play Data safety form: "No data collected / shared".
- ⬜ App Store privacy nutrition label: "Data Not Collected".
- ⬜ Content rating questionnaires (IARC / App Store): fantasy violence, no blood, no chat,
  no purchases → expected PEGI 7 / ESRB E10+ / 9+.
- ⬜ Trademark search for the final title.

## Store listing

- ⬜ Title, short description (80 chars), full description — English and Norwegian (bokmål).
  Draft: _"Gather, build and pray — command a mythic people, choose your gods and unleash
  their powers in fast real-time battles designed for touch."_
- ⬜ Screenshots: Android phone (16:9 landscape, ≥1080 px short side), 7" and 10" tablets;
  iPhone 6.9" and 6.5", iPad 13". Use `?play=1&seed=…` deep links to stage scenes;
  `npm run e2e` already writes phone-sized reference shots to `e2e-output/`.
- ⬜ Feature graphic (Android, 1024×500) and optional preview video.
- ⬜ Support e-mail / website.

## Before a 1.0 release (product)

- ⬜ Replace placeholder art/audio through the asset manifest and the music hook.
- ⬜ Save/resume a match in progress (not implemented; the app auto-pauses when backgrounded).
- ⬜ Playtest balance with humans (AI-vs-AI report: `npm run balance`).
