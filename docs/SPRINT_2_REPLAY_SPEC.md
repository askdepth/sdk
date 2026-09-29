# Technical Specification (Revised): Sprint 2 — Session Recording Engine (`@askdepth/replay`), In-Memory Ring Buffer, and Client-Side Masking

---

## 1. Overview and Architectural Context

* **Sprint goal:** Ship a high-performance modular `@askdepth/replay` package that continuously records the user session into an **in-memory ring buffer (45 seconds)** with client-side PII masking (Zero-PII Leakage) and a guaranteed session-slice upload (Flash-to-Server) when Sprint 1 frustration signals fire (Rage Click, Dead Click, Error Click).
* **Package boundaries:**
  * `packages/contracts` (`@askdepth/contracts`) — strict Zod schemas and TypeScript types: session events, slice manifests (`ReplaySliceManifest`), chunk payloads (`ReplayUploadPayload`), compression algorithms.
  * `packages/replay` (`@askdepth/replay`) — lightweight isolated recorder on `@rrweb/record`, a ring buffer that preserves DOM mutation chains, in-stream compression, and a stateful client sanitizer.
  * `packages/core` (`@askdepth/core`) — deferred load (`dynamic import`) during idle (`requestIdleCallback` after `window.onload` + 3s delay), predictive load on early friction (`noteFriction`), and the anomaly bus (`anomaly-bus`).

---

## 2. Contracts and Data Schemas (`packages/contracts`)

### 2.1. Entity Split: RRWebEvent vs ReplaySliceManifest

> [!IMPORTANT]
> The original draft mixed manifest fields (`session_id`, `compression_algorithm`, `uncompressed_byte_size`) into raw rrweb events. The contract keeps them strictly separate:

1. **`RRWebEvent`** — atomic DOM-recorder event:
   * `type: number` — rrweb numeric enum (`0: DomContentLoaded`, `1: Load`, `2: FullSnapshot`, `3: IncrementalSnapshot`, `4: Meta`, `5: Custom`).
   * `data: unknown` — mutation or interaction payload.
   * `timestamp: number` — Unix epoch milliseconds.

2. **`ReplaySliceManifest`** — metadata for an uploaded slice:
   * `slice_id: string (UUIDv4)` — global slice id.
   * `triggering_anomaly_id: string` — id of the anomaly (Rage/Dead/Error Click) that triggered the flash.
   * `session_id: string` — Askdepth session id.
   * `environment: string` — environment (`production`, `staging`, `development`).
   * `start_timestamp: number` — timestamp of the first event in the slice.
   * `trigger_timestamp: number` — exact anomaly timestamp.
   * `duration_ms: number` — actual slice duration ($\le 45\,000$ ms).
   * `has_baseline_snapshot: boolean` — whether a `FullSnapshot` opens the slice.
   * `events_count: number` — event count in the batch.
   * `uncompressed_byte_size: number` — raw JSON byte size.
   * `compressed_byte_size: number` — compressed binary size.
   * `compression_algorithm: 'gzip' | 'deflate' | 'none'` — algorithm used.
   * `sequence_number?: number` — monotonic per-session counter for dedupe and backend ordering.

3. **`ReplayUploadPayload`** — transport chunk container:
   * `manifest: ReplaySliceManifest`
   * `payload: Uint8Array | string` — binary or base64-compressed slice.
   * `part_index: number` — 0-based part index.
   * `total_parts: number` — total parts for this slice.

---

## 3. Detailed Specification for `@askdepth/replay`

### 3.1. DOM Recorder Integration (`@rrweb/record`)
* `checkoutEveryNms: 45000` — every 45 seconds the recorder emits a fresh `FullSnapshot` that refreshes the in-memory baseline.
* Extra checkpoints: automatic `takeFullSnapshot(true)` on SPA route changes (`pushState`, `replaceState`, `popstate`, `hashchange`), throttled to at most once per 1000 ms.
* `inlineStylesheet: true` — keep external CSS for stable playback.
* `collectFonts: false`, `inlineImages: false`, `recordCanvas: false` — do not collect heavy binary assets.
* Throttling:
  * `mousemove`: 50 ms on desktop, **fully disabled** (`false`) on mobile and WebKit.
  * `scroll: 150` ms.
  * `input: 'last'` — record the final input value instead of every keystroke.

