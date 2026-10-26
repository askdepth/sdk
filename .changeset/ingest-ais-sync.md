---
"@askdepth/contracts": patch
"@askdepth/core": patch
"@askdepth/react": patch
"@askdepth/replay": patch
---

Synchronize SDK contracts, anomaly correlation, replay slice manifests, and upload-map tooling with analytics-ingest specifications:
- @askdepth/contracts: add schema_version, repository, commit_sha, and canonical checksum calculation to ComponentMapPayloadSchema; add triggering_anomaly_ids, build_id, checksum, baseline_status, requested_start_timestamp, document_id, recorder_id to ReplaySliceManifestSchema; introduce AnomalyCorrelationSchema (interaction_id, interaction_at, detected_at, detector_version, sampling_probability).
- @askdepth/core: ensure publishAnomaly emits the durable telemetry event_id and forwards interaction_id and detector_version; add REACT_COMPONENT_ERROR error code and error_fingerprint to caught React errors; pass buildId to replay runtime.
- @askdepth/react: update upload-map CLI to support --deploy-token / -t sending x-askdepth-deploy-token and x-askdepth-build-id headers; compute canonical checksum with fallback resolution for repository, commit SHA, and schema version.
- @askdepth/replay: support dynamic accumulation of triggering_anomaly_ids on in-flight and cooldown slices; compute slice manifest checksum; attach x-askdepth-slice-manifest and x-askdepth-build-id headers on replay chunk uploads.
