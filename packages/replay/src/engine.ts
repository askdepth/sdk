import { record } from '@rrweb/record';
import type { RRWebEvent, ReplayUploadPayload } from '@askdepth/contracts';
import { byteSize, encodeText, maxBufferBytes, splitBytes } from './bytes.js';
import { compressBytes, type Compressed } from './compress.js';
import {
  CHECKOUT_EVERY_MS,
  CHUNK_BYTES,
  FRAME_BUDGET_MS,
  FULL_SNAPSHOT,
  INCREMENTAL_SNAPSHOT,
  REPLAY_WINDOW_MS,
  SOURCE_MOUSE_MOVE,
  SOURCE_MUTATION,
  SOURCE_TOUCH_MOVE,
} from './constants.js';
import { createEventSanitizer, sanitizeEvent } from './mask.js';
import { createRecordOptions } from './record-options.js';
import { RingBuffer } from './ring-buffer.js';
import { postReplay } from './upload.js';

const MAX_PENDING = 500;
const FLASH_COOLDOWN_MS = 1000;

export interface RecorderHandle {
  stop: () => void;
  checkpoint: () => void;
}

export interface ReplayEngineConfig {
  sessionId: string;
  environment: string;
  endpoint: string;
  windowMs?: number;
  checkoutEveryNms?: number;
  maxBytes?: number;
  now?: () => number;
  clock?: () => number;
  schedule?: (fn: () => void) => void;
  fetchImpl?: typeof fetch;
  recorder?: (emit: (event: RRWebEvent) => void) => RecorderHandle;
  compress?: (input: Uint8Array) => Promise<Compressed>;
  memoryPressure?: () => boolean;
  userAgent?: string;
}

export interface ReplayInstance {
  start: () => void;
  stop: () => void;
  push: (event: RRWebEvent) => void;
  dump: () => RRWebEvent[];
  flash: (anomalyId: string, triggerTimestamp?: number) => Promise<ReplayUploadPayload[]>;
}

function defaultClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultSchedule(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else queueMicrotask(fn);
}

function defaultPressure(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  if (nav && typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 1) return true;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (!memory || memory.jsHeapSizeLimit <= 0) return false;
  return memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.85;
}

