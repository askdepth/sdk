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
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

function listen(): Promise<{ server: Server; origin: string }> {
  const seen: string[] = [];
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
    if (req.url?.startsWith('/api/')) {
      const header = req.headers.traceparent;
      if (typeof header === 'string') seen.push(header);
      res.end('ok');
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
      <script type="importmap">{"imports":{"@askdepth/contracts/protocol-version":"/sdk/contracts/versioning/protocol-version.js"}}</script>
      <script type="module">
        import { Askdepth } from '/sdk/index.mjs';
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
      Object.assign(server, { seen });
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

test('injects a valid traceparent on fetch and XHR', async ({ page }) => {
  const { server, origin } = await listen();
  const seen = (server as Server & { seen: string[] }).seen;
  try {
    await page.goto(origin);
    await page.evaluate(async () => {
      await fetch('/api/test');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/xhr');
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error('xhr failed'));
        xhr.send();
      });
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const header of seen) expect(header).toMatch(TRACEPARENT);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