---

### 3.2. Ring Buffer Architecture and DOM Integrity Invariants

```
┌────────────────────────────────────────────────────────┐
│            Checkpoint Slot (Active FullSnapshot)       │
│    Refreshed every 45s, on SPA route change, or onPressure │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
[DOM Mutations] ──► [EventSanitizer] ──► [FIFO Ring Buffer: last 45 sec]
                                              │
                                              │ (On frustration trigger)
                                              ▼
                        [Flash-to-Server Assembly Engine]
```

#### DOM integrity invariant (P0):
* During playback, any incremental node mutation depends on earlier mutations that created or changed that node since the last `FullSnapshot`.
* **No arbitrary deletion:** Do not drop individual DOM mutation events (`type: 3, source: 0`) from the middle of the chain. Removing a mid-chain mutation causes a fatal player error: `Node with id N not found`.
* **Slice invariant:** A slice guarantees `baseline.timestamp <= trigger_timestamp`. Every structural DOM mutation between `baseline.timestamp` and the trigger **must be included**, even if it happened before the sliding window edge ($T_{\text{trigger}} - 45\,\text{s}$). Streaming events (mouse, scroll) that do not change the element tree are filtered strictly by the window edge.
* **Memory-pressure eviction (`evictByMemory`):**
  1. Drop pointer samples (`mousemove`, `touchmove`).
  2. Drop intermediate scroll events.
  3. If memory is still over budget: do not delete DOM mutations. The buffer calls `onPressure()`, which takes a new `FullSnapshot`. That snapshot becomes the active `baseline`, after which the old mutation tail can be discarded safely.
* **Pending queue backpressure:** The unsynced event queue in `engine.ts` is capped at `MAX_PENDING = 500`. Over that limit, mouse trails are dropped automatically.

---

### 3.3. Masking and Sanitization (Privacy-by-Default & Zero-PII Leakage)

#### 1. Strict allowlist for blocked nodes (`[data-askdepth-block]`, `.askdepth-block`):
* To stop private data leaking through CSS classes (for example `class="user-id-12345"`), ids, inline styles (`background-image: url(...)`), or custom attributes:
  * All child nodes are removed (`node.childNodes = []`).
  * Attributes use a strict allowlist: keep **only** `width`, `height`, `rr_width`, `rr_height`, the `data-askdepth-block` marker, and a neutral placeholder style.
  * Attributes `class`, `id`, `style`, `src`, `href`, `data-*`, `aria-*`, `title`, `alt`, `value` are **fully removed**.

#### 2. HTML inputs and `contenteditable`:
* All inputs (`input`, `textarea`, `select`, `contenteditable`) are masked by default (`*`). String length is preserved.
* Passwords (`input[type="password"]`) and card fields (`cc-*`, CVC) are blocked.

#### 3. Stateful sanitizer (`EventSanitizer`):
* Unlike stateless helpers, `EventSanitizer` keeps a `Set<number>` of node ids under `contenteditable`, `[data-askdepth-mask]`, and `.askdepth-mask`.
* On incremental input mutations (`texts: [{ id, value }]`) the sanitizer resolves membership immediately and masks text with asterisks so dynamic typing cannot leak.

#### 4. Deep PII and token scrubbing (`maskText`):
* **JWT tokens:** regex `\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b` $\to$ `[REDACTED_JWT]`.
* **Bearer tokens:** `\bBearer\s+[A-Za-z0-9_\-\.=]{16,}\b` $\to$ `Bearer [REDACTED_TOKEN]`.
* **API keys and secrets:** `(?:api[_-]?key|auth[_-]?token|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}` $\to$ `[REDACTED_SECRET]`.
* **Bank cards:**
  * Luhn check for 13–19 digit numbers.
  * Labeled heuristic (`Card:`, `cc:`, `pan:`): redact cards even when the number fails Luhn (typos or test numbers).
