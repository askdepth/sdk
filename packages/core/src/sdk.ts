import { resetActivity, markNavigation } from './activity.js';
import { isBrowser } from './browser.js';
import { armDeadClick } from './dead.js';
import {
  correlateJsError,
  noteClick,
  resetErrors,
  type ErrorClick,
} from './errors.js';
import { asProjectId, newSessionId, newTraceId } from './ids.js';
import { isRapidAllowed, pushRageClick, resetRage, type ClickRecord, type RageClick } from './rage.js';
import { asElement, cssPath } from './selector.js';
import { currentTraceparent, installTrace, uninstallTrace } from './trace.js';
import { createQueue, type Queue } from './transport.js';
import type { DeadClick } from './dead.js';

export type ConsentState = 'granted' | 'denied' | 'unknown';

export interface AskdepthInitOptions {
  writeKey: string;
  endpoint?: string;
  consent?: ConsentState;
  sampleRate?: number;
  allowRapidClickSelectors?: string[];
  allowedTracingOrigins?: string[];
  projectId?: string;
  environment?: 'production' | 'staging' | 'development';
}

interface Runtime {
  key: string;
  options: AskdepthInitOptions;
  consent: ConsentState;
  sampled: boolean;
  sessionId: string | null;
  traceId: string;
  queue: Queue;
  cleanups: Array<() => void>;
  deadStops: Array<() => void>;
  listening: boolean;
  lastScrollAt: number;
}

let runtime: Runtime | null = null;
let terminated = false;
let warned = false;
let configWarned = false;

function warnOnce(message: string): void {
  if (configWarned) return;
  configWarned = true;
  console.warn(message);
}

function keyOf(options: AskdepthInitOptions): string {
  return [
    options.writeKey,
    options.endpoint ?? '',
    options.consent ?? 'unknown',
    String(options.sampleRate ?? 1),
    (options.allowRapidClickSelectors ?? []).join(','),
    (options.allowedTracingOrigins ?? []).join(','),
    options.projectId ?? '',
    options.environment ?? 'production',
  ].join('|');
}

function canCollect(): boolean {
  return Boolean(runtime && !terminated && runtime.consent === 'granted' && runtime.sampled && runtime.sessionId);
}

function emit(event: RageClick | DeadClick | ErrorClick, high: boolean): void {
  if (!canCollect() || !runtime) return;
  runtime.queue.enqueue(event, high);
}

const TOUCH_SCROLL_MS = 200;

function recordRage(el: Element, x: number, y: number, time: number): void {
  if (!runtime) return;
  if (isRapidAllowed(el, runtime.options.allowRapidClickSelectors ?? [])) return;
  const rec: ClickRecord = {
    x,
    y,
    time,
    target: el as HTMLElement,
    selector: cssPath(el),
    tag: el.tagName,
  };
  const rage = pushRageClick(rec);
  if (rage) emit(rage, true);
}

export function onPointerDown(event: PointerEvent): void {
  if (!canCollect() || !runtime) return;
  if (!event.isTrusted) return;
  const el = asElement(event.target);
  if (!el) return;
  if (event.pointerType === 'touch') {
    const started = Date.now();
    if (started - runtime.lastScrollAt < TOUCH_SCROLL_MS) return;
    const y = window.scrollY;
    const x = event.clientX;
    const py = event.clientY;
    const time = event.timeStamp || started;
    window.setTimeout(() => {
      if (!canCollect() || !runtime) return;
      if (runtime.lastScrollAt > started) return;
      if (Math.abs(window.scrollY - y) > 2) return;
      recordRage(el, x, py, time);
    }, 80);
    return;
  }
  recordRage(el, event.clientX, event.clientY, event.timeStamp || Date.now());
}

function onClick(event: MouseEvent): void {
  if (!canCollect() || !runtime) return;
  const el = asElement(event.target);
  if (!el) return;
  const selector = cssPath(el);
  noteClick({ selector, time: Date.now() });
  const stop = armDeadClick(el, (dead) => emit(dead, false));
  runtime.deadStops.push(stop);
  while (runtime.deadStops.length > 3) runtime.deadStops.shift()?.();
}

function onError(event: ErrorEvent): void {
  const err = event.error instanceof Error ? event.error : null;
  const found = correlateJsError(err?.message || event.message || 'Error', err?.stack, Date.now());
  if (found) emit(found, true);
}

export function onRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  const found = correlateJsError(message, stack, Date.now());
  if (found) emit(found, true);
}

function onScroll(): void {
  if (runtime) runtime.lastScrollAt = Date.now();
}

