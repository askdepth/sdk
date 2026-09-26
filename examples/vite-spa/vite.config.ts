import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@askdepth/core': resolve(__dirname, '../../packages/core/dist/index.mjs'),
    },
  },
  server: {
    port: 5174,
  },
});
