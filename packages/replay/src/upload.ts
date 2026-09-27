import type { ReplayUploadPayload } from '@askdepth/contracts';
import { bytesToBase64 } from './bytes.js';

const UPLOAD_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

/**
 * Upload a slice chunk to the ingest server with best-effort delivery.
 * W3C Fetch standard enforces a strict 64 KiB keepalive quota.
 * Each chunk stays under 60 KiB so keepalive: true can safely protect inflight requests across unload.
 */
export async function postReplay(
  url: string,
  payload: ReplayUploadPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const encoded = typeof payload.payload === 'string' ? payload.payload : bytesToBase64(payload.payload);
  const body = JSON.stringify({
    manifest: payload.manifest,
    payload: encoded,
    part_index: payload.part_index,
    total_parts: payload.total_parts,
  });

  // W3C Fetch spec enforces a strict 64 KiB limit on keepalive request bodies.
  const keepalive = body.length <= 64 * 1024;

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS) : null;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        keepalive,
        headers: { 'content-type': 'application/json' },
        body,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timer) clearTimeout(timer);
      if (response.ok) return;
      // Only retry on 5xx server errors; 4xx errors are not retried
      if (response.status < 500) return;
      if (attempt === MAX_RETRIES) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempt)));
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempt)));
    }
    attempt += 1;
  }
}
