# @askdepth/core

The core Real User Monitoring (RUM) and frustration heuristic engine for Askdepth.

- **Ultra-lightweight:** Only **6.69 kB** minified & gzipped (budget: $\le 10\text{ kB}$).
- **Zero Runtime Dependencies:** Pure TypeScript, zero external npm runtime dependencies.
- **Frustration Heuristics:** Real-time client-side detection of **Rage Clicks**, **Dead Clicks**, and **Error Clicks** (JS error & HTTP network correlation).
- **W3C Distributed Tracing:** Automatically propagates `traceparent` headers across `fetch` and `XMLHttpRequest` to correlate frontend clicks with backend APM traces.
- **Session Replay Ready:** Automatically and lazily loads [`@askdepth/replay`](https://www.npmjs.com/package/@askdepth/replay) on browser idle or user friction when `replay: true` is enabled.
- **Privacy & GDPR-First:** Built-in consent states (`granted`, `denied`, `unknown`). No data is collected or sent until consent is granted.
- **Resilient Transport:** Automatic memory batching, retry mechanism, and guaranteed unload delivery via `navigator.sendBeacon` and `keepalive: true`.
- **Remote Kill-Switch:** Graceful, instant client-side deactivation on `410 Gone` or `{ kill: true }` server responses to protect user browser performance.

---

## Installation

```bash
# pnpm
pnpm add @askdepth/core

# npm
npm install @askdepth/core

# yarn
yarn add @askdepth/core
```

---

## Quick Start

Initialize the SDK as early as possible in your application lifecycle (e.g. `main.ts`, `App.tsx`, or root layout):

```typescript
import { Askdepth } from '@askdepth/core';

Askdepth.init({
  // Project writeKey (UUID or CUID)
  writeKey: process.env.NEXT_PUBLIC_ASKDEPTH_WRITE_KEY ?? '550e8400-e29b-41d4-a716-446655440000',
  // Ingest collector endpoint
  endpoint: process.env.NEXT_PUBLIC_ASKDEPTH_ENDPOINT ?? 'https://ingest.example.com',
  // User consent state ('granted' | 'denied' | 'unknown')
  consent: 'granted',
  // Environment tag
  environment: 'production',
  // Build / deployment identifier (commit SHA or release tag)
  buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  // Opt-in Session Replay (45s ring buffer, zero-PII masking)
  replay: true,
  // Origins allowed to receive W3C traceparent headers
  allowedTracingOrigins: ['https://api.example.com'],
});
```

---

## API Reference

### 1. Consent Management (GDPR / CCPA)

You can initialize with `consent: 'unknown'` and grant or revoke consent after the user accepts cookies or privacy policies:

```typescript
// Grant tracking consent — resumes queue and listeners
Askdepth.setConsent('granted');

// Revoke consent — clears all queues, terminates listeners, and pauses transport
Askdepth.revokeConsent(); // or Askdepth.setConsent('denied');
```

### 2. Custom Event Tracking

Track custom user actions with optional properties:

```typescript
Askdepth.track('checkout_completed', {
  orderId: 'ord_98765',
  amount: 149.99,
  currency: 'USD',
});
```

### 3. User Identification

Associate the current session with an identified user:

```typescript
Askdepth.identify('user_12345', {
  plan: 'enterprise',
  role: 'admin',
});
```

### 4. Distributed Tracing (`traceparent`)

Retrieve the active W3C traceparent header for manual HTTP requests or WebSocket handshakes:

```typescript
const traceHeader = Askdepth.getTraceparent();
// e.g. "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
```

### 5. Session handle

`getSessionId()` returns the active session id after consent is granted. `isInitialized()` is true only while collectors are listening.

```typescript
if (Askdepth.isInitialized()) {
  const sessionId = Askdepth.getSessionId();
}
```

---

## Session Replay Integration

When `replay: true` is passed to `Askdepth.init()`:
1. The SDK schedules a non-blocking `dynamic import('@askdepth/replay')` during `requestIdleCallback` (3 seconds after page load) to ensure zero impact on Core Web Vitals (LCP / INP).
2. If rapid user friction is detected (2 clicks in < 800ms) or an anomaly occurs, it initiates predictive fast loading immediately.
3. Upon any Rage Click, Dead Click, or Error Click, the 45-second pre-anomaly ring buffer slice is captured, compressed with gzip, and sent to `${endpoint}/v1/replays/upload`.

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `writeKey` | `string` | *(required)* | Project identifier. |
| `endpoint` | `string` | *(required)* | Collector base URL. |
| `consent` | `'granted' \| 'denied' \| 'unknown'` | `'unknown'` | Current consent state. |
| `sampleRate` | `number` | `1` | Session sampling probability (0.0 to 1.0). |
| `environment` | `'production' \| 'staging' \| 'development'` | `'production'` | Environment metadata tag. |
| `buildId` | `string` | | Deployment or release identifier forwarded as `x-askdepth-build-id` and envelope `build_id`. |
| `replay` | `boolean \| { endpoint?: string, checkoutEveryNms?: number }` | `false` | Enable automated 45s session recording. |
| `allowedTracingOrigins` | `string[]` | `[]` | Domains allowed to receive `traceparent` headers. |
| `allowRapidClickSelectors` | `string[]` | `[]` | CSS selectors exempt from Rage Click heuristics (e.g. quantity steppers, like buttons). |

---

## License

MIT © [Askdepth](https://github.com/askdepth)
