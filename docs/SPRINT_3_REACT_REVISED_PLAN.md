# @askdepth/react — Revised Sprint 3 Completion Plan

Purpose: associate Rage Click, Dead Click, and Error Click events with a React component and, when the compiler plugin is enabled, with a specific source location. This document replaces disputed examples from the earlier specification and sets verifiable conditions for SDK readiness to work with apps/analytics-ingest.

## 1. What Exists and Where the Boundary Lies

In the current code, AskdepthProvider initializes @askdepth/core after commit through useEffect, registers a component resolver, and observes History API transitions. Core enriches frustration events, AskdepthCatch reports caught errors through core, and the plugin returns a source map. This is the foundation of the React adapter; @askdepth/core, @askdepth/replay, and @askdepth/contracts define the request format used by ingest.

The current @askdepth/react runtime does not import next/navigation; the Next.js App Router has not been verified through a real build and navigation flows. The package remains private at version 0.0.1 and is excluded from release changesets. Therefore, passing React unit tests does not mean the public SDK is ready or compatible with ingest.

### Current Local Integration Progress

The SDK worktree now uses protocol version 0.1.0 from @askdepth/contracts@0.1.1. Core sends the versioned JSON envelope with x-askdepth-write-key, stable event IDs, and a retained batch body for retries; it retries 429/5xx and transport failures with bounded backoff and Retry-After. The replay client sends raw application/octet-stream chunks with the 0.1.0/write-key/session/slice/index/count headers, a 45 KiB chunk limit, and bounded retries. These client wire formats have corresponding unit coverage.

The sibling apps/analytics-ingest worktree has added write-key registry lookup with project binding and optional origin allowlisting, protocol gating, per-project telemetry/replay rate limits, bounded streaming body reads, contract schema validation, and GCS staging for replay chunks before acknowledgment. Telemetry currently waits for a direct BigQuery write before returning 202 and records accepted batch IDs in Valkey. This is an interim durable path; Pub/Sub publication and a separate worker are not implemented.

This is local cross-repository implementation progress, not a completed release or end-to-end compatibility result. @askdepth/contracts is consumed by ingest through a local file dependency; a published package dependency and a validated Docker build remain open. The current replay flow is binary chunk upload, but it has no manifest registration, checksum/finalization job API, or durable status endpoint. Ingest still holds assembled chunks in Valkey and uses Buffer.concat for final assembly. Real Next.js/Vite application e2e and a shared SDK-to-ingest network conformance run remain outstanding.

## 2. Changes to the Original React Specification

### Provider and Routes

Keep initialization only in an effect after commit. Preserve idempotency and clean up subscriptions on unmount and when settings change. Do not use the fictitious AskdepthCore.getInstance in examples or call the SDK during render. The shared provider must work without Next.js as a dependency.

For Next.js, create a separate optional client-side route adapter: use usePathname as a navigation signal, and use useSearchParams only when needed to detect a route change, without sending query values in telemetry. Exclude URL fragments and redact dynamic path segments. Account for Suspense around useSearchParams on statically rendered Next.js routes. Prevent the adapter and History API from emitting two page_view events for one navigation.

### Errors and Fiber

AskdepthCatch catches render and lifecycle errors in descendants; click-handler and server errors require separate channels. Reports should go through core reportCaughtError into the ERROR_CLICK schema, with limits and sanitization for message, stack, and componentStack. Do not publish raw stacks or expose internal details in the standard production fallback UI.

Fiber is a private React structure. Traverse it only for a frustration event, with a depth limit and safe handling when no result is available. It can provide a component name and stack when possible; only a marker added by the compiler plugin guarantees an exact line. Verify React 18 and 19, memo, forwardRef, portals, and the absence of Fiber keys.

### Compilers and Production Source Mapping

Keep unplugin for Vite, Webpack, and Rspack; Turbopack uses a separate loader. Return a source map for every transform. For Next 15.0–15.2, Turbopack rules are under experimental.turbo; for 15.3 and later, they are under turbopack. The presence of unplugin alone does not mean there is SWC or Turbopack integration. Remove claims of 5–10x Babel speedups until measured.

