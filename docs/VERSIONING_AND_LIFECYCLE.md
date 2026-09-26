# Versioning & Lifecycle Policy

This document is the authoritative **Versioning & Deprecation Lifecycle Policy** for the Askdepth SDK monorepo. It covers how packages are versioned, how long major lines remain supported, how the wire protocol relates to npm package versions, and how the client-side Kill-Switch guarantees that end-of-life SDKs cannot degrade browser performance.

A package version is **never** deprecated because calendar time has elapsed on its own. Deprecation timers start **strictly upon the release of a new Major version (breaking change)**.

---

## Philosophy & SemVer Model

### Independent versioning

Askdepth ships four independently versioned packages via [Changesets](https://github.com/changesets/changesets):

| Package | Role |
|---|---|
| `@askdepth/contracts` | Zod schemas, wire types, protocol constants |
| `@askdepth/core` | Browser RUM runtime (consent, heuristics, transport) |
| `@askdepth/replay` | rrweb wrapper + 45s ring buffer |
| `@askdepth/react` | React 19 / Next.js provider + AST compiler plugin |

Each package may advance on its own cadence. For example, `@askdepth/core@1.2.0` can ship while `@askdepth/replay` remains at `1.0.4`. Internal `workspace:*` dependencies are bumped by Changesets when a dependent package changes.

### What bumps mean

- **Major** — Breaking wire contract change (envelope fields, header semantics, criteria for what ingest accepts) **or** breaking public API change (`Askdepth.init` options removed, method signatures incompatible, required peer dependency jump that cannot be dual-supported).
- **Minor** — New heuristics, new friction signals, new optional APIs, backward-compatible features. Existing integrations continue to compile and run without code changes.
- **Patch** — Bug fixes, memory optimizations, PII redaction improvements, documentation and type-only refinements that do not alter runtime contracts.

Calendar age alone never forces a major. A `1.x` line that never receives a successor major remains fully supported.

---

## The 12–18 Month Lifecycle Clock (Major Version Deprecation)

### Indefinite support until a successor major exists

A package version line (for example `@askdepth/core@1.*`) remains **active and supported indefinitely** for as long as **no newer Major version** of that same package has been published. Security patches and ingest compatibility continue without a countdown.

### What happens when Major Version N+1 is released

When `@askdepth/<pkg>@N+1.0.0` is published, a lifecycle clock starts for major line **N** of that package. The clock is measured from the **publish timestamp of N+1**, not from the original publish of N.

#### Phase 1 — Active LTS (Months 0–12)

- Major version **N** continues to receive **security patches** and **full ingestion support**.
- The Ingestion API parses telemetry from both **N** and **N+1** transparently.
- Product documentation marks N as LTS and N+1 as Current.
- No client-side warnings are emitted solely because N is not Current.

#### Phase 2 — Deprecation Warning & Grace Period (Months 12–18)

- Ingestion **still accepts** telemetry from version **N**.
- Successful responses include the header `x-askdepth-warning: deprecated-major-version`.
- The Askdepth Client Dashboard surfaces a **warning badge** on projects still reporting `sdk_version` in the N line.
- The SDK does **not** self-deactivate in this phase. Teams have six months to upgrade.

#### Phase 3 — Hard Sunset (> 18 Months)

- Ingestion **rejects** payloads from major line **N** with:
  - HTTP status **`410 Gone`**, and
  - JSON body `{ "kill": true }`, and/or
  - Response header `x-askdepth-kill: true`.
- The client SDK executes the **emergency self-deactivation routine** described below.
- After sunset, security patches for N are no longer published.

---

## Wire Protocol vs. Package Version

Askdepth separates two version axes on every batch:

| Field / Header | Meaning |
|---|---|
| `protocol_version` / `x-askdepth-protocol-version` | Integer identifying the **wire schema** (envelope shape, field semantics). Currently frozen at **`1`**. |
| `sdk_version` / `x-askdepth-sdk-version` | Exact **SemVer** of the npm artifact that produced the batch (e.g. `1.4.2`). |
| `sdk_name` / `x-askdepth-sdk-name` | Package identity (e.g. `@askdepth/core`). |

### How the server handles compatibility

1. **Protocol negotiation** — Ingest reads `protocol_version` first. Unknown future protocols are rejected with a clear error; known older protocols are decoded by a dedicated parser path when multiple protocol majors coexist.
2. **Package EOL** — Ingest matches `sdk_name` + major segment of `sdk_version` against the lifecycle table. Protocol may still be `1` while the package major is sunset — EOL is driven by **package major age since N+1**, not by protocol alone.
3. **Contracts package** — `@askdepth/contracts` exports `PROTOCOL_VERSION`, `SDKVersion`, and `TelemetryEnvelopeHeader` so both client SDKs and server validators share one source of truth.

A protocol major bump (e.g. `1` → `2`) is itself a breaking change and ships as a **Major** of `@askdepth/contracts` and every runtime package that speaks the new wire format.

---

## Kill-Switch Specification

Enterprise security and performance teams require a guarantee: a sunset SDK must **never** continue to attach listeners, allocate ring buffers, or burn main-thread time after the ingest server declares End-Of-Life.

### Triggers (any one is sufficient)

1. HTTP status **`410 Gone`** from the Ingestion API.
2. JSON body containing **`{ "kill": true }`**.
3. Response header **`x-askdepth-kill: true`**.

These are evaluated on every `fetch` / keepalive upload path that returns a readable response. `sendBeacon` is used only for lightweight metadata on `pagehide`; kill confirmation is finalized on the next successful fetch round-trip when a body/headers are available.

### Client-side self-destruction sequence

1. Set internal status **`TERMINATED = true`** (idempotent; subsequent kills are no-ops).
2. Disconnect and remove **all** registered global listeners (click, scroll, `window.onerror` / `error`, `unhandledrejection`, and any `MutationObserver` handles registered by RUM engines).
3. Clear **all** in-memory structures: rage-click ring stacks, dead-click timers, error-click correlation windows, batcher buffers, and the rrweb ring buffer (`Uint8Array` / event queue) when `@askdepth/replay` is active.
4. Stop tracing monkey-patches and consent-gated engines.
5. Emit **exactly one** developer console warning:

   ```
   [Askdepth SDK] Runtime deactivated by ingest server signal.
   ```

6. Ensure all subsequent public API calls — including `askdepth.track()`, `askdepth.identify()`, `grantConsent()`, and further `init` reuse while terminated — become **silent no-ops that never throw**.

### Assurance for security reviews

- After termination, the SDK holds **no** DOM listeners and **no** pending timers from its own registries.
- No further network I/O is initiated by track/identify/flush paths.
- The singleton can be replaced only after an explicit `destroy()` clears process-local state for a fresh `init` in the same page (tests and hot-reload); production pages that received a kill remain inert for the remainder of the document lifetime unless the application deliberately reloads.

This behavior is covered by Vitest unit tests that mock HTTP `410` and `{ kill: true }` and assert listener removal plus silent no-op public APIs.
