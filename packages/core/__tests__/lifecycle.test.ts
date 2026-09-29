import { afterEach, describe, expect, it, vi } from 'vitest';
import { Askdepth } from '../src/index.js';
import { resetSdkForTests } from '../src/reset.js';

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

afterEach(() => {
  resetSdkForTests();
  vi.restoreAllMocks();
});

describe('kill switch', () => {
  it('HTTP 410 removes listeners and silences later track calls', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const remove = vi.spyOn(window, 'removeEventListener');
    const fetchMock = vi.fn(async () => new Response(null, { status: 410 }));
    window.fetch = fetchMock as typeof fetch;

    Askdepth.init({
      writeKey: PROJECT,
      projectId: PROJECT,
      endpoint: 'https://ingest.test/v1',
      consent: 'granted',
      sampleRate: 1,
      environment: 'development',
    });

    for (let i = 0; i < 10; i += 1) Askdepth.track(`e${i}`);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());

    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-askdepth-protocol-version']).toBe('0.1.0');
    expect(headers['x-askdepth-sdk-version']).toBeTruthy();

    const removed = remove.mock.calls.map((call) => call[0]);
    expect(removed).toEqual(expect.arrayContaining(['click', 'scroll', 'error', 'unhandledrejection']));
    expect(warn).toHaveBeenCalledWith('[Askdepth SDK] Runtime deactivated by ingest server signal.');

    fetchMock.mockClear();
    expect(() => {
      Askdepth.track('after');
      Askdepth.identify('user');
      Askdepth.getTraceparent();
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Askdepth.getTraceparent()).toBeNull();
    expect(Askdepth.getSessionId()).toBeNull();
    expect(Askdepth.isInitialized()).toBe(false);
  });

  it('treats JSON kill:true as a hard stop', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ kill: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    window.fetch = fetchMock as typeof fetch;
    Askdepth.init({
      writeKey: PROJECT,
      projectId: PROJECT,
      endpoint: 'https://ingest.test/v1',
      consent: 'granted',
      sampleRate: 1,
    });
    for (let i = 0; i < 10; i += 1) Askdepth.track(`k${i}`);
    await vi.waitFor(() => expect(Askdepth.getTraceparent()).toBeNull());
    Askdepth.track('silent');
  });
});

describe('consent and init', () => {
  it('does not attach listeners until consent is granted', () => {
    const add = vi.spyOn(window, 'addEventListener');
    window.fetch = vi.fn() as typeof fetch;
    Askdepth.init({
      writeKey: PROJECT,
      endpoint: 'https://ingest.test/v1',
      consent: 'unknown',
      sampleRate: 1,
    });
    const types = add.mock.calls.map((call) => call[0]);
    expect(types).not.toContain('pointerdown');
    expect(Askdepth.isInitialized()).toBe(false);
    expect(Askdepth.getSessionId()).toBeNull();
    Askdepth.setConsent('granted');
    expect(add.mock.calls.map((call) => call[0])).toContain('pointerdown');
    expect(Askdepth.isInitialized()).toBe(true);
    expect(Askdepth.getSessionId()).toEqual(expect.any(String));
    Askdepth.revokeConsent();
    expect(Askdepth.getTraceparent()).toBeNull();
    expect(Askdepth.isInitialized()).toBe(false);
    expect(Askdepth.getSessionId()).toBeNull();
  });

  it('reuses the instance for the same config and rebuilds for a new endpoint', () => {
    window.fetch = vi.fn() as typeof fetch;
    const add = vi.spyOn(window, 'addEventListener');
    const options = {
      writeKey: PROJECT,
      endpoint: 'https://ingest.test/a',
      consent: 'granted' as const,
      sampleRate: 1,
    };
    Askdepth.init(options);
    const afterFirst = add.mock.calls.length;
    Askdepth.init(options);
    expect(add.mock.calls.length).toBe(afterFirst);
    Askdepth.init({ ...options, endpoint: 'https://ingest.test/b' });
    expect(add.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});
