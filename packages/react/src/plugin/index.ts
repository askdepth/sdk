import { createUnplugin } from 'unplugin';
import { shouldTransform, transformJsxSource } from './transformers/jsx-attribute.js';

export interface AskdepthPluginOptions {
  /** `production` hashes file locations. Any other value keeps `path:line:column`. */
  environment?: string;
}

export { shouldTransform, transformJsxSource };

export function createAskdepthPlugin(options: AskdepthPluginOptions = {}) {
  const production = (options.environment ?? process.env.NODE_ENV) === 'production';
  return {
    name: 'askdepth:react',
    enforce: 'pre' as const,
    transformInclude(id: string) {
      return shouldTransform(id);
    },
    transform(code: string, id: string) {
      const result = transformJsxSource(code, id, { production });
      if (!result) return null;
      return { code: result.code, map: result.map ?? undefined };
    },
  };
}

export const askdepthUnplugin = createUnplugin<AskdepthPluginOptions | undefined>((options) =>
  createAskdepthPlugin(options ?? {}),
);

export function askdepthVitePlugin(options?: AskdepthPluginOptions) {
  return askdepthUnplugin.vite(options);
}

export function askdepthWebpackPlugin(options?: AskdepthPluginOptions) {
  return askdepthUnplugin.webpack(options);
}

export function askdepthRspackPlugin(options?: AskdepthPluginOptions) {
  return askdepthUnplugin.rspack(options);
}

export { withAskdepth } from './next.js';
export type { AskdepthNextConfig, AskdepthNextWebpackContext, AskdepthWebpackConfig } from './next.js';
