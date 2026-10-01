import type { ReactNode } from 'react';
import type { AskdepthInitOptions } from '@askdepth/core';

export interface AskdepthContextValue {
  track: (name: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string, traits?: Record<string, unknown>) => void;
  getTraceparent: () => string | null;
  isReady: () => boolean;
  getSessionId: () => string | null;
}

type BaseProviderProps = Omit<AskdepthInitOptions, 'writeKey'> & {
  children?: ReactNode;
  /**
   * Deployment or build identifier used to resolve component maps in ingestion.
   * If omitted, falls back to NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA or NEXT_PUBLIC_ASKDEPTH_BUILD_ID.
   */
  buildId?: string;
};

type ProviderWithWriteKey = BaseProviderProps & {
  /** Project write key */
  writeKey: string;
  /** Alias for writeKey */
  apiKey?: string;
};

type ProviderWithApiKey = BaseProviderProps & {
  /** Project write key */
  writeKey?: string;
  /** Alias for writeKey */
  apiKey: string;
};

export type AskdepthProviderProps = ProviderWithWriteKey | ProviderWithApiKey;

export interface ResolvedComponentLocation {
  componentName: string;
  /** Innermost composite component first. */
  componentStack: string[];
  sourceAttr?: string;
  hashId?: string;
}

export type AskdepthFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);
