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

async function flushedEvents(fetchMock: ReturnType<typeof vi.fn>): Promise<Array<{ type: string }>> {
  await vi.advanceTimersByTimeAsync(2000);
  return fetchMock.mock.calls.flatMap((call) => {
    if (!String(call[0]).includes('ingest.test')) return [];
    const raw = (call[1] as RequestInit | undefined)?.body;
    if (typeof raw !== 'string') return [];
    const body = JSON.parse(raw) as { events: Array<{ type: string }> };
    return body.events;
  });
}

beforeEach(() => {
  resetSdkForTests();
  document.body.innerHTML = '';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  resetSdkForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dead clicks', () => {
  it('emits DEAD_CLICK when a button does nothing for 800ms', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    button.textContent = 'Pay';
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(800);
    const events = await flushedEvents(fetchMock);
    expect(events.some((event) => event.type === 'DEAD_CLICK')).toBe(true);
  });

  it('does not emit when the DOM mutates within 800ms', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    document.body.append(document.createElement('div'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(800);
    const events = await flushedEvents(fetchMock);
    expect(events.some((event) => event.type === 'DEAD_CLICK')).toBe(false);
  });

  it('does not emit when a fetch starts within 800ms', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await fetch('https://example.test/api');
    await vi.advanceTimersByTimeAsync(800);
    const events = await flushedEvents(fetchMock);
    expect(events.filter((event) => event.type === 'DEAD_CLICK')).toHaveLength(0);
  });

  it('ignores a click when text is selected or the URL changes', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'selected',
    } as Selection);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(800);
    const events = await flushedEvents(fetchMock);
    expect(events.some((event) => event.type === 'DEAD_CLICK')).toBe(false);
  });
  it('emits DEAD_CLICK for a click on a span inside a button', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    const span = document.createElement('span');
    span.textContent = 'Pay';
    button.append(span);
    document.body.append(button);
    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(800);
    const events = await flushedEvents(fetchMock);
    expect(events.some((event) => event.type === 'DEAD_CLICK')).toBe(true);
  });

  it('keeps the first dead-click watch when a second click arrives', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2000);
    const events = await flushedEvents(fetchMock);
    expect(events.filter((event) => event.type === 'DEAD_CLICK')).toHaveLength(2);
  });

  it('ignores a non-interactive span', async () => {
    const fetchMock = boot();
    const span = document.createElement('span');
    span.textContent = 'plain';
    document.body.append(span);
    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(800);
    const events = await flushedEvents(fetchMock);
    expect(events.some((event) => event.type === 'DEAD_CLICK')).toBe(false);
  });
});
