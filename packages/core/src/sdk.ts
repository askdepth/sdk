import { resetActivity, markNavigation } from './activity.js';
import { publishAnomaly } from './anomaly-bus.js';
import { isBrowser } from './browser.js';
import { armDeadClick } from './dead.js';
import {
  caughtReactError,
  correlateJsError,
  noteClick,
  resetErrors,
  type ErrorClick,
} from './errors.js';
import { newSessionId, newTraceId } from './ids.js';
import { armReplay, noteFriction, stopReplay } from './replay-loader.js';
import { isRapidAllowed, pushRageClick, resetRage, type ClickRecord, type RageClick } from './rage.js';
import { asElement, cssPath } from './selector.js';
import { currentTraceparent, installTrace, uninstallTrace } from './trace.js';
import { createQueue, type Queue } from './transport.js';
import { sanitizeCustomProperties } from './custom-properties.js';
import type { DeadClick } from './dead.js';

export type ConsentState = 'granted' | 'denied' | 'unknown';

/** Static source/component identifiers only. Never pass props, DOM text, or user data. */
export interface ComponentLocation {
  componentName: string;
  componentStack: string[];
  sourceAttr?: string;
  hashId?: string;
}

export type ComponentResolver = (target: Element) => ComponentLocation | null;

export interface AskdepthInitOptions {
  writeKey: string;
  endpoint?: string;
  consent?: ConsentState;
  sampleRate?: number;
  allowRapidClickSelectors?: string[];
  allowedTracingOrigins?: string[];
  /** Deprecated client metadata. Ingest derives project ownership from writeKey. */
  projectId?: string;
  environment?: 'production' | 'staging' | 'development';
  /** Opt-in session replay. `true` loads `@askdepth/replay` on idle; an object can override the upload URL. */
  replay?: boolean | { endpoint?: string; checkoutEveryNms?: number };
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
  replay: boolean;
  replayEndpoint: string;
  checkoutEveryNms?: number;
}

let runtime: Runtime | null = null;
let terminated = false;
let warned = false;
let configWarned = false;
const componentResolvers = new Set<{ resolver: ComponentResolver }>();

function safeName(value: string): string | null {
  return /^[A-Za-z_$][A-Za-z0-9_$.() -]*$/.test(value) && value.length <= 120 ? value : null;
}

function componentOf(target: Element): NonNullable<RageClick['component']> | undefined {
  const registration = [...componentResolvers].at(-1);
  if (!registration) return undefined;
  try {
    const location = registration.resolver(target);
    if (!location) return undefined;
    const rawName = safeName(location.componentName);
    const source = location.sourceAttr;
    const hash = location.hashId;
    const hasSource = Boolean(source && source.length <= 200 && !source.startsWith('/') && !source.split('/').includes('..') && /^[A-Za-z0-9_./:@-]+$/.test(source));
    const hasHash = Boolean(hash && hash.length <= 64 && /^[A-Za-z0-9_-]+$/.test(hash));
    const name = rawName ?? (hasSource || hasHash ? 'Anonymous' : null);
    if (!name) return undefined;
    const stack = location.componentStack.slice(0, 8).map(safeName).filter((part): part is string => part !== null);
    return {
      name,
      stack,
      ...(hasSource && source ? { source } : {}),
      ...(hasHash && hash ? { hash_id: hash } : {}),
    };
  } catch {
    return undefined;
  }
}

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
    replayKey(options),
  ].join('|');
}

function replayKey(options: AskdepthInitOptions): string {
  if (options.replay === true) return 'replay';
  if (!options.replay) return '';
  return `replay:${options.replay.endpoint ?? ''}:${options.replay.checkoutEveryNms ?? ''}`;
}

function replayEndpointOf(options: AskdepthInitOptions): string {
  if (typeof options.replay === 'object' && options.replay.endpoint) return options.replay.endpoint;
  const base = options.endpoint ?? '';
  try {
    return new URL('/v1/replays/upload', base).toString();
  } catch {
    return `${base.replace(/\/$/, '')}/v1/replays/upload`;
  }
}

