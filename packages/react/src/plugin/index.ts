import { join } from 'node:path';
import { createUnplugin } from 'unplugin';
import {
  consolidateComponentMap,
  parseSourceLocation,
  resolveBuildId,
  resolveMappingDir,
  writePrivateComponentMap,
} from './component-map.js';
import type { ComponentMapOptions } from './component-map.js';
import { shouldTransform, transformJsxSource } from './transformers/jsx-attribute.js';

export interface AskdepthPluginOptions extends ComponentMapOptions {
  /** `production` hashes file locations. Any other value keeps `path:line:column`. */
  environment?: string;
  /** Automatically upload component map to Askdepth ingest server on build completion. */
  upload?: boolean;
  /** Custom ingest endpoint (defaults to ASKDEPTH_INGEST_URL or https://in.askdepth.com). */
  endpoint?: string;
  /** Ingestion API key or write key (defaults to ASKDEPTH_API_KEY or ASKDEPTH_WRITE_KEY). */
  apiKey?: string;
}

export {
  consolidateComponentMap,
  parseSourceLocation,
  resolveBuildId,
  resolveMappingDir,
  shouldTransform,
  transformJsxSource,
  writePrivateComponentMap,
};
export type { ComponentMapOptions };

export function createAskdepthPlugin(options: AskdepthPluginOptions = {}) {
  const production = (options.environment ?? process.env.NODE_ENV) === 'production';
  let uploaded = false;
  const finalize = async (isCloseBundle = false) => {
    if (production) {
      try {
        const manifest = consolidateComponentMap(options);
        const shouldUpload = options.upload ?? (process.env.ASKDEPTH_AUTO_UPLOAD === 'true');
        if (shouldUpload && manifest && isCloseBundle && !uploaded) {
          uploaded = true;
          const { uploadComponentMap } = await import('../cli/upload-map.js');
          const result = await uploadComponentMap({
            buildId: manifest.build_id,
            dir: resolveMappingDir(options),
            ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
            ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
          });
          if (result.success) {
            console.log(`[Askdepth] ${result.message}`);
          } else {
            console.warn(`[Askdepth] Warning: ${result.message}`);
          }
        }
      } catch {
        // avoid failing build if directory or files are empty
      }
    }
  };
  return {
    name: 'askdepth:react',
    enforce: 'pre' as const,
    vite: {
      configResolved(config: { root?: string }) {
        if (!options.mappingDir && config.root) {
          options.mappingDir = join(config.root, '.askdepth', 'component-maps');
        }
      },
    },
    webpack(compiler: { options?: { context?: string } }) {
      if (!options.mappingDir && compiler.options?.context) {
        options.mappingDir = join(compiler.options.context, '.askdepth', 'component-maps');
      }
    },
    transformInclude(id: string) {
      return shouldTransform(id);
    },
    transform(code: string, id: string) {
      const result = transformJsxSource(code, id, { production });
      if (!result) return null;
      if (production) writePrivateComponentMap(id, code, result, options);
      return { code: result.code, map: result.map ?? undefined };
    },
    buildEnd() {
      void finalize(false);
    },
    async closeBundle() {
      await finalize(true);
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
