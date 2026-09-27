import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplayEngine } from '../src/engine.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rrweb session', () => {
  it('masks secrets before they land in the ring buffer', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'ivan@example.com';
    const blocked = document.createElement('div');
    blocked.setAttribute('data-askdepth-block', '');
    blocked.style.width = '80px';
    blocked.style.height = '24px';
    blocked.textContent = 'top-secret-block';
    const card = document.createElement('p');
    card.textContent = 'Visa 4532 0123 4567 8910';
    document.body.append(input, blocked, card);
    const originalPush = history.pushState;

    const engine = createReplayEngine({
      sessionId: 'sess',
      environment: 'test',
      endpoint: 'https://collector.test/v1/replays/upload',
      schedule: (fn) => fn(),
      checkoutEveryNms: 60_000,
      fetchImpl: vi.fn(async () => new Response(null, { status: 204 })),
    });
    engine.start();
    await vi.waitFor(() => {
      expect(engine.dump().some((event) => event.type === 2)).toBe(true);
    });
    const recorded = JSON.stringify(engine.dump());
    expect(recorded).not.toContain('ivan@example.com');
    expect(recorded).not.toContain('top-secret-block');
    expect(recorded).not.toContain('4532 0123 4567 8910');
    expect(recorded).not.toContain('4532012345678910');
    expect(history.pushState).not.toBe(originalPush);
    history.pushState({}, '', '/next');
    engine.stop();
    expect(history.pushState).toBe(originalPush);
  });

  it('drops pointer samples when the document becomes hidden', () => {
    const engine = createReplayEngine({
      sessionId: 'sess',
      environment: 'test',
      endpoint: 'https://collector.test/v1/replays/upload',
      now: () => 5_000,
      schedule: (fn) => fn(),
      recorder: () => ({ stop() {}, checkpoint() {} }),
    });
    engine.start();
    engine.push({ type: 2, timestamp: 4_000, data: { node: { id: 1 } } });
    engine.push({ type: 3, timestamp: 4_100, data: { source: 1, positions: [{ x: 1, y: 1 }] } });
    engine.push({ type: 3, timestamp: 4_200, data: { source: 2, type: 2, id: 3 } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const sources = engine.dump().map((event) => (event.data as { source?: number }).source);
    expect(sources).not.toContain(1);
    expect(sources).toContain(2);
    engine.stop();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('cleans up all listeners and resources on multiple start -> flash -> stop cycles', async () => {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    const engine = createReplayEngine({
      sessionId: 'sess_cycle',
      environment: 'test',
      endpoint: 'https://collector.test/v1/replays/upload',
      schedule: (fn) => fn(),
      fetchImpl,
    });

    for (let i = 0; i < 3; i++) {
      engine.start();
      engine.push({ type: 2, timestamp: 1000 * i, data: { node: { id: 1 } } });
      await engine.flash(`anom_${i}`, 1000 * i + 500);
      engine.stop();
    }

    expect(history.pushState).toBe(originalPush);
    expect(history.replaceState).toBe(originalReplace);
    expect(engine.dump()).toHaveLength(0);
  });
});