export function createReplayEngine(config: ReplayEngineConfig): ReplayInstance {
  const now = config.now ?? (() => Date.now());
  const clock = config.clock ?? defaultClock;
  const schedule = config.schedule ?? defaultSchedule;
  const fetchImpl = config.fetchImpl ?? fetch;
  const compress = config.compress ?? ((input: Uint8Array) => compressBytes(input));
  const memoryPressure = config.memoryPressure ?? defaultPressure;
  const userAgent = config.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const windowMs = config.windowMs ?? REPLAY_WINDOW_MS;

  let handle: RecorderHandle | null = null;
  const buffer = new RingBuffer({
    windowMs,
    maxBytes: config.maxBytes ?? maxBufferBytes(userAgent),
    now,
    onPressure: () => handle?.checkpoint(),
  });
  const sanitizer = createEventSanitizer();
  const pending: RRWebEvent[] = [];
  let scheduled = false;
  let running = false;
  let removeVisibility: (() => void) | null = null;
  let removeRoute: (() => void) | null = null;

  // Flash concurrency & deduplication state
  let flashingPromise: Promise<ReplayUploadPayload[]> | null = null;
  let lastFlashTimestamp = 0;
  let lastFlashPayloads: ReplayUploadPayload[] = [];
  let sequenceNumber = 0;

  const flushBudget = () => {
    const start = clock();
    let processed = 0;
    while (pending.length > 0) {
      if (processed > 0 && clock() - start >= FRAME_BUDGET_MS) {
        kick();
        return;
      }
      const event = pending.shift();
      if (event) buffer.push(event);
      processed += 1;
      if (memoryPressure()) buffer.dropPointerSamples();
    }
  };

  const kick = () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      flushBudget();
    });
  };

  const enqueue = (event: RRWebEvent) => {
    const clean = sanitizer.sanitize(event);
    if (clean.type === FULL_SNAPSHOT) {
      buffer.push(clean);
      return;
    }
    // Backpressure protection: prevent unbounded pending queue memory growth
    if (pending.length >= MAX_PENDING) {
      const reduced = pending.filter((e) => {
        if (e.type === FULL_SNAPSHOT) return true;
        if (e.type === INCREMENTAL_SNAPSHOT && (e.data as { source?: unknown })?.source === SOURCE_MUTATION) return true;
        const src = (e.data as { source?: unknown })?.source;
        return src !== SOURCE_MOUSE_MOVE && src !== SOURCE_TOUCH_MOVE;
      });
      pending.length = 0;
      pending.push(...reduced);
    }
    pending.push(clean);
    kick();
  };

  const flushAll = () => {
    scheduled = false;
    while (pending.length > 0) {
      const event = pending.shift();
      if (event) buffer.push(event);
    }
  };

  const onHide = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flushAll();
      buffer.dropPointerSamples();
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onHide);
        removeVisibility = () => document.removeEventListener('visibilitychange', onHide);
      }
      if (config.recorder) {
        handle = config.recorder(enqueue);
        return;
      }
      bootNative();
    },
    stop() {
      running = false;
      flushAll();
      buffer.clear();
      sanitizer.clear();
      flashingPromise = null;
      lastFlashPayloads = [];
      handle?.stop();
      handle = null;
      removeVisibility?.();
      removeVisibility = null;
      removeRoute?.();
      removeRoute = null;
    },
    push(event) {
      enqueue(event);
    },
    dump() {
      return buffer.slice(now());
    },
    async flash(anomalyId, triggerTimestamp) {
      const trigger = triggerTimestamp ?? now();

      // Deduplication & Concurrency lock: reuse in-flight flash or recent identical slice
      if (flashingPromise) {
        return flashingPromise;
      }
      if (trigger - lastFlashTimestamp < FLASH_COOLDOWN_MS && lastFlashPayloads.length > 0) {
        return lastFlashPayloads;
      }

      flashingPromise = (async () => {
        try {
          flushAll();
          const events = buffer.slice(trigger).filter((event) => event.timestamp <= trigger);
          const baseline = buffer.baseline;
          const mutations = events.filter((event) => event.type !== FULL_SNAPSHOT);
          const firstMutation = mutations[0];
          const start = firstMutation?.timestamp ?? baseline?.timestamp ?? trigger;
          const duration = Math.min(windowMs, Math.max(0, trigger - (firstMutation ? firstMutation.timestamp : trigger)));
          if (events.length === 0) return [];

          sequenceNumber += 1;
          const sliceId = crypto.randomUUID();
          const json = JSON.stringify(events);
          const raw = encodeText(json);
          const compressed = await compress(raw);
          const parts = splitBytes(compressed.bytes, CHUNK_BYTES);

          const payloads: ReplayUploadPayload[] = parts.map((part, index) => {
            const bytes = new Uint8Array(new ArrayBuffer(part.byteLength));
            bytes.set(part);
            return {
              manifest: {
                slice_id: sliceId,
                triggering_anomaly_id: anomalyId,
                session_id: config.sessionId,
                environment: config.environment,
                start_timestamp: start,
                trigger_timestamp: trigger,
                duration_ms: duration,
                has_baseline_snapshot: Boolean(baseline) || events.some((event) => event.type === FULL_SNAPSHOT),
                events_count: events.length,
                uncompressed_byte_size: byteSize(events),
                compressed_byte_size: compressed.bytes.byteLength,
                compression_algorithm: compressed.algorithm,
                sequence_number: sequenceNumber,
              },
              payload: bytes,
              part_index: index,
              total_parts: parts.length,
            };
          });

          await Promise.all(
            payloads.map(async (payload) => {
              try {
                await postReplay(config.endpoint, payload, fetchImpl);
              } catch (err) {
                console.warn('[Askdepth] Failed to upload replay slice', err);
              }
            }),
          );

          lastFlashTimestamp = trigger;
          lastFlashPayloads = payloads;
          return payloads;
        } finally {
          flashingPromise = null;
        }
      })();

      return flashingPromise;
    },
  };

  function bootNative(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!running) return;
    const options = createRecordOptions({
      emit: (event, isCheckout) => {
        if (isCheckout && event.type !== FULL_SNAPSHOT) {
          enqueue({ ...event, type: FULL_SNAPSHOT });
          return;
        }
        enqueue(event);
      },
      ...(config.checkoutEveryNms !== undefined ? { checkoutEveryNms: config.checkoutEveryNms } : { checkoutEveryNms: CHECKOUT_EVERY_MS }),
      userAgent,
    });
    const stop = record(options);
    const checkpoint = () => {
      record.takeFullSnapshot(true);
    };
    handle = {
      stop: () => stop?.(),
      checkpoint,
    };
    removeRoute = watchRoutes(checkpoint);
  }
}

function watchRoutes(checkpoint: () => void): () => void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return () => undefined;
  const push = history.pushState;
  const replace = history.replaceState;
  let lastCheckpoint = 0;
  const safeCheckpoint = () => {
    const nowTime = Date.now();
    // Throttle to at most 1 full snapshot per 1000ms to avoid freezing main thread on rapid query param updates
    if (nowTime - lastCheckpoint < 1000) return;
    lastCheckpoint = nowTime;
    checkpoint();
  };
  history.pushState = (...args: Parameters<History['pushState']>) => {
    push.apply(history, args);
    safeCheckpoint();
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    replace.apply(history, args);
    safeCheckpoint();
  };
  const onRoute = () => safeCheckpoint();
  window.addEventListener('popstate', onRoute);
  window.addEventListener('hashchange', onRoute);
  return () => {
    history.pushState = push;
    history.replaceState = replace;
    window.removeEventListener('popstate', onRoute);
    window.removeEventListener('hashchange', onRoute);
  };
}
