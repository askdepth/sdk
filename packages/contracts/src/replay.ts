import { z } from 'zod';

/** rrweb event kinds: 0 DomContentLoaded, 1 Load, 2 FullSnapshot, 3 IncrementalSnapshot, 4 Meta, 5 Custom. */
export const RRWebEventSchema = z.object({
  type: z.number().int(),
  data: z.unknown(),
  timestamp: z.number(),
});

export type RRWebEvent = z.infer<typeof RRWebEventSchema>;

export const CompressionAlgorithmSchema = z.enum(['gzip', 'deflate', 'none']);

export type CompressionAlgorithm = z.infer<typeof CompressionAlgorithmSchema>;

export const REPLAY_SLICE_MAX_MS = 45_000;

export const ReplaySliceManifestSchema = z.object({
  slice_id: z.string().uuid(),
  triggering_anomaly_id: z.string().min(1),
  session_id: z.string().min(1),
  environment: z.string().min(1),
  start_timestamp: z.number(),
  trigger_timestamp: z.number(),
  duration_ms: z.number().min(0).max(REPLAY_SLICE_MAX_MS),
  has_baseline_snapshot: z.boolean(),
  events_count: z.number().int().nonnegative(),
  uncompressed_byte_size: z.number().int().nonnegative(),
  compressed_byte_size: z.number().int().nonnegative(),
  compression_algorithm: CompressionAlgorithmSchema,
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
