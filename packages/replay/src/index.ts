/** Default ring-buffer window for session replay (ms). */
export const REPLAY_WINDOW_MS = 45_000;

export interface ReplayRecorder {
  start(): void;
  stop(): void;
  /** Dump events currently held in the ring buffer. */
  dump(): unknown[];
}

/**
 * Scaffold for the rrweb wrapper + 45s ring buffer.
 * Implementation lands with the replay sprint.
 */
export function createReplayRecorder(_opts?: {
  windowMs?: number;
}): ReplayRecorder {
  return {
    start() {
      /* stub */
    },
    stop() {
      /* stub */
    },
    dump() {
      return [];
    },
  };
}
