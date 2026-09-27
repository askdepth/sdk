# @askdepth/react

Official React 19 and Next.js integration for Askdepth.

- **React 19 & Next.js App Router Compatible:** First-class support for Client Components, React Server Components (RSC), and hydration safety.
- **Idempotent Mount:** Safe under React Strict Mode double-invocations in development.
- **Seamless RUM & Replay:** Automatically configures `@askdepth/core` and lazy-loads `@askdepth/replay`.
- **Zero SSR Overhead:** Safe during Server-Side Rendering (SSR) and Static Site Generation (SSG).

---

## Installation

```bash
# pnpm
pnpm add @askdepth/react @askdepth/core

# npm
npm install @askdepth/react @askdepth/core

# yarn
yarn add @askdepth/react @askdepth/core
```

---

## Quick Start (Next.js App Router)

Create an analytics provider component (e.g. `app/providers.tsx`):

```tsx
'use client';

import { ReactNode } from 'react';
import { AskdepthProvider } from '@askdepth/react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AskdepthProvider
      writeKey={process.env.NEXT_PUBLIC_ASKDEPTH_WRITE_KEY!}
      endpoint={process.env.NEXT_PUBLIC_ASKDEPTH_ENDPOINT!}
      consent="granted"
      environment={process.env.NODE_ENV === 'production' ? 'production' : 'development'}
      replay={true}
    >
      {children}
    </AskdepthProvider>
  );
}
```

Wrap your root layout (`app/layout.tsx`):

```tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

## Quick Start (Vite / React SPA)

In your entry point (`src/main.tsx`):

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AskdepthProvider } from '@askdepth/react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AskdepthProvider
      writeKey={import.meta.env.VITE_ASKDEPTH_WRITE_KEY}
      endpoint={import.meta.env.VITE_ASKDEPTH_ENDPOINT}
      consent="granted"
      replay={true}
    >
      <App />
    </AskdepthProvider>
  </React.StrictMode>,
);
```

---

## Consent Hooks & Controls

You can grant or revoke consent dynamically (e.g. inside a Cookie Banner component):

```tsx
import { Askdepth } from '@askdepth/core';

export function CookieBanner() {
  return (
    <div>
      <p>We use analytics to improve user experience.</p>
      <button onClick={() => Askdepth.setConsent('granted')}>Accept All</button>
      <button onClick={() => Askdepth.revokeConsent()}>Decline</button>
    </div>
  );
}
```

---

## Props

The `<AskdepthProvider>` accepts all configuration options from `@askdepth/core`:

| Prop | Type | Default | Description |
|---|---|---|---|
| `writeKey` | `string` | *(required)* | Askdepth Project ID / Write Key. |
| `endpoint` | `string` | *(required)* | Askdepth Ingest Server URL. |
| `consent` | `'granted' \| 'denied' \| 'unknown'` | `'unknown'` | User consent state. |
| `replay` | `boolean \| object` | `false` | Enable automated Session Replay recording. |
| `sampleRate` | `number` | `1` | Session sampling probability (0.0 to 1.0). |
| `environment` | `'production' \| 'staging' \| 'development'` | `'production'` | Current environment. |
| `allowedTracingOrigins` | `string[]` | `[]` | Origins to inject W3C `traceparent` headers. |

---

## License

MIT © [Askdepth](https://github.com/askdepth)
