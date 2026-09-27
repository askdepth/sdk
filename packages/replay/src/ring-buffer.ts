import type { RRWebEvent } from '@askdepth/contracts';
import { byteSize } from './bytes.js';
import {
  DESKTOP_MAX_BYTES,
  FULL_SNAPSHOT,
  INCREMENTAL_SNAPSHOT,
  REPLAY_WINDOW_MS,
  SOURCE_MOUSE_INTERACTION,
  SOURCE_MOUSE_MOVE,
  SOURCE_MUTATION,
  SOURCE_SCROLL,
  SOURCE_TOUCH_MOVE,
} from './constants.js';

interface Slot {
  event: RRWebEvent;
  bytes: number;
}

function sourceOf(event: RRWebEvent): number | null {
  if (!event.data || typeof event.data !== 'object') return null;
  const source = (event.data as { source?: unknown }).source;
  return typeof source === 'number' ? source : null;
}

function isPointerSample(event: RRWebEvent): boolean {
  const source = sourceOf(event);
  return source === SOURCE_MOUSE_MOVE || source === SOURCE_TOUCH_MOVE;
}

function isScroll(event: RRWebEvent): boolean {
  return sourceOf(event) === SOURCE_SCROLL;
}

function isClick(event: RRWebEvent): boolean {
  return sourceOf(event) === SOURCE_MOUSE_INTERACTION;
}

function isDomMutation(event: RRWebEvent): boolean {
  if (event.type === FULL_SNAPSHOT) return false;
  if (event.type !== INCREMENTAL_SNAPSHOT) return false;
  const source = sourceOf(event);
  return source === SOURCE_MUTATION;
}

/**
 * FIFO of the last 45 seconds plus a protected FullSnapshot slot.
 * Invariant: DOM structural mutations after baseline are never evicted from the
 * middle of the stream, preventing broken DOM references during replay.
 * Memory pressure drops mousemove and intermediate scrolls.
 */
export class RingBuffer {
  readonly windowMs: number;
  readonly maxBytes: number;
  private readonly now: () => number;
  private readonly onPressure?: (() => void) | undefined;
  private items: Slot[] = [];
  private bytes = 0;
  baseline: RRWebEvent | null = null;

  constructor(opts?: {
    windowMs?: number;
    maxBytes?: number;
    now?: () => number;
    onPressure?: () => void;
  }) {
    this.windowMs = opts?.windowMs ?? REPLAY_WINDOW_MS;
    this.maxBytes = opts?.maxBytes ?? DESKTOP_MAX_BYTES;
    this.now = opts?.now ?? (() => Date.now());
    this.onPressure = opts?.onPressure;
  }

  get byteLength(): number {
    return this.bytes;
  }

  clear(): void {
    this.items = [];
    this.bytes = 0;
    this.baseline = null;
  }

  push(event: RRWebEvent): void {
    const slot: Slot = { event, bytes: byteSize(event) };
    if (event.type === FULL_SNAPSHOT) {
      this.baseline = event;
      this.items = this.items.filter((item) => item.event.timestamp >= event.timestamp && item.event.type !== FULL_SNAPSHOT);
      this.items.unshift(slot);
      this.recount();
    } else {
      this.items.push(slot);
      this.bytes += slot.bytes;
    }
    this.evict();
  }

  /**
   * Drop events outside active window.
   * When a baseline is active, DOM mutations between baseline and window cutoff
   * are preserved so the replay tree can always be reconstructed without missing node IDs.
   */
  evict(): void {
    const cutoff = this.now() - this.windowMs;
    const baselineAt = this.baseline?.timestamp;
    this.items = this.items.filter((item) => {
      if (item.event.type === FULL_SNAPSHOT && item.event === this.baseline) return true;
      if (baselineAt !== undefined && item.event.timestamp < baselineAt) return false;
      // Invariant: preserve DOM mutations between active baseline and window cutoff
      if (baselineAt !== undefined && isDomMutation(item.event)) return true;
      return item.event.timestamp >= cutoff;
    });
    this.recount();
    this.evictByMemory();
  }

  /** Tab hidden or memory warning: pointer trails are the first thing to go. */
  dropPointerSamples(): void {
    const next = this.items.filter((item) => !isPointerSample(item.event));
    if (next.length === this.items.length) return;
    this.items = next;
    this.recount();
  }

  toArray(): RRWebEvent[] {
    return this.items.map((item) => item.event);
  }

  /**
   * Slice for upload.
   * Guarantees baseline first, followed by all structural DOM mutations from baseline
   * to trigger, and pointer/scroll events inside [trigger - window, trigger].
   */
  slice(triggerTimestamp: number): RRWebEvent[] {
    const start = triggerTimestamp - this.windowMs;
    const baseline = this.baseline && this.baseline.timestamp <= triggerTimestamp ? this.baseline : null;
    const mutations = this.items
      .map((item) => item.event)
      .filter((event) => {
        if (baseline && event === baseline) return false;
        if (baseline && event.timestamp < baseline.timestamp) return false;
        if (event.timestamp > triggerTimestamp) return false;
        // Invariant: structural DOM mutations since baseline must be included
        if (baseline && isDomMutation(event)) return true;
        return event.timestamp >= start;
      });
    return baseline ? [baseline, ...mutations] : mutations;
  }

  private evictByMemory(): void {
    while (this.bytes > this.maxBytes) {
      const pointer = this.items.findIndex((item) => isPointerSample(item.event));
      if (pointer >= 0) {
        this.removeAt(pointer);
        continue;
      }
      const scrolls = this.items.reduce<number[]>((indexes, item, index) => {
        if (isScroll(item.event)) indexes.push(index);
        return indexes;
      }, []);
      const oldestScroll = scrolls.length > 1 ? scrolls[0] : undefined;
      if (oldestScroll !== undefined) {
        this.removeAt(oldestScroll);
        continue;
      }
      // Never evict DOM mutations from the middle of the stream!
      // If we still exceed memory budget after dropping all pointer and scroll events,
      // invoke onPressure to request an emergency checkpoint.
      if (this.onPressure) {
        this.onPressure();
      }
      break;
    }
  }

  private removeAt(index: number): void {
    const removed = this.items.splice(index, 1)[0];
    if (!removed) return;
    this.bytes -= removed.bytes;
    if (this.bytes < 0) this.bytes = 0;
  }

  private recount(): void {
    this.bytes = 0;
    for (const item of this.items) this.bytes += item.bytes;
  }
}
