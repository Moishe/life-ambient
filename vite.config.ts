import { defineConfig } from 'vite';

// Served from https://<user>.github.io/life-ambient/ in production;
// dev server stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/life-ambient/' : '/',
}));
