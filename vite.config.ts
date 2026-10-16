import { defineConfig } from 'vitest/config';

// base relativa: el mismo build funciona en GitHub Pages (/mimi-game/) y en local.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
