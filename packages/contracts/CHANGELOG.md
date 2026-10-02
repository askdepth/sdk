# @askdepth/contracts

## 0.2.1

### Patch Changes

- 34d4807: Add component map generation, buildId forwarding in telemetry envelope, upload CLI tool, and CI/CD integration guides.

## 0.2.0

### Minor Changes

- f022fee: Set the initial RUM wire protocol version to `0.1.0` and export it as a shared constant for SDK and ingest validation. Because the wire contract is pre-1.0, incompatible protocol changes advance the minor protocol version.
- f022fee: Allow bounded component metadata on frustration events and expose core APIs for React component resolution and caught-error reporting through the anomaly pipeline.

## 0.1.1

### Patch Changes

- 79b34b4: Sprint 2: Session Replay engine with 45s Ring Buffer, Zero-PII client masking, W3C keepalive-safe transport chunking, and anomaly-driven flash on frustration signals.

## 0.1.0

### Minor Changes

- c33eb80: feat: implement core RUM telemetry engine, frustration heuristics (rage, dead, error clicks), and wire contracts
