import { describe, expect, it } from "vitest";
import {
  REPLAY_SLICE_MAX_MS,
  ReplaySliceManifestSchema,
  ReplayUploadPayloadSchema,
  RRWebEventSchema,
} from "../src/index.js";

const manifest = {
  slice_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  triggering_anomaly_id: "anom_123",
  triggering_anomaly_ids: ["anom_123", "anom_456"],
  build_id: "build-123",
  session_id: "550e8400-e29b-41d4-a716-446655440000",
  environment: "production",
  start_timestamp: 1_000,
  trigger_timestamp: 10_000,
  duration_ms: 9_000,
  has_baseline_snapshot: true,
  baseline_status: "present" as const,
  events_count: 4,
  uncompressed_byte_size: 1200,
  compressed_byte_size: 400,
  compression_algorithm: "gzip" as const,
  checksum: "a".repeat(64),
};

describe("replay contracts", () => {
  it("keeps the slice window at 45 seconds", () => {
    expect(REPLAY_SLICE_MAX_MS).toBe(45_000);
  });

  it("accepts an rrweb event and a replay upload payload with synchronization fields", () => {
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
    const parsed = ReplaySliceManifestSchema.parse(manifest);
    expect(parsed.has_baseline_snapshot).toBe(true);
    expect(parsed.triggering_anomaly_ids).toEqual(["anom_123", "anom_456"]);
    expect(parsed.build_id).toBe("build-123");
    expect(parsed.baseline_status).toBe("present");
    expect(parsed.checksum).toBe("a".repeat(64));
  });

  it("rejects a slice longer than 45 seconds", () => {
    expect(ReplaySliceManifestSchema.safeParse({ ...manifest, duration_ms: 45_001 }).success).toBe(false);
    expect(ReplaySliceManifestSchema.safeParse({ ...manifest, compression_algorithm: "brotli" }).success).toBe(false);
  });
});
