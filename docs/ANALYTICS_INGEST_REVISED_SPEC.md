# apps/analytics-ingest — Revised Specification for Compatible Analytics Ingestion

Purpose: accept telemetry and replay from @askdepth/core and @askdepth/replay without schema mismatches, bind every request to a verified project, and acknowledge acceptance only after a durable operation. The service remains a separate Cloud Run application without a persistent PostgreSQL connection.

## 1. Current State and Required Fixes

The local SDK and ingest worktrees now use x-askdepth-protocol-version: 0.1.0 and x-askdepth-write-key for telemetry and replay. Telemetry uses the shared 0.1.0 JSON envelope; replay sends bounded application/octet-stream chunks with session, slice, index, and count headers. This is source-level alignment; no shared network e2e has verified the two built packages against a running service.

Ingest now imports @askdepth/contracts through a local file dependency and validates the telemetry envelope against the SDK schema. That dependency is not yet a published package version, and the Docker build has not been verified with it.

The local ingest changes add hashed write-key lookup with server-side project binding, optional origin allowlisting, fail-closed behavior on registry errors, protocol gating, per-project family rate limits, bounded streaming request reads, and validation of replay chunk headers and payload size. Replay chunks are written to project-scoped GCS staging before acknowledgment, with generation preconditions for identical retries and conflicts. Telemetry now waits for a BigQuery write before returning 202 and marks a batch accepted in Valkey afterward. This improves the current direct-write path but does not provide queue-based durability.

### Remaining Integration Blockers

- Publish @askdepth/contracts and replace the ingest local file dependency; validate dependency pruning, installation, and the existing Docker build using the published package.
- Implement Pub/Sub publication and a separate retrying BigQuery worker. The current synchronous BigQuery path is interim and does not provide the specified queue boundary or dead-letter handling.
- Replace the current replay chunk endpoint and Valkey-based Buffer.concat assembly with the agreed manifest registration, checksum validation, durable finalization job, and upload status flow. Staging chunks are present, but the complete replay protocol is not.
- Add and run shared network conformance tests against the built SDK packages and a running ingest service. Also build real Next.js and Vite applications; unit coverage of plugin behavior does not verify those integrations.
- Run the Docker build, service tests, privacy review, and load tests before claiming production readiness.

## 2. Unified Protocol 0.1.0

The sole source of DTOs and runtime schemas is the shared @askdepth/contracts source in the SDK repository. This worktree sets the wire protocol to 0.1.0 while package metadata remains at 0.1.1. The already-published 0.1.1 artifact is immutable; Changesets must generate a new package release before external consumers can use the updated protocol. The current local ingest worktree imports the shared source through a file dependency; replacing it with the new published package remains open. Align the Zod major version and verify the container build. Protocol and package versions are separate axes.

All requests carry x-askdepth-protocol-version: 0.1.0 and x-askdepth-write-key: <publishable-write-key>; sdk_version is sent separately. The server derives the project from the key. If the client sends project_id for diagnostics, it must match the derived value; a mismatch is rejected. The service accepts the exact protocol version it implements and uses 410 + kill=true for unsupported versions, and 401/403 for an invalid or disabled key.

### Telemetry: POST /v1/telemetry

JSON envelope: protocol_version, sdk_name, sdk_version, environment, session_id, sent_at, batch_id, events. Each event has event_id, type, timestamp, and fields from the corresponding @askdepth/contracts union schema, including component context for frustration events. The BigQuery worker maps type to event_type and the required columns; the browser must not reshape fields to match the storage table. batch_id and event_id remain unchanged across retries.

Initial limits: no more than 50 events and a 64 KiB body per batch; the SDK should leave room below 64 KiB for keepalive. The server checks Content-Type and stream length before reading the full body, then validates the schema, strings, nesting, dates, and allowed fields. Invalid JSON returns 400, excess size returns 413, rate limiting returns 429 with Retry-After, and temporary durable-queue unavailability returns 503. A successful 202 means confirmed publication to Pub/Sub, not a write to BigQuery.

