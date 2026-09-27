# Examples

Copy-paste integrations for `@askdepth/core` (and thin React wrapper).
Each folder is self-contained; snippets import the **built** `packages/*/dist`
artifacts so you can run them from this monorepo without publishing.

| Example | What it shows |
|---|---|
| [`smoke.mjs`](./smoke.mjs) | SSR / Node no-op smoke — import + `init` must not throw without a DOM |
| [`browser-vanilla`](./browser-vanilla) | Plain HTML page: consent gate, track, W3C `traceparent` on `fetch` |
| [`session-replay`](./session-replay) | Interactive session recording: 45s ring buffer, PII masking, frustration triggers, mock ingest inspector |
| [`nextjs-app`](./nextjs-app) | Next.js App Router client boundary (`'use client'`) |
| [`vite-spa`](./vite-spa) | Vite SPA entry that boots the SDK after consent |

```bash
pnpm build
node examples/smoke.mjs
```
