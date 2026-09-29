'use client';

export { AskdepthProvider, AskdepthContext } from './provider.js';
export { useAskdepth } from './hooks/use-askdepth.js';
export { AskdepthCatch } from './components/error-boundary.js';
export { resolveComponentLocation } from './fiber.js';
export type { AskdepthInitOptions, ConsentState } from '@askdepth/core';
export type {
  AskdepthContextValue,
  AskdepthProviderProps,
  AskdepthFallback,
  ResolvedComponentLocation,
} from './types.js';
