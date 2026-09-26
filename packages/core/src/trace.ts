import { markNetwork } from './activity.js';
import { correlateNetworkError } from './errors.js';
import { newSpanId } from './ids.js';

type FetchFn = typeof fetch;
type XhrBag = { method: string; url: string; t: number; traced: boolean; off?: () => void };

let nativeFetch: FetchFn | null = null;
let patchedFetch: FetchFn | null = null;
let nativeOpen: typeof XMLHttpRequest.prototype.open | null = null;
let patchedOpen: typeof XMLHttpRequest.prototype.open | null = null;
let nativeSend: typeof XMLHttpRequest.prototype.send | null = null;
let patchedSend: typeof XMLHttpRequest.prototype.send | null = null;
let tracing = false;
let traceId = '';
let endpoint = '';
let allowedOrigins: string[] = [];
let onError: ((event: NonNullable<ReturnType<typeof correlateNetworkError>>) => void) | null = null;

export function getNativeFetch(): FetchFn {
  if (nativeFetch) return nativeFetch;
  return globalThis.fetch.bind(globalThis);
}

function parentHeader(): string {
  return `00-${traceId}-${newSpanId()}-01`;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isIngestUrl(url: string): boolean {
  return Boolean(endpoint) && url.startsWith(endpoint);
}

/** Same-origin, or an explicit allow-list. Never third-party by default (CORS preflight). */
export function shouldTrace(url: string): boolean {
  if (!url || isIngestUrl(url)) return false;
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const resolved = new URL(url, base);
    if (typeof location !== 'undefined' && resolved.origin === location.origin) return true;
    return allowedOrigins.some((origin) => resolved.origin === origin || resolved.href.startsWith(origin));
  } catch {
    return false;
  }
}

function reportNetwork(method: string, url: string, status: number, started: number): void {
  try {
    const event = correlateNetworkError(method, url, status, Date.now() - started, Date.now());
    if (event) onError?.(event);
  } catch {
    /* never block the caller */
  }
}

export function installTrace(opts: {
  traceId: string;
  endpoint: string;
  allowedOrigins?: string[];
  onNetworkError: (event: NonNullable<ReturnType<typeof correlateNetworkError>>) => void;
}): void {
  if (!nativeFetch || globalThis.fetch !== patchedFetch) nativeFetch = globalThis.fetch.bind(globalThis);
  tracing = true;
  traceId = opts.traceId;
  endpoint = opts.endpoint;
  allowedOrigins = opts.allowedOrigins ?? [];
  onError = opts.onNetworkError;

  const orig = nativeFetch;
  if (!patchedFetch || globalThis.fetch !== patchedFetch) {
    patchedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!tracing) return orig(input, init);
      const url = urlOf(input);
      const own = isIngestUrl(url);
      if (!own) markNetwork();
      const method = (
        init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      const started = Date.now();
      const trace = shouldTrace(url);
      let response: Response;
      try {
        if (trace && typeof Request !== 'undefined' && input instanceof Request && !input.bodyUsed) {
          const headers = new Headers(input.headers);
          if (!headers.has('traceparent')) headers.set('traceparent', parentHeader());
          response = await orig(new Request(input, { headers }));
        } else if (trace && !(typeof Request !== 'undefined' && input instanceof Request)) {
          const headers = new Headers(init?.headers);
          if (!headers.has('traceparent')) headers.set('traceparent', parentHeader());
          response = await orig(input, { ...init, headers });
        } else {
          response = await orig(input, init);
        }
      } catch (error) {
        if (!own) reportNetwork(method, url, 0, started);
        throw error;
      }
      if (!own && response.status >= 400) reportNetwork(method, url, response.status, started);
      return response;
    }) as FetchFn;
    globalThis.fetch = patchedFetch;
  }

  if (patchedOpen && XMLHttpRequest.prototype.open === patchedOpen) return;
  nativeOpen = XMLHttpRequest.prototype.open;
  nativeSend = XMLHttpRequest.prototype.send;

  patchedOpen = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    if (!tracing) return nativeOpen!.call(this, method, url, async ?? true, username, password);
    const href = String(url);
    const bag: XhrBag = { method, url: href, t: Date.now(), traced: shouldTrace(href) };
    (this as XMLHttpRequest & { __ask?: XhrBag }).__ask = bag;
    return nativeOpen!.call(this, method, url, async ?? true, username, password);
  };

  patchedSend = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (!tracing) return nativeSend!.call(this, body);
    const host = this as XMLHttpRequest & { __ask?: XhrBag };
    const meta = host.__ask;
    host.__ask?.off?.();
    const own = Boolean(meta && isIngestUrl(meta.url));
    if (!own) markNetwork();
    try {
      if (meta?.traced) this.setRequestHeader('traceparent', parentHeader());
    } catch {
      /* header already sent or forbidden — still send */
    }
    const onDone = (status: number) => {
      host.__ask?.off?.();
      if (host.__ask) delete host.__ask.off;
      if (!meta || own) return;
      if (status === 0 || status >= 400) reportNetwork(meta.method, meta.url, status, meta.t);
    };
    const onLoad = () => onDone(this.status);
    const onFail = () => onDone(0);
    this.addEventListener('load', onLoad);
    this.addEventListener('error', onFail);
    this.addEventListener('timeout', onFail);
    this.addEventListener('abort', onFail);
    if (meta) {
      meta.off = () => {
        if (typeof this.removeEventListener !== 'function') return;
        this.removeEventListener('load', onLoad);
        this.removeEventListener('error', onFail);
        this.removeEventListener('timeout', onFail);
        this.removeEventListener('abort', onFail);
      };
    }
    return nativeSend!.call(this, body);
  };

  XMLHttpRequest.prototype.open = patchedOpen;
  XMLHttpRequest.prototype.send = patchedSend;
}

export function currentTraceparent(): string | null {
  if (!traceId) return null;
  return parentHeader();
}

export function uninstallTrace(): void {
  tracing = false;
  if (patchedFetch && globalThis.fetch === patchedFetch && nativeFetch) {
    globalThis.fetch = nativeFetch;
  }
  if (patchedOpen && XMLHttpRequest.prototype.open === patchedOpen && nativeOpen) {
    XMLHttpRequest.prototype.open = nativeOpen;
  }
  if (patchedSend && XMLHttpRequest.prototype.send === patchedSend && nativeSend) {
    XMLHttpRequest.prototype.send = nativeSend;
  }
  patchedFetch = null;
  patchedOpen = null;
  patchedSend = null;
  nativeFetch = null;
  nativeOpen = null;
  nativeSend = null;
  traceId = '';
  endpoint = '';
  allowedOrigins = [];
  onError = null;
}
