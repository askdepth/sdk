import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEnvelopeSchema } from '@askdepth/contracts';
import { createQueue } from '../src/transport.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('telemetry transport', () => {
  it('retries a 429 batch with the same batch and event identifiers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    globalThis.fetch = fetchMock as typeof fetch;
    const queue = createQueue({
      meta: () => ({
        environment: 'development' as const,
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        endpoint: 'https://ingest.test/v1/telemetry',
        writeKey: 'public_arbitrary_write_key',
      }),
      onKill: () => undefined,
    });

    queue.enqueue({ type: 'track', name: 'signup' }, false);
    await queue.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body));
    expect(second.batch_id).toBe(first.batch_id);
    expect(second.events[0].event_id).toBe(first.events[0].event_id);
    expect(first.protocol_version).toBe('0.1.0');
    expect(first).not.toHaveProperty('project_id');
    expect(TelemetryEnvelopeSchema.parse(first)).toEqual(first);
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-askdepth-write-key']).toBe('public_arbitrary_write_key');
  });
});
