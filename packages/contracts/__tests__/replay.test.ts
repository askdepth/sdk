import { describe, expect, it } from 'vitest';
import {
  REPLAY_SLICE_MAX_MS,
  ReplaySliceManifestSchema,
  ReplayUploadPayloadSchema,
  RRWebEventSchema,
} from '../src/index.js';

const manifest = {
  slice_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  triggering_anomaly_id: 'anom_123',
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  environment: 'production',
  start_timestamp: 1_000,
  trigger_timestamp: 10_000,
  duration_ms: 9_000,
  has_baseline_snapshot: true,
  events_count: 4,
  uncompressed_byte_size: 1200,
  compressed_byte_size: 400,
  compression_algorithm: 'gzip' as const,
};

describe('replay contracts', () => {
  it('keeps the slice window at 45 seconds', () => {
    expect(REPLAY_SLICE_MAX_MS).toBe(45_000);
  });

  it('accepts an rrweb event and a replay upload payload', () => {
    expect(RRWebEventSchema.parse({ type: 2, data: { node: {} }, timestamp: 10 })).toEqual({
      type: 2,
      data: { node: {} },
      timestamp: 10,
    });
    const payload = {
      manifest,
      payload: new Uint8Array([1, 2, 3]),
      part_index: 0,
      total_parts: 1,
    };
    expect(ReplayUploadPayloadSchema.parse(payload)).toEqual(payload);
    expect(ReplaySliceManifestSchema.parse(manifest).has_baseline_snapshot).toBe(true);
  });

  it('rejects a slice longer than 45 seconds', () => {
    expect(ReplaySliceManifestSchema.safeParse({ ...manifest, duration_ms: 45_001 }).success).toBe(false);
    expect(ReplaySliceManifestSchema.safeParse({ ...manifest, compression_algorithm: 'brotli' }).success).toBe(false);
  });
});
