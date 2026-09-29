import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SDK = readFileSync(new URL('../dist/index.mjs', import.meta.url), 'utf8');
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

function listen(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    if (req.url === '/sdk/index.mjs') {
      res.setHeader('content-type', 'text/javascript');
      res.end(SDK);
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
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><div id="root"></div>
      <script type="importmap">{"imports":{"@askdepth/contracts/protocol-version":"/sdk/contracts/versioning/protocol-version.js"}}</script>
      <script type="module">
        import { Askdepth } from '/sdk/index.mjs';
        const root = document.getElementById('root');
        for (let i = 0; i < 1000; i += 1) {
          const node = document.createElement('div');
          node.textContent = String(i);
          root.append(node);
        }
        Askdepth.init({
          writeKey: '550e8400-e29b-41d4-a716-446655440000',
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          endpoint: location.origin + '/ingest',
          consent: 'granted',
          sampleRate: 1
        });
      </script>`);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

test('click handling stays under 1ms on the main thread', async ({ page }) => {
  const { server, origin } = await listen();
  try {
    await page.goto(origin);
    const average = await page.evaluate(() => {
      const target = document.querySelector('#root div:last-child') as HTMLDivElement;
      const started = performance.now();
      for (let i = 0; i < 100; i += 1) {
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      return (performance.now() - started) / 100;
    });
    expect(average).toBeLessThan(1);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
