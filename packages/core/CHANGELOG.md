# @askdepth/core

## 0.3.1

### Patch Changes

- 34d4807: Add component map generation, buildId forwarding in telemetry envelope, upload CLI tool, and CI/CD integration guides.
- bbc0483: Synchronize SDK contracts, anomaly correlation, replay slice manifests, and upload-map tooling with analytics-ingest specifications:
  - @askdepth/contracts: add schema_version, repository, commit_sha, and canonical checksum calculation to ComponentMapPayloadSchema; add triggering_anomaly_ids, build_id, checksum, baseline_status, requested_start_timestamp, document_id, recorder_id to ReplaySliceManifestSchema; introduce AnomalyCorrelationSchema (interaction_id, interaction_at, detected_at, detector_version, sampling_probability).
  - @askdepth/core: ensure publishAnomaly emits the durable telemetry event_id and forwards interaction_id and detector_version; add REACT_COMPONENT_ERROR error code and error_fingerprint to caught React errors; pass buildId to replay runtime.
  - @askdepth/react: update upload-map CLI to support --deploy-token / -t sending x-askdepth-deploy-token and x-askdepth-build-id headers; compute canonical checksum with fallback resolution for repository, commit SHA, and schema version.
  - @askdepth/replay: support dynamic accumulation of triggering_anomaly_ids on in-flight and cooldown slices; compute slice manifest checksum; attach x-askdepth-slice-manifest and x-askdepth-build-id headers on replay chunk uploads.
- Updated dependencies [34d4807]
- Updated dependencies [bbc0483]
  - @askdepth/contracts@0.2.1

## 0.3.0

### Minor Changes

- f022fee: Allow bounded component metadata on frustration events and expose core APIs for React component resolution and caught-error reporting through the anomaly pipeline.

### Patch Changes

- f022fee: Expose the active session id and collector state so React can report readiness without reading private runtime fields.
- Updated dependencies [f022fee]
- Updated dependencies [f022fee]
  - @askdepth/contracts@0.2.0

## 0.2.0

### Minor Changes

- 79b34b4: Sprint 2: Session Replay engine with 45s Ring Buffer, Zero-PII client masking, W3C keepalive-safe transport chunking, and anomaly-driven flash on frustration signals.

### Patch Changes

- Updated dependencies [79b34b4]
  - @askdepth/contracts@0.1.1

## 0.1.0

### Minor Changes

- c33eb80: feat: implement core RUM telemetry engine, frustration heuristics (rage, dead, error clicks), and wire contracts

### Patch Changes

- Updated dependencies [c33eb80]
  - @askdepth/contracts@0.1.0
