import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Import plugin from monorepo dist
const { withAskdepth } = await import(resolve(__dirname, '../../packages/react/dist/plugin/index.mjs'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@askdepth/react', '@askdepth/core', '@askdepth/contracts'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@askdepth/contracts/protocol-version$': resolve(__dirname, '../../packages/contracts/dist/versioning/protocol-version.js'),
      '@askdepth/contracts$': resolve(__dirname, '../../packages/contracts/dist/index.js'),
      '@askdepth/core$': resolve(__dirname, '../../packages/core/dist/index.mjs'),
      '@askdepth/react$': resolve(__dirname, '../../packages/react/dist/index.mjs'),
      '@askdepth/replay$': resolve(__dirname, '../../packages/replay/dist/index.js'),
    };
    return config;
  },
};

export default withAskdepth(nextConfig);
