/** How long a session slice stays in memory before older mutations are dropped. */
export const REPLAY_WINDOW_MS = 45_000;

/** rrweb full-snapshot checkpoint interval. Matches the ring window so a slice always has a baseline. */
export const CHECKOUT_EVERY_MS = 45_000;

export const DESKTOP_MAX_BYTES = 3 * 1024 * 1024;

/** 1.5 MiB for mobile browsers and WebKit. */
export const MOBILE_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);

/** Maximum binary replay chunk accepted by analytics-ingest and safe for fetch keepalive. */
export const CHUNK_BYTES = 45 * 1024;

/** Match analytics-ingest replay assembly limits. */
export const MAX_REPLAY_CHUNKS = 128;
export const MAX_REPLAY_BYTES = 4 * 1024 * 1024;

/** Synchronous mutation handling must stay inside one frame. */
export const FRAME_BUDGET_MS = 8;

export const FULL_SNAPSHOT = 2;
export const INCREMENTAL_SNAPSHOT = 3;
export const SOURCE_MUTATION = 0;
export const SOURCE_MOUSE_MOVE = 1;
export const SOURCE_MOUSE_INTERACTION = 2;
export const SOURCE_SCROLL = 3;
export const SOURCE_INPUT = 5;
export const SOURCE_TOUCH_MOVE = 6;
