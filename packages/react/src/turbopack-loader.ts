import { transformJsxSource } from './plugin/transformers/jsx-attribute.js';
import type { JsxTransformResult } from './plugin/transformers/jsx-attribute.js';

interface LoaderContext {
  resourcePath?: string;
  callback?: (error: Error | null, code: string, map?: NonNullable<JsxTransformResult['map']>) => void;
}

export default function askdepthTurbopackLoader(this: LoaderContext | void, source: string): string | void {
  const filename = this?.resourcePath || 'unknown.tsx';
  const production = process.env.NODE_ENV === 'production';
  const result = transformJsxSource(String(source), filename, { production });
  if (!result) return String(source);
  if (this?.callback) {
    this.callback(null, result.code, result.map ?? undefined);
    return;
  }
  return result.code;
}
