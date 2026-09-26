// SSR / Node smoke. Imports the *built* `@askdepth/core` package and asserts
// the SDK stays silent when there is no DOM (no `window` / `document`).
//
//   node examples/smoke.mjs
//   deno run examples/smoke.mjs
//   bun  examples/smoke.mjs
//
// Exits 0 on success, 1 on failure. No network, no filesystem.

import {
  Askdepth,
  PROTOCOL_VERSION,
  SDK_NAME,
  SDK_VERSION,
} from '../packages/core/dist/index.mjs';

function assert(cond, msg) {
  if (!cond) {
    console.error(`SMOKE FAIL: ${msg}`);
    process.exit(1);
  }
}

const runtime =
  typeof Deno !== 'undefined'
    ? `Deno ${Deno.version.deno}`
    : typeof Bun !== 'undefined'
      ? `Bun ${Bun.version}`
      : `Node ${process.version}`;

assert(typeof window === 'undefined', 'expected no window in this smoke');
assert(PROTOCOL_VERSION === 1, `protocol_version ${PROTOCOL_VERSION}`);
assert(SDK_NAME === '@askdepth/core', `sdk_name ${SDK_NAME}`);
assert(typeof SDK_VERSION === 'string' && SDK_VERSION.length > 0, 'sdk_version');

try {
  Askdepth.init({
    writeKey: 'smoke-write-key',
    endpoint: 'https://ingest.example/v1',
  });
} catch (err) {
  assert(false, `init must not throw without a DOM: ${err}`);
}

assert(Askdepth.getTraceparent() === null, 'getTraceparent must be null on SSR');

try {
  Askdepth.track('page_view');
  Askdepth.identify('user_smoke');
  Askdepth.setConsent('granted');
  Askdepth.revokeConsent();
} catch (err) {
  assert(false, `public API must be silent no-ops on SSR: ${err}`);
}

console.log(
  `SMOKE OK on ${runtime} (${SDK_NAME}@${SDK_VERSION}, protocol ${PROTOCOL_VERSION})`,
);