function replayEnabled(options: AskdepthInitOptions): boolean {
  return options.replay === true || (typeof options.replay === 'object' && options.replay !== null);
}

function canCollect(): boolean {
  return Boolean(runtime && !terminated && runtime.consent === 'granted' && runtime.sampled && runtime.sessionId);
}

function emit(event: RageClick | DeadClick | ErrorClick, high: boolean): void {
  if (!canCollect() || !runtime) return;
  if (runtime.replay) {
    publishAnomaly({
      anomaly_id: newSessionId(),
      type: event.type,
      timestamp: Date.now(),
    });
  }
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
  if (rage) {
    const component = componentOf(el);
    emit(component ? { ...rage, component } : rage, true);
  }
}

export function onPointerDown(event: PointerEvent): void {
  if (!canCollect() || !runtime) return;
  if (!event.isTrusted) return;
  const el = asElement(event.target);
  if (!el) return;
  if (runtime.replay) noteFriction(Date.now());
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
  const stop = armDeadClick(el, (dead) => {
    const component = componentOf(el);
    emit(component ? { ...dead, component } : dead, false);
  });
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
  if (rt.replay) {
    armReplay({
      sessionId: rt.sessionId,
      environment: rt.options.environment ?? 'production',
      endpoint: rt.replayEndpoint,
      writeKey: rt.options.writeKey,
      ...(rt.checkoutEveryNms !== undefined ? { checkoutEveryNms: rt.checkoutEveryNms } : {}),
    });
  }
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
  stopReplay();
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
  const queue = createQueue({
    meta: () => {
      if (!runtime?.sessionId || runtime.consent !== 'granted') return null;
      if (!options.endpoint) return null;
      return {
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
    replay: replayEnabled(options),
    replayEndpoint: replayEndpointOf(options),
    ...(typeof options.replay === 'object' && options.replay.checkoutEveryNms !== undefined
      ? { checkoutEveryNms: options.replay.checkoutEveryNms }
      : {}),
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
  const eventName = name.trim().slice(0, 200);
  if (!canCollect() || !eventName) return;
  const sanitized = properties && sanitizeCustomProperties(properties);
  runtime?.queue.enqueue(
    sanitized === undefined ? { type: 'track', name: eventName } : { type: 'track', name: eventName, properties: sanitized },
    false,
  );
}

/** Register a component resolver for frustration events. Unsubscribe on provider unmount. */
export function registerComponentResolver(resolver: ComponentResolver): () => void {
  const registration = { resolver };
  componentResolvers.add(registration);
  return () => { componentResolvers.delete(registration); };
}

/** Publish a caught React exception through the anomaly and replay pipeline. */
export function reportCaughtError(error: Error, target?: Element | null, componentStack?: string): void {
  if (!canCollect()) return;
  const event = caughtReactError(error, Date.now(), componentStack);
  const component = target ? componentOf(target) : undefined;
  emit(component ? { ...event, component } : event, true);
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  const safeUserId = userId.trim().slice(0, 200);
  if (!canCollect() || !safeUserId) return;
  const sanitized = traits && sanitizeCustomProperties(traits);
  runtime?.queue.enqueue(
    sanitized === undefined ? { type: 'identify', user_id: safeUserId } : { type: 'identify', user_id: safeUserId, traits: sanitized },
    false,
  );
}

export function getTraceparent(): string | null {
  if (!isBrowser() || !canCollect()) return null;
  return currentTraceparent();
}

export function getSessionId(): string | null {
  if (!isBrowser() || terminated || !runtime) return null;
  return runtime.sessionId;
}

export function isInitialized(): boolean {
  return Boolean(isBrowser() && !terminated && runtime?.listening);
}

export const Askdepth = {
  init,
  setConsent,
  revokeConsent,
  track,
  registerComponentResolver,
  reportCaughtError,
  identify,
  getTraceparent,
  getSessionId,
  isInitialized,
};

export function resetSdkForTests(): void {
  componentResolvers.clear();
  terminated = false;
  warned = false;
  configWarned = false;
  teardown();
  stopReplay();
}
