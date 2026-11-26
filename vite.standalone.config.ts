import { defineConfig } from 'vite';

// Self-contained <script> bundle (three.js included) exposing window.Graphscape.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/standalone',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
    lib: { entry: 'src/lib/standalone.ts', formats: ['iife'], name: 'Graphscape', fileName: () => 'graphscape.standalone.js' },
  },
});
