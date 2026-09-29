import { askdepthWebpackPlugin } from './index.js';

export interface AskdepthNextWebpackContext {
  isServer: boolean;
  dev: boolean;
}

export interface AskdepthWebpackConfig {
  plugins: unknown[];
}

export interface AskdepthNextConfig {
  webpack?: (config: AskdepthWebpackConfig, context: AskdepthNextWebpackContext) => AskdepthWebpackConfig;
}

export function withAskdepth<T extends AskdepthNextConfig>(
  nextConfig?: T,
): T & {
  webpack: (config: AskdepthWebpackConfig, context: AskdepthNextWebpackContext) => AskdepthWebpackConfig;
} {
  const base = (nextConfig ?? {}) as T;
  const previous = base.webpack;
  return {
    ...base,
    webpack(config, context) {
      const result = previous ? previous(config, context) : config;
      result.plugins.push(
        askdepthWebpackPlugin({ environment: context.dev ? 'development' : 'production' }),
      );
      return result;
    },
  };
}