* **Email, phones, documents (passports, SSN):** replace with `[REDACTED_*]` markers.
* **CSS & URL sanitization:** strip sensitive query params (`token`, `secret`, `email`, `auth`) from `src`, `href`, and inline `url(...)` styles.

#### 5. Incremental hardening for blocked nodes:
* If a blocked node (`blockedIds`) later receives incremental mutations (`attributes`, `texts`, or `source: 5` input):
  * For `attributes`, apply the size allowlist: keep only `data-askdepth-block`, `width`, `height`, `rr_width`, `rr_height`.
  * For `texts` and `input` mutations, force empty values (`value = ''`, `text = ''`).

---

### 3.4. Flash and Transport (Flash-to-Server)

#### 1. W3C keepalive limit (64 KiB) and chunking:
* Browser quota for `fetch(..., { keepalive: true })` is strictly **64 KiB** per tab.
* Binary chunk size is `CHUNK_BYTES = 45 * 1024` (45 KiB).
* After base64 overhead (+33%) and the JSON manifest, request bodies land around ~60 KiB, safely under the browser limit so `keepalive: true` remains usable.

#### 2. Concurrency lock and dedupe:
* When several heuristics fire together (for example three Rage Clicks + a fatal JS error):
  * `flash()` is gated by a `flashingPromise` mutex. Parallel callers await the in-flight flash instead of duplicating network uploads.
  * A 1000 ms cooldown stops spam of identical slices.
  * Each slice gets a unique `slice_id` and a monotonic `sequence_number`.

#### 3. Timeouts and retry policy:
* Network calls use `AbortController` with a 10 second timeout and timer cleanup.
* On 5xx responses, retry up to 2 times with exponential backoff. After retries are exhausted, throw for logging.

#### 4. Reactive preload on anomalies (`replay-loader.ts`):
* The `onAnomaly` bus does not wait for the 3 second `requestIdleCallback` timer.
* Any recorded anomaly immediately calls `loadNow()`.
* A `pending: AnomalySignal[]` queue holds signals until the dynamic import finishes, then drains them once the engine is ready.

---

## 4. Acceptance Criteria and Required Tests

1. **DOM Mutation Eviction Safety:** Under memory pressure, only pointer/scroll events are dropped; the DOM mutation chain from `baseline` to now stays continuous.
2. **PII Scrubbing across Attributes, URLs and Styles:** Verify masking of JWT, Bearer tokens, API keys, card numbers, query params, and CSS `url(...)`.
3. **Strict Blocked Node Allowlist:** For `data-askdepth-block` or `.askdepth-block` nodes, `class`, `id`, `style`, `src`, `href` are removed and `childNodes` are cleared on both `FullSnapshot` and incremental mutations.
4. **Flash Concurrency & Monotonic Ordering:** Parallel `flash()` calls do not duplicate uploads; slices carry sequential `sequence_number` values.
5. **Clean Teardown / Zero Memory Leak:** Repeated `start() -> flash() -> stop()` frees the ring buffer (`dump().length === 0`), restores `history.pushState`, and leaves no `visibilitychange` listeners.
6. **Keepalive Safety:** Every uploaded chunk is strictly under 64 KiB.
7. **Size Budget Compliance:**
   * `@askdepth/core` $\le 10\text{ kB}$ gzipped (actual: **6.69 kB**).
   * `@askdepth/replay` $\le 35\text{ kB}$ gzipped (actual: **31.48 kB**).
8. **Test Coverage:** Line coverage $\ge 90\%$ (actual: **92.23%** statements, **90.54%** functions, 38/38 tests).
