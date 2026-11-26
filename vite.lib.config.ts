import { defineConfig } from 'vite';

// Embeddable ES module library. `three` stays external (peer dependency).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    lib: { entry: 'src/lib/index.ts', formats: ['es'], fileName: () => 'graphscape.js' },
    rollupOptions: { external: [/^three(\/.*)?$/] },
  },
});
