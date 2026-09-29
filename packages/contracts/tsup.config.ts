import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/versioning/protocol-version.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
