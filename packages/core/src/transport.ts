import { newSessionId } from './ids.js';
import { getNativeFetch } from './trace.js';
import { SDK_NAME, SDK_VERSION, PROTOCOL_VERSION } from './version.js';

const MAX_EVENTS = 50;
const MAX_BYTES = 64 * 1024;
const FLUSH_COUNT = 10;
const FLUSH_MS = 2000;
const MAX_RETRY_DELAY_MS = 30_000;

export interface EnvelopeMeta {
  environment: 'production' | 'staging' | 'development';
  sessionId: string;
  endpoint: string;
  writeKey: string;
}

export interface Queued {
  event: unknown;
  eventId: string;
  timestamp: string;
  bytes: number;
  high: boolean;
}

interface Batch {
  body: string;
  attempts: number;
}

export function shouldKillResponse(status: number, headers: Headers, body: unknown): boolean {
  if (status === 410) return true;
  const killHeader = headers.get('x-askdepth-kill');
  if (killHeader && killHeader.toLowerCase() === 'true') return true;
  if (body && typeof body === 'object' && (body as { kill?: unknown }).kill === true) return true;
  return false;
}

function asRecord(event: unknown): Record<string, unknown> {
  return event && typeof event === 'object' ? event as Record<string, unknown> : { value: event };
}

export function createQueue(opts: {
  meta: () => EnvelopeMeta | null;
  onKill: () => void;
}) {
  const items: Queued[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let pending: Batch | null = null;

  const trim = () => {
    while (items.length > MAX_EVENTS || bytes > MAX_BYTES) {
      const low = items.findIndex((item) => !item.high);
      const index = low === -1 ? 0 : low;
      const dropped = items.splice(index, 1)[0];
      if (!dropped) break;
      bytes -= dropped.bytes;
    }
    if (bytes < 0) bytes = 0;
  };

  const enqueue = (event: unknown, high: boolean) => {
    const eventId = newSessionId();
    const timestamp = new Date().toISOString();
    const size = new TextEncoder().encode(JSON.stringify({ ...asRecord(event), event_id: eventId, timestamp })).length;
    items.push({ event, eventId, timestamp, bytes: size, high });
    bytes += size;
    trim();
    ensureTimer();
    if (high || items.length >= FLUSH_COUNT) void flush();
  };

  const clear = () => {
    items.length = 0;
    bytes = 0;
    pending = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const ensureTimer = () => {
    if (timer) return;
    timer = setInterval(() => {
      void flush();
    }, FLUSH_MS);
    if (typeof timer === 'object' && timer && 'unref' in timer) timer.unref();
  };

  const pause = () => {
    if (timer) clearInterval(timer);
    timer = null;
    clear();
  };

  const stop = () => {
    pause();
  };

  const headersOf = (meta: EnvelopeMeta): Record<string, string> => ({
    'content-type': 'application/json',
    'x-askdepth-protocol-version': PROTOCOL_VERSION,
    'x-askdepth-sdk-version': SDK_VERSION,
    'x-askdepth-sdk-name': SDK_NAME,
    'x-askdepth-write-key': meta.writeKey,
  });

  const bodyOf = (events: Queued[], meta: EnvelopeMeta) =>
    JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      sdk_name: SDK_NAME,
      sdk_version: SDK_VERSION,
      environment: meta.environment,
      session_id: meta.sessionId,
      batch_id: newSessionId(),
      sent_at: new Date().toISOString(),
      events: events.map(({ event, eventId, timestamp }) => ({
        ...asRecord(event),
        event_id: eventId,
        timestamp,
      })),
    });

  const retryDelay = (headers: Headers | null, attempts: number): number => {
    const value = headers?.get('retry-after');
    if (value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
      const date = Date.parse(value);
      if (!Number.isNaN(date)) return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
    }
    return Math.min(1000 * 2 ** Math.min(attempts, 5), MAX_RETRY_DELAY_MS);
  };

  const scheduleRetry = (batch: Batch, delay: number) => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void deliver(batch);
    }, delay);
  };

  const deliver = async (batch: Batch): Promise<void> => {
    const meta = opts.meta();
    if (!meta?.endpoint || pending !== batch) return;
    flushing = true;
    try {
      const response = await getNativeFetch()(meta.endpoint, {
        method: 'POST',
        headers: headersOf(meta),
        body: batch.body,
        keepalive: true,
      });
      let parsed: unknown = null;
      try {
        parsed = await response.clone().json();
      } catch {
        parsed = null;
      }
      if (shouldKillResponse(response.status, response.headers, parsed)) {
        opts.onKill();
        return;
      }
      if (response.status === 429 || response.status >= 500) {
        batch.attempts += 1;
        scheduleRetry(batch, retryDelay(response.headers, batch.attempts));
      } else {
        pending = null;
      }
    } catch {
      batch.attempts += 1;
      scheduleRetry(batch, retryDelay(null, batch.attempts));
    } finally {
      flushing = false;
      if (!pending && items.length >= FLUSH_COUNT) void flush();
    }
  };

  const flush = async () => {
    if (flushing || pending || items.length === 0) return;
    const meta = opts.meta();
    if (!meta?.endpoint) {
      clear();
      return;
    }
    const events = items.splice(0, items.length);
    bytes = 0;
    pending = { body: bodyOf(events, meta), attempts: 0 };
    await deliver(pending);
  };

  const beacon = () => {
    // sendBeacon cannot carry the required write-key header; fetch keepalive preserves authentication.
    const meta = opts.meta();
    if (!meta?.endpoint) {
      clear();
      return;
    }
    const sendKeepalive = (body: string) => {
      void getNativeFetch()(meta.endpoint, {
        method: 'POST',
        headers: headersOf(meta),
        body,
        keepalive: true,
      }).catch(() => undefined);
    };

    // Resend the stable pending body in case its in-flight request is interrupted by navigation.
    if (pending) sendKeepalive(pending.body);
    if (items.length === 0) return;

    const queued = items.splice(0, items.length);
    bytes = 0;
    sendKeepalive(bodyOf(queued, meta));
  };

  return { enqueue, clear, flush, pause, stop, beacon, size: () => items.length };
}

export type Queue = ReturnType<typeof createQueue>;
