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
    expect(first.events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(second.events[0].timestamp).toBe(first.events[0].timestamp);
    expect(first.protocol_version).toBe('0.1.0');
    expect(first).not.toHaveProperty('project_id');
    expect(TelemetryEnvelopeSchema.parse(first)).toEqual(first);
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-askdepth-write-key']).toBe('public_arbitrary_write_key');
  });

  it('retains queued events on page hide while an earlier batch is pending', async () => {
    let resolveFirst: (response: Response) => void = () => undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn<() => Promise<Response>>()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
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

    queue.enqueue({ type: 'track', name: 'in_flight' }, true);
    queue.enqueue({ type: 'track', name: 'queued_before_hide' }, false);
    queue.beacon();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requests = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(requests[0].events[0].name).toBe('in_flight');
    expect(requests[1].batch_id).toBe(requests[0].batch_id);
    expect(requests[2].events[0].name).toBe('queued_before_hide');
    expect(queue.size()).toBe(1);

    resolveFirst(new Response(null, { status: 202 }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const retried = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(retried.batch_id).toBe(requests[2].batch_id);
    expect(retried.events[0].event_id).toBe(requests[2].events[0].event_id);
    queue.stop();
  });

  it('retries a failed page-hide keepalive request with stable identifiers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
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

    queue.enqueue({ type: 'track', name: 'hidden' }, false);
    queue.beacon();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(second.batch_id).toBe(first.batch_id);
    expect(second.events[0].event_id).toBe(first.events[0].event_id);
    queue.stop();
  });

  it('retries a rejected page-hide keepalive request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
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

    queue.enqueue({ type: 'track', name: 'hidden' }, false);
    queue.beacon();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[0]?.[1]?.body);
    queue.stop();
  });
});
