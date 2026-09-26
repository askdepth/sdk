import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  platform: 'browser',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  external: ['react', 'react/jsx-runtime', '@askdepth/core'],
});
