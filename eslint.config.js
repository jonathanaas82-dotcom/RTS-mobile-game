import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'e2e-output', 'android', 'ios', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The simulation must stay engine-agnostic: no Phaser, no DOM.
    files: ['src/sim/**/*.ts', 'src/ai/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', '**/render/**', '**/ui/**'],
              message: 'sim/ai/data must not depend on rendering or UI.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
    },
  },
  {
    // Node scripts; page.evaluate() callbacks run in the browser, hence window/navigator.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
      },
    },
  },
);
