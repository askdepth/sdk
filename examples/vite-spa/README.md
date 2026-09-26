# Vite SPA example

Minimal Vite + TypeScript entry that boots `@askdepth/core` after an explicit
consent click (GDPR-friendly default).

## Run (from this monorepo)

```bash
pnpm build
cd examples/vite-spa
pnpm install   # optional local vite if you wire package.json
# or just:
npx --yes vite --config vite.config.ts
```

For a published package:

```bash
pnpm add @askdepth/core
# copy main.ts into your Vite `src/` and import it from index.html
```
