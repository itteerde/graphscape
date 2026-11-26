import { defineConfig } from 'vitest/config';

// Editor application (index.html). Relative base so it can be hosted in any sub folder.
export default defineConfig({
  base: './',
  build: { outDir: 'dist/editor', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { port: 5173 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