function onNav(): void {
  markNavigation();
}

function start(rt: Runtime): void {
  if (rt.listening || terminated) return;
  if (!rt.sessionId) rt.sessionId = newSessionId();
  rt.traceId = newTraceId();
  installTrace({
    traceId: rt.traceId,
    endpoint: rt.options.endpoint ?? '',
    allowedOrigins: rt.options.allowedTracingOrigins ?? [],
    onNetworkError: (event) => emit(event, true),
  });
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('popstate', onNav);
  window.addEventListener('hashchange', onNav);
  window.addEventListener('pagehide', rt.queue.beacon);
  document.addEventListener('visibilitychange', onHide);
  rt.cleanups.push(() => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('popstate', onNav);
    window.removeEventListener('hashchange', onNav);
    window.removeEventListener('pagehide', rt.queue.beacon);
    document.removeEventListener('visibilitychange', onHide);
  });
  rt.listening = true;
}

function onHide(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    runtime?.queue.beacon();
  }
}

function stopCollectors(rt: Runtime): void {
  for (const stop of rt.deadStops.splice(0)) stop();
  for (const fn of rt.cleanups.splice(0)) fn();
  rt.listening = false;
  uninstallTrace();
  resetRage();
  resetErrors();
  resetActivity();
  rt.queue.pause();
  rt.sessionId = null;
}

function teardown(): void {
  if (!runtime) return;
  stopCollectors(runtime);
  runtime.queue.stop();
  runtime = null;
}

function kill(): void {
  if (terminated) return;
  terminated = true;
  teardown();
  if (!warned) {
    warned = true;
    console.warn('[Askdepth SDK] Runtime deactivated by ingest server signal.');
  }
}

function boot(options: AskdepthInitOptions): void {
  const consent = options.consent ?? 'unknown';
  const sampleRate = options.sampleRate ?? 1;
  if (!asProjectId(options.projectId ?? options.writeKey)) {
    warnOnce('[Askdepth SDK] projectId must be a UUID or CUID. Network delivery is disabled.');
  }
  const queue = createQueue({
    meta: () => {
      if (!runtime?.sessionId || runtime.consent !== 'granted') return null;
      const projectId = asProjectId(options.projectId ?? options.writeKey);
      if (!projectId || !options.endpoint) return null;
      return {
        projectId,
        environment: options.environment ?? 'production',
        sessionId: runtime.sessionId,
        endpoint: options.endpoint,
        writeKey: options.writeKey,
      };
    },
    onKill: kill,
  });
  runtime = {
    key: keyOf(options),
    options,
    consent,
    sampled: Math.random() < sampleRate,
    sessionId: consent === 'granted' ? newSessionId() : null,
    traceId: '',
    queue,
    cleanups: [],
    deadStops: [],
    listening: false,
    lastScrollAt: 0,
  };
  if (runtime.consent === 'granted' && runtime.sampled) start(runtime);
}

export function init(options: AskdepthInitOptions): typeof Askdepth {
  if (!isBrowser()) return Askdepth;
  if (terminated) return Askdepth;
  if (!options.writeKey || !options.endpoint) {
    warnOnce('[Askdepth SDK] writeKey and endpoint are required.');
    return Askdepth;
  }
  const key = keyOf(options);
  if (runtime?.key === key) return Askdepth;
  if (runtime) teardown();
  boot(options);
  return Askdepth;
}

export function setConsent(consent: ConsentState): void {
  if (!isBrowser() || terminated || !runtime) return;
  runtime.consent = consent;
  if (consent !== 'granted') {
    stopCollectors(runtime);
    return;
  }
  if (runtime.sampled) start(runtime);
}

export function revokeConsent(): void {
  setConsent('denied');
}

export function track(name: string, properties?: Record<string, unknown>): void {
  if (!canCollect() || !name) return;
  runtime?.queue.enqueue(
    properties === undefined ? { type: 'track', name } : { type: 'track', name, properties },
    false,
  );
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!canCollect() || !userId) return;
  runtime?.queue.enqueue(
    traits === undefined ? { type: 'identify', user_id: userId } : { type: 'identify', user_id: userId, traits },
    false,
  );
}

export function getTraceparent(): string | null {
  if (!isBrowser() || !canCollect()) return null;
  return currentTraceparent();
}

export const Askdepth = {
  init,
  setConsent,
  revokeConsent,
  track,
  identify,
  getTraceparent,
};

export function resetSdkForTests(): void {
  terminated = false;
  warned = false;
  configWarned = false;
  teardown();
}
