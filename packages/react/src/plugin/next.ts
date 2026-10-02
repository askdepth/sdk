import { askdepthWebpackPlugin } from "./index.js";
import type { AskdepthPluginOptions } from "./index.js";

export interface AskdepthNextWebpackContext {
  isServer: boolean;
  dev: boolean;
}

export interface AskdepthWebpackConfig {
  plugins: unknown[];
}

export interface AskdepthNextConfig {
  webpack?: (config: AskdepthWebpackConfig, context: AskdepthNextWebpackContext) => AskdepthWebpackConfig;
  experimental?: {
    turbo?: {
      rules?: Record<string, unknown>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function withAskdepth<T extends AskdepthNextConfig>(
  nextConfig?: T,
  options?: AskdepthPluginOptions,
): T & {
  webpack: (config: AskdepthWebpackConfig, context: AskdepthNextWebpackContext) => AskdepthWebpackConfig;
} {
  const base = (nextConfig ?? {}) as T;
  const previous = base.webpack;
  const existingRules = base.experimental?.turbo?.rules ?? {};

  return {
    ...base,
    experimental: {
      ...base.experimental,
      turbo: {
        ...base.experimental?.turbo,
        rules: {
          "*.{tsx,jsx}": {
            loaders: ["@askdepth/react/turbopack-loader"],
            as: "*.tsx",
          },
          ...existingRules,
        },
      },
    },
    webpack(config, context) {
      const result = previous ? previous(config, context) : config;
      result.plugins.push(
        askdepthWebpackPlugin({
          ...options,
          environment: context.dev ? "development" : "production",
        }),
      );
      return result;
    },
  };
}
