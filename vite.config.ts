import { defineConfig } from 'vite';
import { pwaPrecache } from './build/pwa-plugin';

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages) and inside Capacitor.
  base: './',
  plugins: [pwaPrecache()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Phaser is large and changes rarely: keep it in its own long-cacheable chunk.
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  server: { host: true },
});
