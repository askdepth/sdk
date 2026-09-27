# @askdepth/contracts

Wire contracts, Zod schemas, and TypeScript definitions for the Askdepth telemetry protocol.

This package defines the single source of truth for:
- RUM telemetry events (Rage Clicks, Dead Clicks, Error Clicks, Track, Identify).
- Wire Telemetry Envelope (`TelemetryEnvelope`) and Protocol Versioning.
- W3C Trace Context propagation (`traceparent` header validation and parsing).
- Session Replay slice manifests, chunk payloads, and rrweb event definitions.

---

## Installation

```bash
# pnpm
pnpm add @askdepth/contracts

# npm
npm install @askdepth/contracts

# yarn
yarn add @askdepth/contracts
```

---

## Key Exports & Usage

### 1. Wire Telemetry Envelope

Validate or construct telemetry batches transmitted to the Askdepth ingest server:

```typescript
import {
  createTelemetryEnvelope,
  parseTelemetryEnvelope,
  type TelemetryEnvelope,
} from '@askdepth/contracts';

// Creating an envelope
const envelope = createTelemetryEnvelope({
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: 'c8f7d6a5-b4c3-4d2e-8f1a-0b9c8d7e6f5a',
  environment: 'production',
  events: [
    {
      type: 'track',
      name: 'checkout_started',
      properties: { cartValue: 99.99 },
    },
  ],
});

// Parsing & validating incoming payload on server
const validated = parseTelemetryEnvelope(rawPayload);
```

### 2. W3C Distributed Tracing (`traceparent`)

Format and parse W3C Trace Context headers according to W3C Recommendation:

```typescript
import {
  formatTraceparent,
  parseTraceparent,
  TraceparentHeaderSchema,
} from '@askdepth/contracts';

// Format: 00-{trace_id}-{parent_id}-{trace_flags}
const headerValue = formatTraceparent({
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  parentId: '00f067aa0ba902b7',
  sampled: true,
});

// Parse header safely
const parts = parseTraceparent(headerValue);
// parts.traceId -> '4bf92f3577b34da6a3ce929d0e0e4736'
// parts.sampled -> true
```

### 3. RUM Anomaly Events (Frustration Heuristics)

Strict Zod schemas for user frustration detection:

```typescript
import {
  RageClickEventSchema,
  DeadClickEventSchema,
  ErrorClickEventSchema,
  type RageClickEvent,
} from '@askdepth/contracts';

const isRageClick = RageClickEventSchema.safeParse(event).success;
```

### 4. Session Replay Contracts (Sprint 2)

Schemas for 45-second session replay slices, compression algorithms, and chunks:

```typescript
import {
  ReplaySliceManifestSchema,
  ReplayUploadPayloadSchema,
  RRWebEventSchema,
  type ReplaySliceManifest,
  type ReplayUploadPayload,
} from '@askdepth/contracts';

// Validate replay manifest
const manifest = ReplaySliceManifestSchema.parse({
  slice_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  triggering_anomaly_id: 'anom_rage_123',
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  environment: 'production',
  start_timestamp: 1711500000000,
  trigger_timestamp: 1711500045000,
  duration_ms: 45000,
  has_baseline_snapshot: true,
  events_count: 142,
  uncompressed_byte_size: 154000,
  compressed_byte_size: 24500,
  compression_algorithm: 'gzip',
  sequence_number: 1,
});
```

---

## Wire Protocol Versioning

`@askdepth/contracts` exports `PROTOCOL_VERSION = 1`. Protocol versions change strictly on breaking wire changes, following SemVer rules defined in [`docs/VERSIONING_AND_LIFECYCLE.md`](https://github.com/askdepth/sdk/blob/master/docs/VERSIONING_AND_LIFECYCLE.md).

---

## License

MIT © [Askdepth](https://github.com/askdepth)
