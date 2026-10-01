export {
  PROTOCOL_VERSION,
  ProtocolVersionSchema,
  type ProtocolVersion,
  SDKVersionSchema,
  ProjectIdSchema,
  SessionIdSchema,
  type SDKVersion,
  EnvironmentSchema,
  TelemetryEventEnvelopeSchema,
  TelemetryEnvelopeSchema,
  TelemetryEnvelopeHeaderSchema,
  parseTelemetryEnvelope,
  isTelemetryEnvelope,
  createTelemetryEnvelope,
  type Environment,
  type TelemetryEventEnvelope,
  type TelemetryEnvelope,
  type TelemetryEnvelopeHeader,
} from './versioning/index.js';

export {
  AnomalyEventSchema,
  TelemetryEventSchema,
  type AnomalyEvent,
  type AnomalyType,
  type TelemetryEvent,
  CustomPropertiesSchema,
  TrackEventSchema,
  IdentifyEventSchema,
  type TrackEvent,
  type IdentifyEvent,
  ClickPointSchema,
  RageClickEventSchema,
  type ClickPoint,
  type RageClickEvent,
  ComputedStylesSchema,
  DeadClickEventSchema,
  type ComputedStyles,
  type DeadClickEvent,
  JsErrorDetailsSchema,
  NetworkErrorDetailsSchema,
  JsErrorClickEventSchema,
  NetworkErrorClickEventSchema,
  ErrorClickEventSchema,
  type JsErrorDetails,
  type NetworkErrorDetails,
  type ErrorClickEvent,
} from './anomalies/index.js';

export {
  REPLAY_SLICE_MAX_MS,
  RRWebEventSchema,
  CompressionAlgorithmSchema,
  ReplaySliceManifestSchema,
  ReplayUploadPayloadSchema,
  type RRWebEvent,
  type CompressionAlgorithm,
  type ReplaySliceManifest,
  type ReplayUploadPayload,
} from './replay.js';

export {
  TRACEPARENT_PATTERN,
  TraceparentHeaderSchema,
  TraceparentPartsSchema,
  parseTraceparent,
  formatTraceparent,
  type TraceparentParts,
} from './trace/traceparent.js';

export {
  ComponentSourceLocationSchema,
  ComponentMapPayloadSchema,
  type ComponentSourceLocation,
  type ComponentMapPayload,
} from './component-map.js';

