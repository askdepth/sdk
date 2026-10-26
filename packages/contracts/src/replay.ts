import { z } from "zod";

/** rrweb event kinds: 0 DomContentLoaded, 1 Load, 2 FullSnapshot, 3 IncrementalSnapshot, 4 Meta, 5 Custom. */
export const RRWebEventSchema = z.object({
  type: z.number().int(),
  data: z.unknown(),
  timestamp: z.number(),
});

export type RRWebEvent = z.infer<typeof RRWebEventSchema>;

export const CompressionAlgorithmSchema = z.enum(["gzip", "deflate", "none"]);

export type CompressionAlgorithm = z.infer<typeof CompressionAlgorithmSchema>;

export const REPLAY_SLICE_MAX_MS = 45_000;

const replayId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export const ReplaySliceManifestSchema = z.object({
  slice_id: replayId,
  manifest_version: z.literal(1).optional(),
  project_id: replayId.optional(),
  triggering_anomaly_id: replayId.optional(),
  triggering_anomaly_ids: z.array(replayId).max(100).optional(),
  session_id: z.string().min(1),
  environment: z.string().min(1),
  build_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).nullish(),
  requested_start_timestamp: z.number().int().nonnegative().optional(),
  start_timestamp: z.number(),
  trigger_timestamp: z.number(),
  duration_ms: z.number().min(0).max(REPLAY_SLICE_MAX_MS),
  baseline_status: z.enum(["present", "partial", "missing"]).optional(),
  baseline_timestamp: z.number().int().nonnegative().optional(),
  document_id: replayId.optional(),
  recorder_id: replayId.optional(),
  target_node_id: z.number().int().nonnegative().optional(),
  has_baseline_snapshot: z.boolean(),
  events_count: z.number().int().nonnegative(),
  uncompressed_byte_size: z.number().int().nonnegative(),
  compressed_byte_size: z.number().int().nonnegative(),
  compression_algorithm: CompressionAlgorithmSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sequence_number: z.number().int().positive().optional(),
});

export type ReplaySliceManifest = z.infer<typeof ReplaySliceManifestSchema>;

export const ReplayUploadPayloadSchema = z.object({
  manifest: ReplaySliceManifestSchema,
  payload: z.union([z.string().min(1), z.instanceof(Uint8Array)]),
  part_index: z.number().int().nonnegative(),
  total_parts: z.number().int().positive(),
});

export type ReplayUploadPayload = z.infer<typeof ReplayUploadPayloadSchema>;
