import type { TranslationKey } from './en';

/** Norsk bokmål. Missing keys fall back to English. */
export const nb: Partial<Record<TranslationKey, string>> = {
  'app.loading': 'Smir verden…',
  'rotate.title': 'Snu enheten',
  'rotate.body': '{game} spilles i liggende format.',
  'res.food': 'Mat',
  'res.wood': 'Tre',
  'res.gold': 'Gull',
  'res.favor': 'Gunst',
  'res.pop': 'Befolkning',
  'hud.pause': 'Pause',
  'hud.resume': 'Fortsett',
  'hud.speed': 'Spillhastighet',
  'hud.fullscreen': 'Fullskjerm',
  'hud.debug': 'Feilsøkingsinfo',
  'hud.paused': 'Pause',
  'hud.hint': 'Dra for å flytte · knip for å zoome · trykk for å se',
  'hud.tapInfo': 'Rute {x}, {y}: {terrain}',
  'terrain.0': 'Gress',
  'terrain.1': 'Sand',
  'terrain.2': 'Skog',
  'terrain.3': 'Vann',
  'terrain.4': 'Klippe',
  'feature.gold': 'Gullgruve ({amount})',
  'feature.berries': 'Bærbusk ({amount})',
};
