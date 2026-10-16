import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Base relativa: el build funciona en GitHub Pages bajo /<repo>/ y en cualquier subcarpeta.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