### Replay: Registration, Chunks, and Finalization

Target aligned flow: POST /v1/replays with a JSON manifest, session_id, slice_id, compression format, chunk count, total size, and SHA-256 returns upload_id; a retry with the same client slice ID returns the same upload_id. PUT /v1/replays/{upload_id}/chunks/{index} accepts application/octet-stream and a chunk checksum. POST /v1/replays/{upload_id}/complete confirms acceptance of the finalization job; GET /v1/replays/{upload_id} returns pending/complete/failed. The SDK currently sends bounded binary chunks to a simpler POST /v1/replays/upload endpoint with session/slice/index/count headers; manifest registration, checksums, upload IDs, and finalization/status endpoints remain to be implemented on both sides.

Initial limits: up to 45 KiB per chunk, 128 chunks, and 4 MiB of compressed data per slice; refine these values through load testing. The service enforces body limits while streaming, even without Content-Length, and validates the index, total sizes, and checksum before storage. Chunks are written to GCS staging under keys containing projectId and uploadId; writes with ifGenerationMatch=0 make identical retries idempotent, while different bytes at the same index return 409.

The target finalizer checks completeness, order, final SHA-256, and size; assembles the slice as a stream without Buffer.concat of the entire slice and creates the final object replays/{projectId}/{sessionId}/{sliceId}.gz only if no live version exists. Current code stages each chunk in GCS but also uses Valkey for chunk state and assembles with Buffer.concat before writing the final object. The durable job/status API and lifecycle policy remain outstanding. Valkey must not become the sole durable copy of chunks.

## 3. Authorization and Project Isolation

writeKey is a public key for the browser SDK, not a secret. The control service creates, rotates, and revokes keys and synchronizes the mapping from key hash to projectId, status, allowed origins, and limits to Valkey. Ingest checks the mapping on every request; if lookup fails, it denies access instead of accepting an anonymous package. Do not trust x-askdepth-project-id, session_id, or Origin as proof of project ownership. CORS and preflight are needed for browsers but do not replace authorization.

Apply rate limits after key verification, by verified projectId and key, with separate telemetry and replay budgets; 429 responses include Retry-After. Identify retries by batch_id, upload_id, and checksum. Do not return 208 based on Valkey deduplication before a durable operation is confirmed. Include projectId in all Valkey/GCS keys; test isolation between two projects with identical session_id/slice_id values.

## 4. Durability and BigQuery Writes

Target behavior: the telemetry route waits for Pub/Sub to confirm publication before returning 202. A separate worker reads messages with retry and a dead-letter queue, normalizes events, and writes them to BigQuery Storage Write API. For the first release, the default stream with at-least-once delivery is acceptable: retain event_id and deduplicate in the table or queries. Promise exactly-once delivery only after implementing and verifying offset-managed streams or an equivalent mechanism. The current local route instead waits for a direct BigQuery write, then records acceptance in Valkey; Pub/Sub and the worker do not exist yet.

If publication fails, return 503; the request remains retryable with the same batch_id. Metrics report queue delay, worker errors, dead-letter volume, and duplicate counts. Logs contain no keys, raw payloads, stack traces, or URLs with query strings. Do not use client timestamps without checking a reasonable range; the server records received_at.

## 5. Privacy, Operations, and Scaling

Server-side validation defines an allowlist of fields, maximum string lengths, and rules for removing query strings, fragments, tokens, input-field text, and raw source paths. A hashed component ID is acceptable; the mapping from ID to source is stored separately from public telemetry. Define BigQuery retention periods, project/session deletion, replay access, read auditing, and consent checks in the product model. Client-side masking is an additional safeguard.

