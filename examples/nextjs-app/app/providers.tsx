'use client';

import React, { type ReactNode } from 'react';
import { AskdepthProvider } from '@askdepth/react';

const DEFAULT_WRITE_KEY = process.env.NEXT_PUBLIC_ASKDEPTH_WRITE_KEY || 'my_dynamic_key_99';
const DEFAULT_ENDPOINT = process.env.NEXT_PUBLIC_ASKDEPTH_ENDPOINT || 'https://analytics-ingest-927740258959.europe-west1.run.app/v1/telemetry';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AskdepthProvider
      writeKey={DEFAULT_WRITE_KEY}
      endpoint={DEFAULT_ENDPOINT}
      consent="granted"
      sampleRate={1}
      environment={process.env.NODE_ENV === 'production' ? 'production' : 'development'}
      replay={true}
    >
      {children}
    </AskdepthProvider>
  );
}
