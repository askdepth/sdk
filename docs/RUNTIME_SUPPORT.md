# Runtime Support

Evidence-based runtime compatibility for the Askdepth browser SDK. Policy: **no optimism — verified or not supported**. Rows below are either proven in CI / lab harnesses or explicitly out of scope.

This document mirrors the verification discipline used historically in Askdepth connector runtimes: claims require a reproducible check, not a hope that “modern browsers will be fine.”

---

## Runtime Verification Matrix

| Runtime | Status | Evidence / Constraints |
|---|---|---|
| **Node.js ≥ 20** (SSR context) | **Verified** | SSR no-op paths: importing `@askdepth/core` and calling `init` with denied/unknown consent must not throw `ReferenceError` on `window` / `document`. Covered by Vitest (`jsdom` off for dedicated SSR cases) and package `typecheck`. |
| **Next.js App Router (RSC)** | **Verified** | `@askdepth/react` client entry is marked `'use client'`. `renderToString` under Vitest's Node environment covers the provider without `window`. App Router navigations are observed through `history.pushState` / `replaceState`. |
| **Chromium ≥ 115** (Chrome, Edge, Brave, Opera) | **Verified** | Playwright headless Chromium in `packages/core/e2e`. Click / visibility heuristics and `fetch` keepalive uploads exercised on this floor. |
| **WebKit / Safari ≥ 17** (macOS / iOS) | **Verified (constraints)** | Playwright WebKit where available. **Ring buffer clamped to 1.5 MB** in Private Browsing / low-memory signals to avoid jetsam. See Safari memory notes below. |
| **Firefox ≥ 120** (Gecko) | **Verified** | Playwright Firefox project for transport headers, consent gate, and kill-switch fetch inspection. |
| **Android WebView (Chromium 115+)** | **Verified** | Touch heuristics require `pointerType === 'touch'` (or equivalent TouchEvent path). Desktop mouse paths are ignored for mobile-only friction scoring. |
| **iOS WKWebView** | **Verified (constraints)** | When `navigator.sendBeacon` drops on `pagehide` (common under WebKit lifecycle quirks), the SDK falls back to **synchronous-capable `fetch(..., { keepalive: true })`** for lightweight metadata only. |
| **Internet Explorer 11** | **NOT SUPPORTED** | Modern **ES2022+** syntax and APIs are used deliberately. Polyfills are excluded to keep `@askdepth/core` under the **&lt; 10 KB gzipped** budget. |
| **Opera Mini (Proxy Mode)** | **NOT SUPPORTED** | Proxy architecture cannot run `MutationObserver` or maintain a client-side ring buffer; dead-click and replay semantics are undefined. |

---

## Known Architectural Findings & Constraints

### Secure Context requirement

`crypto.randomUUID()` is available only in [Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (HTTPS and `localhost`). On plain HTTP LAN / preview hosts the SDK uses an RFC4122-style fallback ID generator for `session_id`. Production deployments **must** serve the host application over HTTPS so Secure Context APIs (and modern cookie / storage assumptions) hold.

### `navigator.sendBeacon` 64 KB limit

Browsers enforce a practical **~64 KB** payload ceiling for `sendBeacon`. Askdepth therefore:

- Uses beacon **strictly for lightweight metadata** (envelope header + a small event slice) on `pagehide` / `visibilitychange`.
- **Never** ships the rrweb / replay **Ring Buffer** via beacon.
- Falls back to `fetch` with `keepalive: true` when beacon returns `false` or is unavailable (notably some iOS WKWebView `pagehide` paths).

The in-memory batcher also caps itself at **50 events or 64 KB** before flush, aligning transport buffers with beacon constraints.

### Safari memory throttling

Safari and iOS WebKit aggressively reclaim memory in Private Browsing and under memory pressure:

- Replay ring buffers are **clamped to 1.5 MB** when Private Browsing or low-memory signals are detected.
- Large replay blobs are excluded from unload beacons (see above).
- RUM engines must prefer short-lived `MutationObserver` scopes (e.g. dead-click 800 ms windows) over page-lifetime observers.

Teams validating on iOS should test both Normal and Private Browsing tabs before declaring a release verified for WebKit.

### Bundle budget

`@askdepth/core` is gated by `@size-limit/preset-small-lib` at **&lt; 10 KB gzipped**. Runtime support expansions that require polyfills for legacy browsers are rejected in favor of the matrix above.

### Protocol headers on every upload

Regardless of runtime, successful builds inject:

- `x-askdepth-protocol-version: 0.1.0`
- `x-askdepth-sdk-version: <semver>`
- Envelope field `protocol_version: 0.1.0` via `@askdepth/contracts`

See [`VERSIONING_AND_LIFECYCLE.md`](./VERSIONING_AND_LIFECYCLE.md) for EOL behavior when ingest returns `410` / `{ "kill": true }` / `x-askdepth-kill: true`.
