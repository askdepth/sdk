import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplayEngine } from '@askdepth/replay';
import { Askdepth, onPointerDown } from '../src/sdk.js';
import { resetSdkForTests } from '../src/reset.js';
import { armReplay, loadReplayModule, noteFriction } from '../src/replay-loader.js';

vi.mock('@askdepth/replay', () => ({
  createReplayEngine: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    flash: vi.fn(async () => []),
  })),
}));

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

function boot(replay: boolean | { endpoint?: string; checkoutEveryNms?: number } = true) {
  window.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  Askdepth.init({
    writeKey: PROJECT,
    projectId: PROJECT,
    endpoint: 'https://ingest.test/v1',
    consent: 'granted',
    sampleRate: 1,
    environment: 'development',
    replay,
  });
}

afterEach(() => {
  resetSdkForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(createReplayEngine).mockClear();
});

describe('replay loader', () => {
  it('loads the replay chunk on idle, 3 seconds after the page is ready', async () => {
    vi.useFakeTimers();
    boot(true);
    expect(createReplayEngine).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(createReplayEngine).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(createReplayEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://ingest.test/v1/replays/upload',
        environment: 'development',
      }),
    );
  });

  it('does not load replay unless it is enabled', async () => {
    vi.useFakeTimers();
    boot(false);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(createReplayEngine).not.toHaveBeenCalled();
  });

  it('loads immediately after two clicks inside 800ms and flashes the anomaly', async () => {
    boot({ checkoutEveryNms: 400, endpoint: 'https://collector.test/v1/replays/upload' });
    const button = document.createElement('button');
    document.body.append(button);
    for (const time of [0, 100, 200]) {
      onPointerDown({
        isTrusted: true,
        pointerType: 'mouse',
        clientX: 12,
        clientY: 12,
        timeStamp: time,
        target: button,
      } as PointerEvent);
    }
    await vi.waitFor(() => expect(createReplayEngine).toHaveBeenCalled());
    const engine = vi.mocked(createReplayEngine).mock.results.at(-1)?.value as { flash: ReturnType<typeof vi.fn> };
    await vi.waitFor(() => expect(engine.flash).toHaveBeenCalled());
    expect(engine.flash.mock.calls[0]?.[0]).toEqual(expect.any(String));
    expect(createReplayEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://collector.test/v1/replays/upload',
        checkoutEveryNms: 400,
      }),
    );
  });

  it('uses requestIdleCallback and waits for window load when the document is still loading', async () => {
    const ric = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 5 } as IdleDeadline);
      return 4;
    });
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    const state = { value: 'loading' };
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => state.value });
    boot(true);
    expect(createReplayEngine).not.toHaveBeenCalled();
    state.value = 'complete';
    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(createReplayEngine).toHaveBeenCalled());
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'complete' });
  });

  it('returns null when the chunk cannot be imported', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(createReplayEngine).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const loaded = await loadReplayModule({
      sessionId: PROJECT,
      environment: 'test',
      endpoint: 'https://collector.test/v1/replays/upload',
    });
    expect(loaded).toBeNull();
    expect(warn).toHaveBeenCalledWith('[Askdepth] Failed to dynamically load replay module', expect.any(Error));
  });

  it('reuses an in-flight import and ignores later friction once the engine exists', async () => {
    const cfg = { sessionId: PROJECT, environment: 'test', endpoint: 'https://collector.test/up' };
    const first = loadReplayModule(cfg);
    const second = loadReplayModule(cfg);
    expect(await first).toBe(await second);
    expect(createReplayEngine).toHaveBeenCalledTimes(1);
    noteFriction(1);
    noteFriction(2);
    expect(createReplayEngine).toHaveBeenCalledTimes(1);
  });

  it('treats a second click outside 800ms as a fresh pair', () => {
    armReplay({ sessionId: PROJECT, environment: 'test', endpoint: 'https://collector.test/up' });
    noteFriction(1_000);
    noteFriction(2_000);
    expect(createReplayEngine).not.toHaveBeenCalled();
  });
});
