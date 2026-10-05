import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `base: './'` emits relative asset URLs so the build works from any static
// host path (e.g. https://<user>.github.io/<repo>/) without configuration.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    // CodeMirror accounts for most of the bundle; ~170 kB gzipped is fine.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
