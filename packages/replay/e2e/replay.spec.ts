import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const CORE = readFileSync(new URL('../../core/dist/index.mjs', import.meta.url), 'utf8');
const REPLAY = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
const PROTOCOL_VERSION_MODULE = readFileSync(
  new URL('../../contracts/dist/versioning/protocol-version.js', import.meta.url),
  'utf8',
);
const PROTOCOL_VERSION_CHUNK_FILE = PROTOCOL_VERSION_MODULE.match(/from ['"]\.\.\/([^'"]+\.js)['"]/)?.[1];
if (!PROTOCOL_VERSION_CHUNK_FILE) throw new Error('Could not resolve the contracts protocol-version chunk');
const CONTRACTS_VERSION_CHUNK = readFileSync(
  new URL(`../../contracts/dist/${PROTOCOL_VERSION_CHUNK_FILE}`, import.meta.url),
  'utf8',
);
const RECORD = readFileSync(join(dirname(require.resolve('@rrweb/record')), 'record.js'), 'utf8');
const PLAYER = readFileSync(join(dirname(require.resolve('@rrweb/replay')), 'replay.umd.cjs'), 'utf8');

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

interface ReplayUpload {
  sessionId: string;
  sliceId: string;
  chunkIndex: number;
  totalChunks: number;
  protocolVersion: string;
  writeKey: string;
  contentType: string;
  payload: Buffer;
}

function pageHtml(checkout: number): string {
  const replay = checkout > 0 ? `{ checkoutEveryNms: ${checkout} }` : 'true';
  return `<!doctype html>
    <html><body>
      <input id="email" />
      <button id="acc" type="button">Open</button>
      <div id="panel" hidden>Accordion open</div>
      <div id="blocked" data-askdepth-block style="width:100px;height:40px">top-secret-block</div>
      <div id="bin"></div>
      <button id="rage" type="button">Rage</button>
      <button id="dead" type="button">Dead</button>
      <script type="importmap">
        { "imports": {
          "@askdepth/replay": "/sdk/replay.js",
          "@askdepth/contracts/protocol-version": "/sdk/contracts/versioning/protocol-version.js",
          "@rrweb/record": "/sdk/record.js"
        } }
      </script>
      <script type="module">
        import { Askdepth } from '/sdk/core.mjs';
        document.getElementById('acc').addEventListener('click', () => {
          document.getElementById('panel').hidden = false;
        });
        Askdepth.init({
          writeKey: '${PROJECT}',
          projectId: '${PROJECT}',
          endpoint: location.origin,
          consent: 'granted',
          sampleRate: 1,
          environment: 'development',
          replay: ${replay}
        });
      </script>
    </body></html>`;
}

function listen(checkout: number): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    if (req.url === '/sdk/core.mjs') {
      res.setHeader('content-type', 'text/javascript');
      res.end(CORE);
      return;
    }
    if (req.url === '/sdk/replay.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(REPLAY);
      return;
    }
    if (req.url === '/sdk/contracts/versioning/protocol-version.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(PROTOCOL_VERSION_MODULE);
      return;
    }
    if (req.url === `/sdk/contracts/${PROTOCOL_VERSION_CHUNK_FILE}`) {
      res.setHeader('content-type', 'text/javascript');
      res.end(CONTRACTS_VERSION_CHUNK);
      return;
    }
    if (req.url === '/sdk/record.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(RECORD);
      return;
    }
    if (req.url === '/vendor/replay.umd.cjs') {
      res.setHeader('content-type', 'text/javascript');
      res.end(PLAYER);
      return;
    }
    if (req.url === '/player') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><div id="mount"></div><script src="/vendor/replay.umd.cjs"></script>');
      return;
    }
    if (req.url === '/v1/replays/upload') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(pageHtml(checkout));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function decodeUploads(uploads: ReplayUpload[]): {
  events: Array<{ type: number; timestamp: number; data?: unknown }>;
  uploads: ReplayUpload[];
} {
  const groups = new Map<string, ReplayUpload[]>();
  for (const upload of uploads) {
    const list = groups.get(upload.sliceId) ?? [];
    list.push(upload);
    groups.set(upload.sliceId, list);
  }
  let best: { events: Array<{ type: number; timestamp: number; data?: unknown }>; uploads: ReplayUpload[] } | null = null;
  for (const parts of groups.values()) {
    parts.sort((left, right) => left.chunkIndex - right.chunkIndex);
    const bytes = Buffer.concat(parts.map((part) => part.payload));
    const events = JSON.parse(gunzipSync(bytes).toString('utf8')) as Array<{ type: number; timestamp: number; data?: unknown }>;
    if (!best || events.length >= best.events.length) best = { events, uploads: parts };
  }
  if (!best) throw new Error('no replay upload');
  return best;
}

function captureReplayUpload(request: import('@playwright/test').Request): ReplayUpload {
  const headers = request.headers();
  const sessionId = headers['x-askdepth-session-id'];
  const sliceId = headers['x-askdepth-slice-id'];
  const chunkIndex = Number(headers['x-askdepth-chunk-index']);
  const totalChunks = Number(headers['x-askdepth-total-chunks']);
  if (!sessionId || !sliceId || !Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks)) {
    throw new Error('replay upload is missing required chunk headers');
  }
  return {
    sessionId,
    sliceId,
    chunkIndex,
    totalChunks,
    protocolVersion: headers['x-askdepth-protocol-version'] ?? '',
    writeKey: headers['x-askdepth-write-key'] ?? '',
    contentType: headers['content-type'] ?? '',
    payload: request.postDataBuffer() ?? Buffer.alloc(0),
  };
}

