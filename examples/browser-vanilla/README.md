# Browser (vanilla) example

Static HTML page that boots `@askdepth/core` from the built `dist/index.mjs`.
Shows consent gating, `track` / `identify`, and automatic `traceparent`
injection on outbound `fetch`.

## Run

```bash
pnpm build
# from repo root — any static server works
npx --yes serve examples/browser-vanilla -p 5173
# open http://localhost:5173
```

Point `endpoint` at your Ingest API (or leave the default mock URL — the page
still demonstrates local API surface; failed uploads are non-fatal).

## What to try

1. Click **Grant consent** — listeners attach; Rage / Dead / Error heuristics arm.
2. Click **Track event** / **Identify** — events enter the bounded batcher.
3. Click **Fetch /api/ping** — DevTools Network shows a `traceparent` request header.
4. Click **Revoke consent** — buffers clear, listeners detach, further track is a no-op.
