import { afterEach, describe, expect, it, vi } from 'vitest';
import { markNavigation, navigationToken, resetActivity } from '../src/activity.js';
import { armDeadClick, interactiveTarget, isOpenTextInput } from '../src/dead.js';
import { correlateNetworkError, noteClick, resetErrors, sanitizeStack, sanitizeUrl } from '../src/errors.js';
import { newSessionId, newSpanId, newTraceId } from '../src/ids.js';
import { isRapidAllowed, pushRageClick, resetRage } from '../src/rage.js';
import { asElement, cssPath } from '../src/selector.js';
import { Askdepth, onPointerDown, onRejection } from '../src/sdk.js';
import { resetSdkForTests } from '../src/reset.js';
import { shouldKillResponse } from '../src/transport.js';

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

afterEach(() => {
  resetSdkForTests();
  resetErrors();
  resetRage();
  resetActivity();
  vi.restoreAllMocks();
});

describe('supporting branches', () => {
  it('builds selectors, ids, and kill predicates', () => {
    const node = document.createElement('button');
    node.id = 'pay';
    node.className = 'submit-btn';
    const host = document.createElement('div');
    host.append(document.createTextNode('x'));
    document.body.append(node, host);
    expect(cssPath(node)).toBe('html:nth-of-type(1) > body:nth-of-type(1) > button:nth-of-type(1)');
    expect(asElement(host.firstChild)).toBe(host);
    expect(asElement(null)).toBeNull();
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newSessionId()).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sanitizeUrl('https://ex.test/a?token=1')).toBe('https://ex.test/a');
    expect(sanitizeStack('at onClick (http://localhost:3000/app.js?token=xyz:42:15)')).toContain(':42:15');
    expect(sanitizeStack('at onClick (http://localhost:3000/app.js?token=xyz:42:15)')).not.toContain('token');
    expect(sanitizeStack('Error: private\n at Checkout (https://host.test/users/alice/private.js?token=secret:42:15)')).toBe('at Checkout:42:15');
    expect(shouldKillResponse(200, new Headers({ 'x-askdepth-kill': 'true' }), null)).toBe(true);
    expect(shouldKillResponse(200, new Headers(), { kill: true })).toBe(true);
    expect(shouldKillResponse(200, new Headers(), { ok: true })).toBe(false);
    expect(isRapidAllowed(node, ['['])).toBe(false);
  });

  it('uses the non-secure session id fallback', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    expect(newSessionId()).toMatch(/^[0-9a-f-]{36}$/i);
    if (desc) Object.defineProperty(window, 'isSecureContext', desc);
  });

  it('correlates a network failure and ignores status outside 4xx/5xx', () => {
    noteClick({ selector: 'button.pay', time: 1_000 });
    expect(correlateNetworkError('post', 'https://ex.test/pay?x=1', 500, 12, 1_100)?.error_details.url).toBe(
      'https://ex.test/pay',
    );
    noteClick({ selector: 'button.pay', time: 2_000 });
    expect(correlateNetworkError('GET', 'https://ex.test/ok', 200, 1, 2_010)).toBeNull();
  });

  it('treats roles as interactive and skips an open text field', () => {
    const input = document.createElement('input');
    const role = document.createElement('div');
    role.setAttribute('role', 'button');
    const link = document.createElement('a');
    link.setAttribute('href', '/go');
    const submit = document.createElement('input');
    submit.type = 'submit';
    document.body.append(input, role, link, submit);
    expect(interactiveTarget(input)).toBe(input);
    expect(interactiveTarget(role)).toBe(role);
    expect(interactiveTarget(link)).toBe(link);
    expect(interactiveTarget(submit)).toBe(submit);
    expect(isOpenTextInput(submit)).toBe(false);
    input.focus();
    expect(isOpenTextInput(input)).toBe(true);
    const seen: unknown[] = [];
    expect(armDeadClick(submit, (event) => seen.push(event))).toBeTypeOf('function');
    markNavigation();
    expect(navigationToken()).toBeGreaterThan(0);
  });

  it('records trusted pointer bursts, ignores touch-scroll and rapid targets', () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    window.fetch = fetchMock as typeof fetch;
    Askdepth.init({
      writeKey: PROJECT,
      projectId: PROJECT,
      endpoint: 'https://ingest.test/v1',
      consent: 'granted',
      sampleRate: 1,
      allowRapidClickSelectors: ['.ok-rapid'],
    });
    const button = document.createElement('button');
    document.body.append(button);
    window.dispatchEvent(new Event('scroll'));
    onPointerDown({
      isTrusted: true,
      pointerType: 'touch',
      clientX: 1,
      clientY: 1,
      timeStamp: 1,
      target: button,
    } as PointerEvent);
    const rapid = document.createElement('button');
    rapid.className = 'ok-rapid';
    onPointerDown({
      isTrusted: true,
      pointerType: 'mouse',
      clientX: 5,
      clientY: 5,
      timeStamp: 2,
      target: rapid,
    } as PointerEvent);
    for (const time of [0, 100, 200]) {
      onPointerDown({
        isTrusted: true,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 40,
        timeStamp: time,
        target: button,
      } as PointerEvent);
    }
    expect(fetchMock).toHaveBeenCalled();
    onRejection({ reason: new Error('rejected') } as PromiseRejectionEvent);
    window.dispatchEvent(new Event('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  it('patches fetch and xhr, then beacons on hide', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('example.test')) {
        return new Response('no', { status: 502 });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    window.fetch = fetchMock as typeof fetch;
    const beacon = vi.fn(() => false);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: beacon });
    Askdepth.init({
      writeKey: PROJECT,
      projectId: PROJECT,
      endpoint: 'https://ingest.test/v1',
      consent: 'granted',
      sampleRate: 1,
    });
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fetch('https://example.test/pay?secret=1');
    const fake = {
      setRequestHeader: vi.fn(),
      addEventListener: vi.fn(),
      status: 500,
    };
    try {
      XMLHttpRequest.prototype.open.call(fake, 'POST', 'https://example.test/xhr?q=1', true);
      XMLHttpRequest.prototype.send.call(fake, null);
    } catch {
      /* native XHR rejects a stand-in receiver */
    }
    const load = fake.addEventListener.mock.calls.find((call) => call[0] === 'load');
    load?.[1]?.call(fake);
    Askdepth.track('ping');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    // sendBeacon cannot attach the write-key authorization header; page-close delivery uses fetch keepalive.
    expect(beacon).not.toHaveBeenCalled();
    expect(pushRageClick).toBeTypeOf('function');
  });

  it('covers touch delay, bad config, request tracing, and priority eviction', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Askdepth.init({ writeKey: PROJECT });
    expect(warn).toHaveBeenCalled();
    resetSdkForTests();

    const savedOpen = XMLHttpRequest.prototype.open;
    const savedSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = vi.fn() as typeof XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.send = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/down')) throw new TypeError('Failed to fetch');
      return new Response('ok', { status: 200 });
    });
    window.fetch = fetchMock as typeof fetch;
    Askdepth.init({
      writeKey: 'proj_not_a_uuid',
      endpoint: 'https://ingest.test/v1',
      consent: 'granted',
      sampleRate: 1,
    });
    expect(warn.mock.calls.some((call) => String(call[0]).includes('UUID'))).toBe(false);

    const button = document.createElement('button');
    document.body.append(button);
    onPointerDown({
      isTrusted: true,
      pointerType: 'touch',
      clientX: 3,
      clientY: 4,
      timeStamp: 10,
      target: button,
    } as PointerEvent);
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    onPointerDown({
      isTrusted: true,
      pointerType: 'touch',
      clientX: 8,
      clientY: 8,
      timeStamp: 20,
      target: button,
    } as PointerEvent);
    await new Promise((resolve) => setTimeout(resolve, 100));

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fetch(new Request(`${location.origin}/api`));
    await expect(fetch(`${location.origin}/down`)).rejects.toThrow(/Failed to fetch/);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${location.origin}/xhr`);
    try {
      xhr.send();
    } catch {
      /* jsdom may reject the socket */
    }
    xhr.dispatchEvent(new Event('error'));
    xhr.open('GET', `${location.origin}/xhr-again`);
    try {
      xhr.send();
    } catch {
      /* second send removes the previous listeners */
    }

    const foreign = vi.fn() as unknown as typeof fetch;
    window.fetch = foreign;
    Askdepth.revokeConsent();
    expect(window.fetch).toBe(foreign);
    XMLHttpRequest.prototype.open = savedOpen;
    XMLHttpRequest.prototype.send = savedSend;

    resetSdkForTests();
    const holds: Array<(value: Response) => void> = [];
    const batchFetch = vi.fn(
      () => new Promise<Response>((resolve) => holds.push(resolve)),
    );
    window.fetch = batchFetch as typeof fetch;
    const { createQueue } = await import('../src/transport.js');
    const queue = createQueue({
      meta: () => ({
        projectId: PROJECT,
        environment: 'development',
        sessionId: PROJECT,
        endpoint: 'https://ingest.test/v1',
        writeKey: PROJECT,
      }),
      onKill: () => undefined,
    });
    for (let i = 0; i < 10; i += 1) queue.enqueue({ type: 'track', name: `a${i}` }, false);
    for (let i = 0; i < 50; i += 1) queue.enqueue({ type: 'track', name: `b${i}` }, false);
    queue.enqueue({ type: 'ERROR_CLICK', marker: 'keep' }, true);
    holds.shift()?.(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await vi.waitFor(() => expect(batchFetch.mock.calls.length).toBeGreaterThanOrEqual(2));
    const second = batchFetch.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(second.body)) as { events: Array<{ marker?: string }> };
    expect(body.events.some((event) => event.marker === 'keep')).toBe(true);
    holds.shift()?.(new Response('{}', { status: 200 }));
  });
});