async function replayText(page: Page, events: unknown[]): Promise<string> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('/player', page.url()).toString());
  await page.evaluate(async (recorded) => {
    const replay = (window as unknown as { rrwebReplay: { Replayer: new (events: unknown[], config: unknown) => {
      getMetaData: () => { totalTime: number };
      play: (offset?: number) => void;
      pause: (offset?: number) => void;
      on: (event: string, handler: () => void) => void;
    } } }).rrwebReplay;
    const root = document.getElementById('mount');
    const replayer = new replay.Replayer(recorded, { root, showWarning: false, mouseTail: false });
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 2_000);
      replayer.on('finish', () => {
        window.clearTimeout(timer);
        resolve();
      });
      replayer.play();
    });
  }, events);
  await page.waitForTimeout(200);
  const text = await page.frameLocator('#mount iframe').locator('body').innerText();
  expect(errors, errors.join('\n')).toEqual([]);
  return text;
}

test('replays a rage-click slice without leaking masked secrets', async ({ page }) => {
  const { server, origin } = await listen(0);
  const uploads: ReplayUpload[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/replays/upload')) {
      uploads.push(captureReplayUpload(request));
    }
  });
  try {
    const replayLoaded = page.waitForResponse((response) => response.url().includes('/sdk/replay.js'));
    await page.goto(origin);
    await replayLoaded;
    await page.locator('#email').fill('ivan@example.com');
    await page.locator('#acc').click();
    await page.evaluate(() => {
      const bin = document.getElementById('bin');
      for (let index = 0; index < 50; index += 1) {
        const node = document.createElement('span');
        node.textContent = `node-${index}`;
        bin?.append(node);
      }
    });
    await page.locator('#rage').click();
    await page.locator('#rage').click();
    await page.locator('#rage').click();
    await expect.poll(() => uploads.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const { events, uploads: sliceUploads } = decodeUploads(uploads);
    expect(sliceUploads.length).toBeGreaterThan(0);
    for (const upload of sliceUploads) {
      expect(upload.sessionId).toBeTruthy();
      expect(upload.protocolVersion).toBe('0.1.0');
      expect(upload.writeKey).toBe(PROJECT);
      expect(upload.contentType).toBe('application/octet-stream');
      expect(upload.payload.byteLength).toBeLessThanOrEqual(45 * 1024);
    }
    expect(sliceUploads.map((upload) => upload.chunkIndex)).toEqual(
      Array.from({ length: sliceUploads[0]!.totalChunks }, (_, index) => index),
    );
    expect(events.some((event) => event.type === 2)).toBe(true);
    const dumped = JSON.stringify(events);
    expect(dumped).not.toContain('ivan@example.com');
    expect(dumped).not.toContain('top-secret-block');

    const text = await replayText(page, events);
    expect(text).toContain('node-49');
    expect(text).toContain('Accordion open');
    expect(text).not.toContain('ivan@example.com');
    expect(text).not.toContain('top-secret-block');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('keeps the latest full snapshot after several checkpoints', async ({ page }) => {
  const { server, origin } = await listen(400);
  const uploads: ReplayUpload[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/replays/upload')) {
      uploads.push(captureReplayUpload(request));
    }
  });
  try {
    const replayLoaded = page.waitForResponse((response) => response.url().includes('/sdk/replay.js'));
    await page.goto(origin);
    await replayLoaded;
    for (let wave = 0; wave < 4; wave += 1) {
      await page.evaluate((index) => {
        const node = document.createElement('p');
        node.id = `wave-${index}`;
        node.textContent = `wave-${index}`;
        document.body.append(node);
      }, wave);
      await page.waitForTimeout(700);
    }
    await page.locator('#dead').click();
    await expect.poll(() => uploads.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const { events } = decodeUploads(uploads);
    const snapshots = events.filter((event) => event.type === 2);
    expect(snapshots.length).toBeGreaterThan(0);
    const latest = JSON.stringify(snapshots[snapshots.length - 1]);
    expect(latest).toContain('wave-3');
    const text = await replayText(page, events);
    expect(text).toContain('wave-3');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('recycles the ring buffer without an unbounded heap', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'JS heap is measured in Chromium');
  const { server, origin } = await listen(0);
  try {
    const replayLoaded = page.waitForResponse((response) => response.url().includes('/sdk/replay.js'));
    await page.goto(origin);
    await replayLoaded;
    const heap = await page.evaluate(async () => {
      const bin = document.getElementById('bin');
      const gc = (window as unknown as { gc?: () => void }).gc;
      const used = () =>
        (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      gc?.();
      const before = used();
      for (let index = 0; index < 10_000; index += 1) {
        const node = document.createElement('span');
        node.textContent = `m-${index}`;
        bin?.append(node);
        while ((bin?.childNodes.length ?? 0) > 30) bin?.removeChild(bin.firstChild!);
      }
      gc?.();
      return { before, after: used() };
    });
    expect(heap.after).toBeLessThanOrEqual(15 * 1024 * 1024);
    expect(heap.after - heap.before).toBeLessThan(8 * 1024 * 1024);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
