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
const RECORD = readFileSync(join(dirname(require.resolve('@rrweb/record')), 'record.js'), 'utf8');
const PLAYER = readFileSync(join(dirname(require.resolve('@rrweb/replay')), 'replay.umd.cjs'), 'utf8');

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

interface UploadBody {
  manifest: {
    slice_id: string;
    has_baseline_snapshot: boolean;
    duration_ms: number;
    compression_algorithm: string;
  };
  payload: string;
  part_index: number;
  total_parts: number;
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
        { "imports": { "@askdepth/replay": "/sdk/replay.js", "@rrweb/record": "/sdk/record.js" } }
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

function decodeUploads(raws: string[]): {
  events: Array<{ type: number; timestamp: number; data?: unknown }>;
  manifest: UploadBody['manifest'];
} {
  const groups = new Map<string, UploadBody[]>();
  for (const raw of raws) {
    const body = JSON.parse(raw) as UploadBody;
    const list = groups.get(body.manifest.slice_id) ?? [];
    list.push(body);
    groups.set(body.manifest.slice_id, list);
  }
  let best: { events: Array<{ type: number; timestamp: number; data?: unknown }>; manifest: UploadBody['manifest'] } | null = null;
  for (const parts of groups.values()) {
    parts.sort((left, right) => left.part_index - right.part_index);
    const bytes = Buffer.concat(parts.map((part) => Buffer.from(part.payload, 'base64')));
    const events = JSON.parse(gunzipSync(bytes).toString('utf8')) as Array<{ type: number; timestamp: number; data?: unknown }>;
    if (!best || events.length >= best.events.length) best = { events, manifest: parts[0]!.manifest };
  }
  if (!best) throw new Error('no replay upload');
  return best;
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
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/replays/upload')) {
      uploads.push(request.postData() ?? '');
    }
  });
  try {
    const recorded = page.waitForResponse((response) => response.url().includes('/sdk/record.js'));
    await page.goto(origin);
    await recorded;
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
    const { events, manifest } = decodeUploads(uploads);
    expect(manifest.has_baseline_snapshot).toBe(true);
    expect(manifest.duration_ms).toBeLessThanOrEqual(45_000);
    expect(manifest.compression_algorithm).toBe('gzip');
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
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/replays/upload')) {
      uploads.push(request.postData() ?? '');
    }
  });
  try {
    const recorded = page.waitForResponse((response) => response.url().includes('/sdk/record.js'));
    await page.goto(origin);
    await recorded;
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
    const recorded = page.waitForResponse((response) => response.url().includes('/sdk/record.js'));
    await page.goto(origin);
    await recorded;
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
