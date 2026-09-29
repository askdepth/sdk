import type { ReplayUploadPayload } from '@askdepth/contracts';
import { PROTOCOL_VERSION } from '@askdepth/contracts/protocol-version';
import { CHUNK_BYTES } from './constants.js';

const UPLOAD_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

class PermanentUploadError extends Error {}

/**
 * Upload a slice chunk to the ingest server with best-effort delivery.
 * W3C Fetch standard enforces a strict 64 KiB keepalive quota.
 * Each chunk stays under 60 KiB so keepalive: true can safely protect inflight requests across unload.
 */
export async function postReplay(
  url: string,
  payload: ReplayUploadPayload,
  writeKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!writeKey) throw new Error('Replay upload requires a write key');
  const body = typeof payload.payload === 'string' ? new TextEncoder().encode(payload.payload) : payload.payload;
  if (body.byteLength > CHUNK_BYTES) throw new Error('Replay chunk exceeds 45 KiB');
  const headers = {
    'content-type': 'application/octet-stream',
    'x-askdepth-protocol-version': PROTOCOL_VERSION,
    'x-askdepth-write-key': writeKey,
    'x-askdepth-session-id': payload.manifest.session_id,
    'x-askdepth-slice-id': payload.manifest.slice_id,
    'x-askdepth-chunk-index': String(payload.part_index),
    'x-askdepth-total-chunks': String(payload.total_parts),
  };

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS) : null;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        keepalive: true,
        headers,
        body,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timer) clearTimeout(timer);
      if (response.ok) return;
      // Client errors are permanent. Stop this slice so later chunks cannot create a partial assembly.
      if (response.status < 500) throw new PermanentUploadError(`Replay upload rejected with status ${response.status}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempt)));
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err instanceof PermanentUploadError) throw err;
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempt)));
    }
    attempt += 1;
  }
}
