import type { AskdepthInitOptions } from '@askdepth/core';

export type AskdepthProviderProps = AskdepthInitOptions & {
  children?: unknown;
};

/**
 * Scaffold for the React 19 / Next.js provider.
 * Full provider + AST compiler plugin land in a later sprint.
 */
export function createAskdepthConfig(options: AskdepthInitOptions): AskdepthInitOptions {
  return options;
}

export type { AskdepthInitOptions };
