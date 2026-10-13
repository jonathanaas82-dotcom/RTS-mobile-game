import { defineConfig } from 'vitest/config';

/** Slow AI-vs-AI balance report: `npm run balance` (not part of `npm test`). */
export default defineConfig({
  test: {
    include: ['tests/balance/**/*.sim.ts'],
    environment: 'node',
    testTimeout: 900_000,
  },
});
