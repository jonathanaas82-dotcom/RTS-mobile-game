import { afterEach, describe, expect, it } from 'vitest';
import { detectLanguage, setLanguage, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { nb } from '../src/i18n/nb';

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('translates with placeholders', () => {
    expect(t('hud.tapInfo', { x: 1, y: 2, terrain: 'Grass' })).toBe('Tile 1, 2: Grass');
    setLanguage('nb');
    expect(t('res.wood')).toBe('Tre');
  });

  it('detects Norwegian variants', () => {
    expect(detectLanguage(['nb-NO'])).toBe('nb');
    expect(detectLanguage(['nn'])).toBe('nb');
    expect(detectLanguage(['no', 'en'])).toBe('nb');
    expect(detectLanguage(['de-DE', 'en-US'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('Norwegian covers every English key', () => {
    const missing = Object.keys(en).filter((k) => !(k in nb));
    expect(missing).toEqual([]);
  });
});
