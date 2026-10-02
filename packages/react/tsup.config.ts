import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const shared = {
  dts: true,
  sourcemap: true,
  treeshake: true,
  target: 'es2022' as const,
  splitting: false,
};

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    clean: false,
    platform: 'browser',
    external: ['react', 'react/jsx-runtime', 'react-dom', '@askdepth/core'],
    async onSuccess() {
      // tsup's tree shaking drops directive banners, so shift the map with the output.
      for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
        const source = readFileSync(file, 'utf8');
        if (source.startsWith("'use client'") || source.startsWith('"use client"')) continue;
        writeFileSync(file, `'use client';\n${source}`);
        const mapFile = `${file}.map`;
        const map = JSON.parse(readFileSync(mapFile, 'utf8')) as { mappings: string };
        map.mappings = `;${map.mappings}`;
        writeFileSync(mapFile, JSON.stringify(map));
      }
    },
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
  {
    ...shared,
    entry: {
      'plugin/index': 'src/plugin/index.ts',
      'turbopack-loader': 'src/turbopack-loader.ts',
      'cli/upload-map': 'src/cli/upload-map.ts',
    },
    format: ['esm', 'cjs'],
    clean: false,
    platform: 'node',
    banner: ({ entry }) => {
      if (entry === 'cli/upload-map') {
        return { js: '#!/usr/bin/env node' };
      }
      return {};
    },
    external: ['unplugin', /^@babel\//, '@askdepth/contracts'],
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
]);
