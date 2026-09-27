'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { Askdepth, type AskdepthInitOptions } from '@askdepth/core';

type Props = {
  children: ReactNode;
  writeKey?: string;
  endpoint?: string;
};

/**
 * Mount once near the root of the App Router tree.
 * Init is idempotent — React Strict Mode double-mount is safe.
 */
export function AskdepthProvider({ children, writeKey, endpoint }: Props) {
  const options = useMemo<AskdepthInitOptions>(
    () => ({
      writeKey: writeKey ?? process.env.NEXT_PUBLIC_ASKDEPTH_WRITE_KEY ?? '',
      endpoint: endpoint ?? process.env.NEXT_PUBLIC_ASKDEPTH_ENDPOINT ?? '',
      consent: 'unknown',
      sampleRate: 1,
      environment:
        process.env.NODE_ENV === 'production' ? 'production' : 'development',
      // Opt-in Session Replay (45s ring buffer with client-side PII masking).
      // Dynamically loads `@askdepth/replay` during browser idle or user friction.
      replay: true,
    }),
    [writeKey, endpoint],
  );

  useEffect(() => {
    if (!options.writeKey || !options.endpoint) return;
    Askdepth.init(options);
  }, [options]);

  return children;
}

export function grantAskdepthConsent() {
  Askdepth.setConsent('granted');
}

export function revokeAskdepthConsent() {
  Askdepth.revokeConsent();
}