GET /healthz returns 200 when the process is alive; /readyz returns 503 when critical dependencies are unavailable, using a short timeout. Fix the previous 539. For Cloud Run, set measurable CPU, memory, concurrency, max instances, timeout, and cost targets. At 20 instances × 80 concurrency, the maximum is 1600 concurrent requests; for 20,000 RPS, average processing time must be no more than 80 ms, with no headroom. Treat 20,000 RPS and 35 MiB RAM as hypotheses until load-tested.

Separate IAM roles: ingest reads key configuration, gets pubsub.publisher, and accesses only staging GCS; the telemetry worker accesses BigQuery; the replay finalizer accesses only the required GCS objects. Grant permissions at the resource level. A multi-stage Dockerfile exists and runs its final image as a non-root user; build it from pinned pnpm dependencies, verify that dependency pruning works with the published contracts package, and check reproducibility and image size without imposing an unjustified 120 MB limit. The Docker build has not been verified for the current local changes.

## 6. Tests and Readiness Criteria

Existing local service tests have been updated around protocol gating, telemetry, and replay uploads, but there is no shared network conformance suite using built SDK packages. The target suite uses built @askdepth/core and @askdepth/replay packages and the same @askdepth/contracts source used by ingest; after release, repeat it against the published package. Verify valid and revoked keys, an incorrect projectId, acceptance of protocol 0.1.0 and rejection of unsupported versions, all event types, preservation of component context, 202 after durable acceptance, 503 on storage failure, retry with the same batch_id, 429, body limits without Content-Length, and absence of PII in errors/logs.

Replay tests cover single and multiple chunks, out-of-order delivery, retry of an identical chunk, conflicting bytes, missing chunks, too many chunks, total size limits, concurrent finalization, GCS/Valkey failure, staging retention, and denial of cross-project access. Run network e2e with real built SDK packages and test infrastructure, then load-test to the claimed peak while measuring p95 latency, memory use, backlog throughput, and cost per million events.

## 7. Implementation and Release Order

Stage 1 — keep the already-published @askdepth/contracts@0.1.1 artifact unchanged and prepare a Changesets-generated package release containing protocol 0.1.0; until publication, use the shared local source in both worktrees and validate Docker once the release is available. Stage 2 — finish and review the implemented authorization, streaming limits, rate limits, and CORS. Stage 3 — implement durable telemetry through Pub/Sub and the BigQuery worker. Stage 4 — complete replay manifest registration, checksum validation, durable finalization, and status reporting. Stage 5 — build real Next/Vite applications, run shared SDK-to-ingest conformance and service e2e, then complete load testing, privacy review, IAM, and staged rollout. Enable the compatibility flag only after these checks are green; verify the unified protocol in CI in both repositories.

## 8. Basis for the Plan

Current code: apps/analytics-ingest/src/contracts/index.ts; src/routes/telemetry.route.ts; src/routes/replays.route.ts; src/middleware/protocol-version.middleware.ts; src/middleware/rate-limiter.middleware.ts; src/services/replay-assembler.service.ts; src/services/valkey.service.ts; src/services/gcs.service.ts; src/services/bigquery.service.ts; apps/analytics-ingest/tsconfig.json and package.json. SDK: packages/core/src/transport.ts; packages/core/src/ids.ts; packages/replay/src/upload.ts; packages/contracts/src/versioning/envelope.ts.

Official references: Cloud Run CPU after response — https://docs.cloud.google.com/run/docs/configuring/billing-settings ; Pub/Sub delivery — https://docs.cloud.google.com/pubsub/docs/publisher ; GCS generation preconditions — https://docs.cloud.google.com/storage/docs/request-preconditions ; BigQuery Storage Write API semantics — https://docs.cloud.google.com/bigquery/docs/write-api-best-practices . Verification status: updated by inspection of local SDK and ingest source/worktree state, including the changed route, middleware, and replay assembly flows. This document update did not run builds, service tests, Docker, shared network conformance, Next/Vite application builds, or load tests.
