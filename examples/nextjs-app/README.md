# Next.js App Router example

Client-boundary wiring for `@askdepth/core` inside a Next.js App Router app.
Server Components must **not** call RUM APIs — keep init behind `'use client'`.

## Install into your app

```bash
pnpm add @askdepth/core
# Optional: if session replay is enabled, add @askdepth/replay
pnpm add @askdepth/replay
# copy providers.tsx next to your app/ tree
# wrap children with <AskdepthProvider> in app/layout.tsx
```

## Snippets in this folder

- [`providers.tsx`](./providers.tsx) — `'use client'` provider that calls `Askdepth.init` once (with RUM & Session Replay enabled) and exposes consent helpers.
- [`layout.tsx`](./layout.tsx) — root layout that wraps the tree.

Set `NEXT_PUBLIC_ASKDEPTH_WRITE_KEY` and `NEXT_PUBLIC_ASKDEPTH_ENDPOINT` in `.env.local`.

SSR remains safe: importing `@askdepth/core` or `@askdepth/replay` on the server stays a silent no-op
(see `examples/smoke.mjs` and `docs/RUNTIME_SUPPORT.md`).
