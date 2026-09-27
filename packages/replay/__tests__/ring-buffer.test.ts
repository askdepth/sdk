import { describe, expect, it } from 'vitest';
import { DESKTOP_MAX_BYTES } from '../src/constants.js';
import type { RRWebEvent } from '../src/index.js';
import { RingBuffer } from '../src/ring-buffer.js';

function event(timestamp: number, source = 0): RRWebEvent {
  return { type: 3, timestamp, data: { source, id: timestamp } };
}

describe('RingBuffer', () => {
  it('drops events older than 45 seconds and keeps order', () => {
    const buffer = new RingBuffer({ now: () => 60_000, maxBytes: 50_000_000 });
    const stamped: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const timestamp = Math.round((index * 60_000) / 99);
      stamped.push(timestamp);
      buffer.push(event(timestamp));
    }
    buffer.evict();
    const kept = buffer.toArray().map((item) => item.timestamp);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(100);
    expect(kept.every((timestamp) => timestamp >= 15_000)).toBe(true);
    expect(kept).not.toContain(0);
    expect(kept[kept.length - 1]).toBe(60_000);
    const sorted = [...kept].sort((left, right) => left - right);
    expect(kept).toEqual(sorted);
    expect(stamped.filter((timestamp) => timestamp >= 15_000)).toEqual(kept);
  });

  it('drops mousemove before clicks and the full snapshot when the byte cap is exceeded', () => {
    const buffer = new RingBuffer({ now: () => 5_000, maxBytes: DESKTOP_MAX_BYTES });
    buffer.push({ type: 2, timestamp: 1_000, data: { node: { id: 1 } } });
    buffer.push({ type: 3, timestamp: 1_100, data: { source: 2, type: 2, id: 4 } });
    buffer.push({
      type: 3,
      timestamp: 1_200,
      data: { source: 1, positions: [], blob: 'm'.repeat(5 * 1024 * 1024) },
    });
    const kinds = buffer.toArray().map((item) => (item.type === 2 ? 'snapshot' : (item.data as { source: number }).source));
    expect(kinds).toContain('snapshot');
    expect(kinds).toContain(2);
    expect(kinds).not.toContain(1);
    expect(buffer.byteLength).toBeLessThanOrEqual(DESKTOP_MAX_BYTES);
    expect(buffer.baseline?.type).toBe(2);
  });

  it('replaces the baseline slot when a new full snapshot arrives', () => {
    const buffer = new RingBuffer({ now: () => 5_000 });
    buffer.push({ type: 2, timestamp: 1_000, data: { node: { id: 'first' } } });
    buffer.push(event(1_200));
    buffer.push({ type: 2, timestamp: 3_000, data: { node: { id: 'second' } } });
    expect(buffer.baseline?.timestamp).toBe(3_000);
    expect((buffer.baseline?.data as { node: { id: string } }).node.id).toBe('second');
    expect(buffer.toArray().filter((item) => item.type === 2)).toHaveLength(1);
    expect(buffer.toArray().some((item) => item.timestamp === 1_200)).toBe(false);
  });

  it('drops intermediate scrolls before the latest scroll and any click', () => {
    const buffer = new RingBuffer({ now: () => 5_000, maxBytes: 120_000 });
    buffer.push({ type: 3, timestamp: 1_000, data: { source: 2, type: 2, id: 9 } });
    for (let index = 0; index < 4; index += 1) {
      buffer.push({
        type: 3,
        timestamp: 2_000 + index,
        data: { source: 3, id: 1, x: 0, y: index, pad: 's'.repeat(80_000) },
      });
    }
    const scrolls = buffer.toArray().filter((item) => (item.data as { source: number }).source === 3);
    expect(scrolls).toHaveLength(1);
    expect((scrolls[0]!.data as { y: number }).y).toBe(3);
    expect(buffer.toArray().some((item) => (item.data as { source: number }).source === 2)).toBe(true);
    expect(buffer.byteLength).toBeLessThanOrEqual(120_000);
  });

  it('drops pointer samples when the tab is backgrounded', () => {
    const buffer = new RingBuffer({ now: () => 5_000 });
    buffer.push({ type: 2, timestamp: 1_000, data: { node: { id: 1 } } });
    buffer.push({ type: 3, timestamp: 1_100, data: { source: 1, positions: [{ x: 1, y: 2 }] } });
    buffer.push({ type: 3, timestamp: 1_200, data: { source: 2, type: 2, id: 3 } });
    buffer.dropPointerSamples();
    expect(buffer.toArray().some((item) => (item.data as { source?: number }).source === 1)).toBe(false);
    expect(buffer.toArray().some((item) => (item.data as { source?: number }).source === 2)).toBe(true);
    expect(buffer.baseline?.type).toBe(2);
  });

  it('preserves the DOM mutation dependency chain under memory pressure and window slicing', () => {
    let pressureCalled = false;
    const buffer = new RingBuffer({
      windowMs: 45_000,
      maxBytes: 10_000,
      now: () => 60_000,
      onPressure: () => {
        pressureCalled = true;
      },
    });

    // 1. Baseline FullSnapshot at ts = 0
    buffer.push({ type: 2, timestamp: 0, data: { node: { id: 1 } } });

    // 2. DOM structural mutation at ts = 10_000 (outside standard 45s window of trigger 60_000, since 60_000 - 45_000 = 15_000)
    buffer.push({ type: 3, timestamp: 10_000, data: { source: 0, adds: [{ id: 2 }] } });

    // 3. DOM structural mutation at ts = 20_000
    buffer.push({ type: 3, timestamp: 20_000, data: { source: 0, texts: [{ id: 2, value: 'text' }] } });

    // 4. Large pointer mousemove at ts = 25_000 exceeding byte cap
    buffer.push({ type: 3, timestamp: 25_000, data: { source: 1, positions: [], blob: 'x'.repeat(20_000) } });

    // Verify pointer was evicted by memory, but DOM mutations at 10_000 and 20_000 were preserved
    const events = buffer.toArray();
    expect(events.some((e) => (e.data as { source?: number })?.source === 1)).toBe(false);
    expect(events.some((e) => e.timestamp === 10_000)).toBe(true);
    expect(events.some((e) => e.timestamp === 20_000)).toBe(true);

    // Verify slice at 60_000 preserves mutation at 10_000 because baseline is at 0
    const slice = buffer.slice(60_000);
    expect(slice[0]!.type).toBe(2);
    expect(slice.some((e) => e.timestamp === 10_000)).toBe(true);
    expect(slice.some((e) => e.timestamp === 20_000)).toBe(true);
  });
});

