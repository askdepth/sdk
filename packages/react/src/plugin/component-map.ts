import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { JsxTransformResult } from './transformers/jsx-attribute.js';

export interface ComponentMapOptions {
  /** Deployment or build identifier used to locate the private lookup files. */
  buildId?: string;
  /** Private output directory. Keep this outside publicly served assets. */
  mappingDir?: string;
}

export function writePrivateComponentMap(
  filename: string,
  source: string,
  result: JsxTransformResult,
  options: ComponentMapOptions = {},
): void {
  const buildId = options.buildId ?? process.env.ASKDEPTH_BUILD_ID ?? process.env.GITHUB_SHA ?? `local-${process.pid}`;
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(buildId) || buildId === '..') {
    throw new Error('Invalid Askdepth build ID');
  }
  const mappingDir = options.mappingDir ?? process.env.ASKDEPTH_COMPONENT_MAP_DIR ?? join(process.cwd(), '.askdepth', 'component-maps');
  const directory = resolve(mappingDir, buildId);
  mkdirSync(directory, { recursive: true });
  const fileId = createHash('sha256').update(filename).update('\0').update(source).digest('hex');
  const target = join(directory, `${fileId}.json`);
  const temporary = join(directory, `${fileId}.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify({ buildId, locations: result.locations }));
  renameSync(temporary, target);
}
