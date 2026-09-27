# Browser (vanilla) example

Static HTML page that boots `@askdepth/core` from the built `dist/index.mjs`.
Shows consent gating, `track` / `identify`, and automatic `traceparent`
injection on outbound `fetch`.

## Run

```bash
pnpm build
# from repo root
npx --yes serve . -p 5173
# open http://localhost:5173/examples/browser-vanilla/index.html
```

Point `endpoint` at your Ingest API (or leave the default mock URL — the page
still demonstrates local API surface; failed uploads are non-fatal).

## What to try

1. Click **Grant consent** — listeners attach; Rage / Dead / Error heuristics arm and `@askdepth/replay` begins buffering DOM mutations.
2. Click **Track event** / **Identify** — events enter the bounded batcher.
3. Click **Fetch /api/ping** — DevTools Network shows a `traceparent` request header.
4. Click **Rage click test** rapidly 3+ times — triggers Rage Click heuristic and session slice flash.
5. Click **Trigger JS error** — throws an exception to test error correlation and replay emission.
6. Click **Revoke consent** — buffers clear, listeners detach, replay recording terminates.
