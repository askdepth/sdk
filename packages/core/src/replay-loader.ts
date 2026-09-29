import { onAnomaly, resetAnomalyBus, type AnomalySignal } from './anomaly-bus.js';

export interface ReplayRuntimeConfig {
  sessionId: string;
  environment: string;
  endpoint: string;
  writeKey: string;
  checkoutEveryNms?: number;
}

interface ReplayEngine {
  start: () => void;
  stop: () => void;
  flash: (anomalyId: string, triggerTimestamp?: number) => Promise<unknown>;
}

const IDLE_MS = 3_000;
const FRICTION_MS = 800;

let config: ReplayRuntimeConfig | null = null;
let engine: ReplayEngine | null = null;
let loading: Promise<ReplayEngine | null> | null = null;
let unsubscribe: (() => void) | null = null;
let pending: AnomalySignal[] = [];
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleHandle: number | null = null;
let onLoad: (() => void) | null = null;
let generation = 0;
let friction: number[] = [];

function cancelSchedule(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (idleHandle !== null && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(idleHandle);
    idleHandle = null;
  }
  if (onLoad && typeof window !== 'undefined') {
    window.removeEventListener('load', onLoad);
    onLoad = null;
  }
}

export function stopReplay(): void {
  generation += 1;
  cancelSchedule();
  unsubscribe?.();
  unsubscribe = null;
  engine?.stop();
  engine = null;
  loading = null;
  config = null;
  pending = [];
  friction = [];
  resetAnomalyBus();
}

function ensureSubscription(): void {
  if (unsubscribe) return;
  unsubscribe = onAnomaly((anomaly) => {
    if (!engine) {
      pending.push(anomaly);
      loadNow();
      return;
    }
    void engine.flash(anomaly.anomaly_id, anomaly.timestamp);
  });
}

export async function loadReplayModule(next: ReplayRuntimeConfig): Promise<ReplayEngine | null> {
  config = next;
  if (engine) return engine;
  if (loading) return loading;
  const gen = generation;
  ensureSubscription();
  loading = (async () => {
    try {
      const mod = await import('@askdepth/replay');
      if (gen !== generation) return null;
      const created = mod.createReplayEngine({
        sessionId: next.sessionId,
        environment: next.environment,
        endpoint: next.endpoint,
        writeKey: next.writeKey,
        ...(next.checkoutEveryNms !== undefined ? { checkoutEveryNms: next.checkoutEveryNms } : {}),
      }) as ReplayEngine;
      created.start();
      if (gen !== generation) {
        created.stop();
        return null;
      }
      engine = created;
      if (pending.length > 0) {
        const queued = pending.splice(0);
        for (const anomaly of queued) {
          void created.flash(anomaly.anomaly_id, anomaly.timestamp);
        }
      }
      return created;
    } catch (err) {
      console.warn('[Askdepth] Failed to dynamically load replay module', err);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function loadNow(): void {
  if (!config) return;
  const next = config;
  cancelSchedule();
  void loadReplayModule(next);
}

function scheduleIdle(): void {
  cancelSchedule();
  const run = () => {
    onLoad = null;
    const ric = globalThis.requestIdleCallback;
    if (typeof ric === 'function') {
      idleHandle = ric(() => loadNow(), { timeout: IDLE_MS });
      return;
    }
    idleTimer = setTimeout(() => loadNow(), IDLE_MS);
  };
  if (typeof document === 'undefined' || document.readyState === 'complete') {
    run();
    return;
  }
  onLoad = run;
  window.addEventListener('load', run, { once: true });
}

export function armReplay(next: ReplayRuntimeConfig): void {
  config = next;
  ensureSubscription();
  if (engine || loading) return;
  scheduleIdle();
}

/** Two clicks inside 800ms predict a rage click, so load the recorder immediately. */
export function noteFriction(time: number): void {
  if (!config || engine) return;
  friction.push(time);
  while (friction.length > 0 && time - friction[0]! > FRICTION_MS) friction.shift();
  if (friction.length >= 2) {
    friction = [];
    loadNow();
  }
}
