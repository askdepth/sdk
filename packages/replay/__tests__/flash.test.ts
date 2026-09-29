import { gunzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { CHUNK_BYTES, REPLAY_WINDOW_MS } from '../src/constants.js';
import { createReplayEngine } from '../src/engine.js';
import type { RRWebEvent } from '../src/index.js';

const base = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  writeKey: 'pk_test_123',
  environment: 'test',
  endpoint: 'https://collector.test/v1/replays/upload',
  now: () => 20_000,
  schedule: (fn: () => void) => fn(),
};

function snapshot(timestamp: number): RRWebEvent {
  return { type: 2, timestamp, data: { node: { type: 0, childNodes: [], id: 1 } } };
}

describe('flash assembly', () => {
  it('builds a gzip slice with a baseline and a duration inside 45 seconds', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const engine = createReplayEngine({ ...base, fetchImpl });
    engine.push(snapshot(1_000));
    engine.push({ type: 3, timestamp: 19_000, data: { source: 0, texts: [] } });
    const payloads = await engine.flash('anom_123', 20_000);
    expect(payloads).toHaveLength(1);
    const payload = payloads[0]!;
    expect(payload.manifest.triggering_anomaly_id).toBe('anom_123');
    expect(payload.manifest.has_baseline_snapshot).toBe(true);
    expect(payload.manifest.duration_ms).toBeLessThanOrEqual(REPLAY_WINDOW_MS);
    expect(payload.manifest.duration_ms).toBe(1_000);
    expect(payload.manifest.compression_algorithm).toBe('gzip');
    expect(payload.part_index).toBe(0);
    expect(payload.total_parts).toBe(1);
    expect(payload.payload).toBeInstanceOf(Uint8Array);
    const events = JSON.parse(new TextDecoder().decode(gunzipSync(payload.payload as Uint8Array))) as RRWebEvent[];
    expect(events[0]?.type).toBe(2);
    expect(events.some((event) => event.timestamp === 19_000)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://collector.test/v1/replays/upload');
    expect(init.headers).toMatchObject({
      'content-type': 'application/octet-stream',
      'x-askdepth-protocol-version': '0.1.0',
      'x-askdepth-write-key': 'pk_test_123',
      'x-askdepth-session-id': base.sessionId,
      'x-askdepth-slice-id': payload.manifest.slice_id,
      'x-askdepth-chunk-index': '0',
      'x-askdepth-total-chunks': '1',
    });
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect((init.body as Uint8Array).byteLength).toBe(payload.payload.length);
    expect(Array.from(init.body as Uint8Array)).toEqual(Array.from(payload.payload as Uint8Array));
  });

  it('splits a compressed blob larger than 500KB into ordered parts', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const engine = createReplayEngine({
      ...base,
      fetchImpl,
      compress: async () => ({ bytes: new Uint8Array(CHUNK_BYTES + 20), algorithm: 'gzip' as const }),
    });
    engine.push(snapshot(10_000));
    const payloads = await engine.flash('anom_123', 20_000);
    expect(payloads.map((payload) => payload.part_index)).toEqual([0, 1]);
    expect(new Set(payloads.map((payload) => payload.total_parts))).toEqual(new Set([2]));
    expect(new Set(payloads.map((payload) => payload.manifest.slice_id)).size).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((call) => (call[1] as RequestInit).body).every((body) => body instanceof Uint8Array)).toBe(true);
  });

  it('uploads chunks sequentially and stops without retrying on a permanent client error', async () => {
    const { postReplay } = await import('../src/upload.js');
    const fetchMock = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const payload = {
      manifest: {
        slice_id: '550e8400-e29b-41d4-a716-446655440000', triggering_anomaly_id: 'err_1',
        session_id: base.sessionId, environment: 'test', start_timestamp: 1_000, trigger_timestamp: 2_000,
        duration_ms: 1_000, has_baseline_snapshot: true, events_count: 1, uncompressed_byte_size: 100,
        compressed_byte_size: 3, compression_algorithm: 'gzip' as const,
      },
      payload: new Uint8Array([1, 2, 3]), part_index: 0, total_parts: 1,
    };
    await expect(postReplay('https://collector.test/upload', payload, base.writeKey, fetchMock as unknown as typeof fetch))
      .rejects.toThrow('Replay upload rejected with status 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not upload compressed slices over the ingest size limit', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const engine = createReplayEngine({
      ...base,
      fetchImpl,
      compress: async () => ({ bytes: new Uint8Array(4 * 1024 * 1024 + 1), algorithm: 'gzip' as const }),
    });
    engine.push(snapshot(10_000));
    await expect(engine.flash('anom_123', 20_000)).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps synchronous mutation work inside an 8ms budget', () => {
    const queued: Array<() => void> = [];
    let ticks = 0;
    const stamps = [0, 50];
    const engine = createReplayEngine({
      ...base,
      clock: () => stamps[Math.min(ticks++, stamps.length - 1)] ?? 0,
      schedule: (fn) => {
        queued.push(fn);
      },
    });
    engine.push({ type: 3, timestamp: 19_000, data: { source: 0, id: 1 } });
    engine.push({ type: 3, timestamp: 19_100, data: { source: 0, id: 2 } });
    expect(engine.dump()).toHaveLength(0);
    expect(queued).toHaveLength(1);
    queued[0]!();
    expect(engine.dump()).toHaveLength(1);
    expect(queued).toHaveLength(2);
  });

  it('locks concurrency and deduplicates simultaneous flash triggers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const engine = createReplayEngine({ ...base, fetchImpl });
    engine.push(snapshot(1_000));
    engine.push({ type: 3, timestamp: 19_000, data: { source: 0, texts: [] } });

    // Trigger two flash calls concurrently
    const [first, second] = await Promise.all([
      engine.flash('anomaly_a', 20_000),
      engine.flash('anomaly_b', 20_000),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('increments monotonic sequence_number on successive distinct flashes', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const engine = createReplayEngine({ ...base, fetchImpl });
    engine.push(snapshot(1_000));
    engine.push({ type: 3, timestamp: 10_000, data: { source: 0, texts: [] } });

    const [first] = await engine.flash('anom_1', 10_000);
    expect(first?.manifest.sequence_number).toBe(1);

    engine.push({ type: 3, timestamp: 25_000, data: { source: 0, texts: [] } });
    const [second] = await engine.flash('anom_2', 25_000);
    expect(second?.manifest.sequence_number).toBe(2);
  });

  it('retries on server error in postReplay', async () => {
    const { postReplay } = await import('../src/upload.js');
    let callCount = 0;
    const requests: RequestInit[] = [];
    const fetchMock = vi.fn(async () => {
      callCount++;
      requests.push(fetchMock.mock.calls[callCount - 1]![1] as RequestInit);
      if (callCount === 1) {
        return new Response('Server Error', { status: 500 });
      }
      return new Response('OK', { status: 200 });
    });

    const dummyPayload = {
      manifest: {
        slice_id: '550e8400-e29b-41d4-a716-446655440000',
        triggering_anomaly_id: 'err_1',
        session_id: 'sess_1',
        environment: 'test',
        start_timestamp: 1000,
        trigger_timestamp: 2000,
        duration_ms: 1000,
        has_baseline_snapshot: true,
        events_count: 1,
        uncompressed_byte_size: 100,
        compressed_byte_size: 50,
        compression_algorithm: 'gzip' as const,
      },
      payload: new Uint8Array([1, 2, 3]),
      part_index: 0,
      total_parts: 1,
    };

    await postReplay('https://collector.test/upload', dummyPayload, 'pk_test_123', fetchMock as unknown as typeof fetch);
    expect(callCount).toBe(2);
    expect(requests[0]?.headers).toEqual(requests[1]?.headers);
    expect(Array.from(requests[0]?.body as Uint8Array)).toEqual(Array.from(requests[1]?.body as Uint8Array));
  });

  it('throws an error when all retries are exhausted on 5xx responses', async () => {
    const { postReplay } = await import('../src/upload.js');
    const fetchMock = vi.fn(async () => new Response('Internal Server Error', { status: 502 }));
    const dummyPayload = {
      manifest: {
        slice_id: '550e8400-e29b-41d4-a716-446655440000',
        triggering_anomaly_id: 'err_1',
        session_id: 'sess_1',
        environment: 'test',
        start_timestamp: 1000,
        trigger_timestamp: 2000,
        duration_ms: 1000,
        has_baseline_snapshot: true,
        events_count: 1,
        uncompressed_byte_size: 100,
        compressed_byte_size: 50,
        compression_algorithm: 'gzip' as const,
      },
      payload: new Uint8Array([1, 2, 3]),
      part_index: 0,
      total_parts: 1,
    };

    await expect(
      postReplay('https://collector.test/upload', dummyPayload, 'pk_test_123', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('Upload failed with status 502');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
