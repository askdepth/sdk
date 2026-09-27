import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: {
      '@askdepth/core': resolve(__dirname, '../../packages/core/dist/index.mjs'),
      '@askdepth/replay': resolve(__dirname, '../../packages/replay/dist/index.js'),
      '@askdepth/contracts': resolve(__dirname, '../../packages/contracts/dist/index.js'),
      '@rrweb/replay': resolve(__dirname, '../../packages/replay/node_modules/@rrweb/replay/dist/replay.js'),
    },
  },
  server: {
    port: 5175,
  },
});
