import type { ReactNode } from 'react';
import type { AskdepthInitOptions } from '@askdepth/core';

export interface AskdepthContextValue {
  track: (name: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string, traits?: Record<string, unknown>) => void;
  getTraceparent: () => string | null;
  isReady: () => boolean;
  getSessionId: () => string | null;
}

export type AskdepthProviderProps = Omit<AskdepthInitOptions, 'writeKey'> & {
  /** Project write key */
  writeKey?: string;
  /** Alias for writeKey */
  apiKey?: string;
  children?: ReactNode;
};

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
