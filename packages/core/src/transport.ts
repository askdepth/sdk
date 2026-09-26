import { SDK_NAME, SDK_VERSION, PROTOCOL_VERSION } from './version.js';
import { getNativeFetch } from './trace.js';

const MAX_EVENTS = 50;
const MAX_BYTES = 64 * 1024;
const FLUSH_COUNT = 10;
const FLUSH_MS = 2000;

export interface EnvelopeMeta {
  projectId: string;
  environment: 'production' | 'staging' | 'development';
  sessionId: string;
  endpoint: string;
  writeKey: string;
}

export interface Queued {
  event: unknown;
  bytes: number;
  high: boolean;
}

export function shouldKillResponse(status: number, headers: Headers, body: unknown): boolean {
  if (status === 410) return true;
  const killHeader = headers.get('x-askdepth-kill');
  if (killHeader && killHeader.toLowerCase() === 'true') return true;
  if (body && typeof body === 'object' && (body as { kill?: unknown }).kill === true) return true;
  return false;
}

export function createQueue(opts: {
  meta: () => EnvelopeMeta | null;
  onKill: () => void;
}) {
  const items: Queued[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

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
    const size = new TextEncoder().encode(JSON.stringify(event)).length;
    items.push({ event, bytes: size, high });
    bytes += size;
    trim();
    ensureTimer();
    if (high || items.length >= FLUSH_COUNT) void flush();
  };

  const clear = () => {
    items.length = 0;
    bytes = 0;
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
    'x-askdepth-protocol-version': String(PROTOCOL_VERSION),
    'x-askdepth-sdk-version': SDK_VERSION,
    'x-askdepth-sdk-name': SDK_NAME,
    'x-askdepth-write-key': meta.writeKey,
  });

  const bodyOf = (events: unknown[], meta: EnvelopeMeta) =>
    JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      sdk_name: SDK_NAME,
      sdk_version: SDK_VERSION,
      project_id: meta.projectId,
      environment: meta.environment,
      session_id: meta.sessionId,
      sent_at: new Date().toISOString(),
      events,
    });

  const flush = async () => {
    if (flushing || items.length === 0) return;
    const meta = opts.meta();
    if (!meta?.endpoint) {
      clear();
      return;
    }
    flushing = true;
    const events = items.splice(0, items.length).map((item) => item.event);
    bytes = 0;
    const body = bodyOf(events, meta);
    try {
      const response = await getNativeFetch()(meta.endpoint, {
        method: 'POST',
        headers: headersOf(meta),
        body,
        keepalive: true,
      });
      let parsed: unknown = null;
      try {
        parsed = await response.clone().json();
      } catch {
        parsed = null;
      }
      if (shouldKillResponse(response.status, response.headers, parsed)) opts.onKill();
    } catch {
      /* drop this batch */
    } finally {
      flushing = false;
      if (items.length >= FLUSH_COUNT) void flush();
    }
  };

  const beacon = () => {
    if (items.length === 0) return;
    const meta = opts.meta();
    if (!meta?.endpoint || typeof navigator === 'undefined') return;
    const events = items.splice(0, items.length).map((item) => item.event);
    bytes = 0;
    const body = bodyOf(events, meta);
    let ok = false;
    try {
      if (typeof navigator.sendBeacon === 'function') {
        ok = navigator.sendBeacon(meta.endpoint, new Blob([body], { type: 'application/json' }));
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      void getNativeFetch()(meta.endpoint, {
        method: 'POST',
        headers: headersOf(meta),
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  };

  return { enqueue, clear, flush, pause, stop, beacon, size: () => items.length };
}

export type Queue = ReturnType<typeof createQueue>;
