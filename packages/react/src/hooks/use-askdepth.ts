'use client';

import { useContext } from 'react';
import { AskdepthContext, getNoopAskdepth } from '../provider.js';
import type { AskdepthContextValue } from '../types.js';

export function useAskdepth(): AskdepthContextValue {
  return useContext(AskdepthContext) ?? getNoopAskdepth();
}
