# @askdepth/replay

High-performance, privacy-by-default Session Replay recorder built for Askdepth SDK.

- **45-second In-Memory Ring Buffer:** Retains rolling session state without writing to disk or sending continuous streams.
- **Zero-PII Client Masking:** Real-time redactor for credit cards (Luhn-verified), JWTs, Bearer tokens, API keys, passwords, emails, phone numbers, passport IDs, and sensitive query/CSS URLs.
- **Strict Block Allowlist:** Blocked elements (`[data-askdepth-block]`, `.askdepth-block`) completely purge `class`, `id`, `style`, `src`, `href`, `data-*`, and all child nodes.
- **W3C Keepalive-Safe Transport:** Slices are chunked into $\le 45\text{ KiB}$ parts ($\le 60\text{ KiB}$ with base64 + JSON manifest), guaranteeing safe delivery during page unload within the browser's 64 KiB quota.
- **Flash-to-Server On Demand:** Flashes the last 45s of DOM mutations upon frustration heuristics (Rage Click, Dead Click, Error Click) from `@askdepth/core`.
- **Lightweight Budget:** $\le 31.5\text{ kB}$ minified & gzipped (well under the 35 kB size budget).

---

## Installation

```bash
pnpm add @askdepth/replay @askdepth/contracts
```

When using `@askdepth/core`, `@askdepth/replay` is automatically dynamically loaded on idle or pre-loaded on friction signals when `replay: true` is enabled.

---

## Direct Usage

```typescript
import { createReplayEngine } from '@askdepth/replay';

const replay = createReplayEngine({
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  environment: 'production',
  endpoint: 'https://collector.example.com/v1/replays/upload',
  checkoutEveryNms: 45_000,
});

// Start recording
replay.start();

// Flush a 45s slice when an anomaly occurs
await replay.flash('anomaly_uuid');

// Stop and clean up memory
replay.stop();
```

---

## Privacy & Masking Attributes

| Attribute / Class | Effect |
|---|---|
| `[data-askdepth-block]`, `.askdepth-block` | Complete block: scrubs all attributes except dimensions, removes all children. |
| `[data-askdepth-mask]`, `.askdepth-mask` | Replaces text with asterisks `*` preserving layout length. |
| `input`, `textarea`, `select` | Masked by default (`*`), emails/cards redacted with semantic markers. |
| `[contenteditable]` | Tracked statefully; all character mutations masked to `*`. |

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `sessionId` | `string` | *(required)* | Active session UUID. |
| `environment` | `string` | *(required)* | Deployment environment (`production`, etc.). |
| `endpoint` | `string` | *(required)* | Ingest server upload endpoint. |
| `windowMs` | `number` | `45000` | Rolling memory window duration (ms). |
| `checkoutEveryNms` | `number` | `45000` | FullSnapshot checkpoint frequency. |
| `maxBytes` | `number` | `3 MiB` (desktop), `1.5 MiB` (mobile/WebKit) | Upper memory bound before dropping pointer/scroll events. |

---

## Architecture

See [`docs/SPRINT_2_REPLAY_SPEC.md`](../../docs/SPRINT_2_REPLAY_SPEC.md) for detailed technical specifications and invariants.
