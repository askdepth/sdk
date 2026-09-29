'use client';

import { Askdepth, type AskdepthInitOptions } from '@askdepth/core';
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { resolveComponentLocation } from './fiber.js';
import { installInteractionMemory } from './interaction.js';
import { startPageViews } from './page-view.js';
import type { AskdepthContextValue, AskdepthProviderProps } from './types.js';

export const AskdepthContext = createContext<AskdepthContextValue | null>(null);

const noopContext: AskdepthContextValue = {
  track: () => undefined,
  identify: () => undefined,
  getTraceparent: () => null,
  isReady: () => false,
  getSessionId: () => null,
};

export function getNoopAskdepth(): AskdepthContextValue {
  return noopContext;
}

export const AskdepthProvider: React.FC<AskdepthProviderProps> = (props) => {
  const { children, apiKey, writeKey: propWriteKey, ...restOptions } = props;
  const writeKey = propWriteKey ?? apiKey ?? '';
  const options: AskdepthInitOptions = {
    ...restOptions,
    writeKey,
  };
  const key = JSON.stringify(options);
  const stable = useMemo(() => options, [key]);
  const booted = useRef<string | null>(null);
  const [initializedKey, setInitializedKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (booted.current !== key) {
      Askdepth.init(stable);
      booted.current = key;
      setInitializedKey(key);
    }
    const unbindResolver = Askdepth.registerComponentResolver(resolveComponentLocation);
    const unbindInteraction = installInteractionMemory();
    const unbindPageViews = startPageViews();
    return () => {
      unbindResolver();
      unbindInteraction();
      unbindPageViews();
    };
  }, [key, stable]);

  const value = useMemo<AskdepthContextValue>(
    () => ({
      track: (name, properties) => {
        if (properties === undefined) Askdepth.track(name);
        else Askdepth.track(name, properties);
      },
      identify: (userId, traits) => {
        if (traits === undefined) Askdepth.identify(userId);
        else Askdepth.identify(userId, traits);
      },
      getTraceparent: () => Askdepth.getTraceparent(),
      isReady: () => Askdepth.isInitialized(),
      getSessionId: () => Askdepth.getSessionId(),
    }),
    [initializedKey],
  );

  return <AskdepthContext.Provider value={value}>{children}</AskdepthContext.Provider>;
};

AskdepthProvider.displayName = 'AskdepthProvider';