Allow data-askdepth-src with a relative path only in local development or behind an explicit flag; treat public staging as an external environment. In production, use an opaque ID and produce a private mapping artifact from ID to file:line:column, tied to a build ID. Check for collisions. Eight hexadecimal characters should not be treated as a unique key for large applications; 12–16 characters are proposed, subject to analysis of application size and collision risk.

## 3. Shared Protocol: SDK Tasks

Keep the published @askdepth/contracts package version at 0.1.1 and use protocol version 0.1.0 in telemetry and replay. For telemetry, retain the current SDK envelope and event union with its type field as the basis; add stable batch_id and event_id values for retries. The browser's project_id field must not determine data ownership: ingest derives the project from writeKey and checks the field if present. Specify time units, size limits, response codes, and version compatibility policy separately.

In @askdepth/core, send the public writeKey in x-askdepth-write-key and protocol version 0.1.0; separate the key from projectId so an arbitrary key does not disable sending due to UUID/CUID validation. Retry the same batch_id on 429/5xx with bounded backoff and Retry-After; do not silently drop a batch on a transient error. The queue, keepalive, and sendBeacon remain best effort when the page closes.

In @askdepth/replay, the current implementation sends bounded binary chunks using the same protocol version and writeKey as telemetry, with stable slice_id, index, and chunk count across retries. Remaining work is to agree and implement the full manifest registration, checksum, and finalization/status contract with ingest. Preserve masking, consent, and transient-memory limits. The new ingest specification contains the proposed full format.

## 4. SDK Checks and Acceptance Criteria

Behavior: Rage Click, Dead Click, and ERROR_CLICK contain the correct component when a marker/Fiber is available; ERROR_CLICK triggers the core replay flash as designed and does not send raw error strings. The application does not crash when the provider is absent or during SSR. Remounting does not duplicate listeners or page_view events.

Builds: real minimal applications using React 18 and 19; Vite; and the Next 15 App Router with Webpack and Turbopack for supported versions. Verify client/server boundaries, React navigation, JSX/TSX, DOM markers, and source maps back to the original file. The plugin must not require .babelrc. React coverage ≥90%; runtime ESM <4.8 KiB gzip and CJS <5.2 KiB gzip.

Integration: unit tests exist on both sides, but no shared network conformance suite currently sends actual telemetry batches and replay slices from built SDK packages to ingest. Add that suite to verify durable telemetry acknowledgment, key/project validation, retries, 429, 410, and incomplete and duplicate chunks. This gate is required before publication.

Release: after integration is green, remove private from @askdepth/react, remove the package exclusion from .changeset/config.json, prepare a changeset, and agree on the first public version. README must present writeKey as a public, restricted key, show the real endpoint, document Next setup by version, and explain Fiber fallback limitations.

## 5. Execution Order

Step 1. Keep published @askdepth/contracts@0.1.1 immutable. Prepare the Changesets-generated next package release with wire protocol 0.1.0; use the shared local source in both repositories until that release is published. Then replace ingest's local file dependency and validate Docker. Step 2. Complete the replay manifest, checksum, and finalization/status contract, and implement Pub/Sub plus its BigQuery worker. Step 3. Complete real Next/Vite application e2e, shared SDK-to-ingest conformance, privacy work, and the source ID mapping artifact. Step 4. Run end-to-end checks, then open the SDK for publication.

## 6. Basis for the Plan

SDK: packages/react/src/provider.tsx; packages/react/src/components/error-boundary.tsx; packages/react/src/fiber.ts; packages/react/src/plugin/index.ts; packages/react/src/plugin/transformers/jsx-attribute.ts; packages/react/README.md; packages/react/package.json; packages/core/src/transport.ts; packages/replay/src/upload.ts; packages/contracts/src/versioning/envelope.ts. Ingest: apps/analytics-ingest/src/routes/telemetry.route.ts and src/contracts/index.ts. Official Next.js documentation: https://nextjs.org/docs/15/app/api-reference/functions/use-pathname ; https://nextjs.org/docs/app/api-reference/functions/use-search-params ; https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack .

Verification status: local source and unit-test changes were inspected. This update did not run builds, tests, Docker, network conformance, real Next/Vite application builds, or load checks. Do not treat protocol alignment at the client layer as proof of production readiness.
