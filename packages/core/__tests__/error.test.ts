import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Askdepth } from '../src/index.js';
import { resetSdkForTests } from '../src/reset.js';

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

function boot() {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = fetchMock as typeof fetch;
  Askdepth.init({
    writeKey: PROJECT,
    projectId: PROJECT,
    endpoint: 'https://ingest.test/v1',
    consent: 'granted',
    sampleRate: 1,
    environment: 'development',
  });
  return fetchMock;
}

beforeEach(() => {
  resetSdkForTests();
  document.body.innerHTML = '';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  resetSdkForTests();
  vi.useRealTimers();
});

describe('error clicks', () => {
  it('correlates a JS exception within 500ms of a click', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    button.className = 'submit-btn';
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    const error = new Error('API fail');
    window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
    await vi.advanceTimersByTimeAsync(2000);
    const payloads = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));
    const events = payloads.flatMap((body: { events: Array<Record<string, unknown>> }) => body.events);
    const match = events.find((event) => event.type === 'ERROR_CLICK' && event.error_type === 'js_exception');
    expect(match).toBeTruthy();
    expect(match?.target_selector).toBe('html:nth-of-type(1) > body:nth-of-type(1) > button:nth-of-type(1)');
    expect((match?.error_details as { message: string }).message).toBe('JavaScript error');
    expect(match?.time_to_error_ms).toBe(100);
  });

  it('ignores an exception that arrives 1500ms after the click', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1500);
    window.dispatchEvent(new ErrorEvent('error', { message: 'late', error: new Error('late') }));
    await vi.advanceTimersByTimeAsync(2000);
    const payloads = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));
    const events = payloads.flatMap((body: { events: Array<{ type: string; error_type?: string }> }) => body.events);
    expect(events.some((event) => event.type === 'ERROR_CLICK')).toBe(false);
  });

  it('correlates a slow network failure after the click', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('example.test')) return new Response('no', { status: 500 });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    window.fetch = fetchMock as typeof fetch;
    Askdepth.init({
      writeKey: PROJECT,
      projectId: PROJECT,
      endpoint: 'https://ingest.test/v1',
      consent: 'granted',
      sampleRate: 1,
      environment: 'development',
    });
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(800);
    await fetch('https://example.test/pay');
    await vi.advanceTimersByTimeAsync(2000);
    const payloads = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes('ingest.test'))
      .map((call) => JSON.parse((call[1] as RequestInit).body as string));
    const events = payloads.flatMap((body: { events: Array<Record<string, unknown>> }) => body.events);
    const match = events.find((event) => event.type === 'ERROR_CLICK' && event.error_type === 'network_error');
    expect(match).toBeTruthy();
    expect(match?.time_to_error_ms).toBe(800);
  });
});
