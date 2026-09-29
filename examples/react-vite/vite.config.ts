import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askdepthVitePlugin } from '../../packages/react/dist/plugin/index.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: resolve(__dirname),
  plugins: [
    askdepthVitePlugin({
      environment: process.env.NODE_ENV ?? 'development',
    }),
  ],
  resolve: {
    alias: {
      '@askdepth/react/plugin': resolve(__dirname, '../../packages/react/dist/plugin/index.mjs'),
      '@askdepth/react': resolve(__dirname, '../../packages/react/dist/index.mjs'),
      '@askdepth/core': resolve(__dirname, '../../packages/core/dist/index.mjs'),
      '@askdepth/replay': resolve(__dirname, '../../packages/replay/dist/index.js'),
      '@askdepth/contracts/protocol-version': resolve(__dirname, '../../packages/contracts/dist/versioning/protocol-version.js'),
      '@askdepth/contracts': resolve(__dirname, '../../packages/contracts/dist/index.js'),
      react: resolve(__dirname, '../../packages/react/node_modules/react'),
      'react-dom': resolve(__dirname, '../../packages/react/node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, '../../packages/react/node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': resolve(__dirname, '../../packages/react/node_modules/react/jsx-dev-runtime.js'),
      jsdom: resolve(__dirname, '../../packages/react/node_modules/jsdom'),
    },
  },
  server: {
    port: 5176,
  },
};
