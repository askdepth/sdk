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
      // esbuild drops `use client` while bundling. Next.js reads it from the package entry.
      for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
        const source = readFileSync(file, 'utf8');
        if (source.startsWith("'use client'") || source.startsWith('"use client"')) continue;
        writeFileSync(file, `'use client';\n${source}`);
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
    },
    format: ['esm', 'cjs'],
    clean: false,
    platform: 'node',
    external: ['unplugin', /^@babel\//],
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
]);
