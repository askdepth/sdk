import { describe, expect, it } from 'vitest';
import { REPLAY_WINDOW_MS, createReplayRecorder } from '../src/index.js';

describe('@askdepth/replay scaffold', () => {
  it('exposes a 45s window constant', () => {
    expect(REPLAY_WINDOW_MS).toBe(45_000);
  });

  it('creates a no-op recorder', () => {
    const rec = createReplayRecorder();
    rec.start();
    expect(rec.dump()).toEqual([]);
    rec.stop();
  });
});
