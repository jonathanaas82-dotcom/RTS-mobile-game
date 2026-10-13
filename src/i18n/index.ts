import { en, type TranslationKey } from './en';
import { nb } from './nb';

export type Language = 'en' | 'nb';
export const LANGUAGES: readonly Language[] = ['en', 'nb'];

const DICTS: Record<Language, Partial<Record<TranslationKey, string>>> = { en, nb };
let current: Language = 'en';
const listeners = new Set<() => void>();

/** Pick a default language from the browser (Norwegian variants -> bokmål). */
export function detectLanguage(langs: readonly string[]): Language {
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'nb' || base === 'no' || base === 'nn') return 'nb';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function setLanguage(lang: Language): void {
  current = lang;
  listeners.forEach((fn) => fn());
}

export function getLanguage(): Language {
  return current;
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate `key`, replacing `{name}` placeholders with `vars`. */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? en[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export type { TranslationKey };
