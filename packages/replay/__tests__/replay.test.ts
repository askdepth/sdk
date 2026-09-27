import { describe, expect, it } from 'vitest';
import { REPLAY_WINDOW_MS, createReplayEngine } from '../src/index.js';

describe('@askdepth/replay', () => {
  it('exports a 45 second window and an engine factory', () => {
    expect(REPLAY_WINDOW_MS).toBe(45_000);
    expect(typeof createReplayEngine).toBe('function');
  });
});
