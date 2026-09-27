# Session Replay & PII Masking Example

Interactive browser demonstration for `@askdepth/replay` and its seamless integration with `@askdepth/core`.

It demonstrates continuous, zero-overhead DOM recording into a **45-second sliding FIFO Ring Buffer in memory**, client-side PII data scrubbing **before** mutations touch RAM, frustration-driven automatic slice emission (Flash-to-Server), and safe W3C 64 KiB chunked uploads.

---

## What It Shows

1. **Client-Side PII Scrubbing**:
   - Automatic masking of passwords, credit cards (Luhn-algorithm validated), emails, phones, and document numbers.
   - Dynamic masking of rich-text `contenteditable` editors.
   - Text redaction preserving string length for visual fidelity.
   - Scrubbing of sensitive attributes (`aria-label`, `title`, `alt`).
   - Custom class masking (`.askdepth-mask`) and complete element blocking (`.askdepth-block`).

2. **Ring Buffer & Baseline Snapshots**:
   - 45-second sliding window that recycles older mutations automatically to cap memory (<3 MB desktop, <1.5 MB mobile).
   - Baseline `FullSnapshot` anchoring ensuring generated replay slices are strictly replayable by `rrweb.Replayer` without node mirror corruption.
   - Throttled SPA navigation checkpoints on `history.pushState` / `replaceState`.

3. **Frustration Heuristics & Auto-Flash**:
   - **Rage Click**: Rapid clicks trigger RUM detector and automatically dispatch a session slice to the backend.
   - **Dead Click**: Clicking an un-actionable element arms the mutation observer; if no DOM changes occur, an anomaly is logged.
   - **Error Click**: Captures unhandled runtime errors and correlates them with preceding click interactions.

4. **W3C 64 KiB Safe Uploads**:
   - Slices are compressed via Gzip / Deflate and split into ~45 KiB chunks.
   - Respects the browser 64 KiB limit on `fetch(keepalive: true)`.

---

## How to Run

From the repository root:

```bash
# 1. Build all packages
pnpm build

# 2. Run any static server from the repo root
npx --yes serve . -p 5175

# 3. Open in your browser
# http://localhost:5175/examples/session-replay/index.html
```

Or run via Vite:

```bash
npx --yes vite examples/session-replay --config examples/session-replay/vite.config.ts
```

---

## Code Examples

### Option A: Automatic Integration via `@askdepth/core`

```typescript
import { Askdepth } from '@askdepth/core';

Askdepth.init({
  writeKey: 'your-write-key',
  projectId: 'your-project-id',
  endpoint: 'https://ingest.example.com/v1',
  consent: 'granted',
  // Enables session replay — lazily loaded on idle or user friction
  replay: {
    endpoint: 'https://ingest.example.com/v1/replays/upload',
    checkoutEveryNms: 45000,
  },
});

// Any detected rage click, dead click, or error click will
// automatically flash the preceding 45s of the session.
```

### Option B: Direct / Standalone Usage via `@askdepth/replay`

```typescript
import { createReplayEngine } from '@askdepth/replay';

const replay = createReplayEngine({
  sessionId: 'session_abc123',
  endpoint: 'https://ingest.example.com/v1/replays/upload',
  environment: 'production',
  checkoutEveryNms: 45000,
});

// Start recording into 45s ring buffer
replay.start();

// On user feedback modal, bug report, or custom telemetry anomaly:
await replay.flash('user_reported_bug_123');

// Teardown on page unload or logout
replay.stop();
```
