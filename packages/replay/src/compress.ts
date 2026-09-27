import { gzipSync } from 'fflate';

export interface Compressed {
  bytes: Uint8Array;
  algorithm: 'gzip' | 'deflate' | 'none';
}

async function gzipStream(input: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffered = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffered);
}

/** Prefer the native gzip stream. Old WebKit falls back to fflate. */
export async function compressBytes(input: Uint8Array, mode: 'auto' | 'fflate' | 'none' = 'auto'): Promise<Compressed> {
  if (mode === 'none' || input.byteLength === 0) return { bytes: input, algorithm: 'none' };
  if (mode !== 'fflate' && typeof CompressionStream === 'function') {
    try {
      return { bytes: await gzipStream(input), algorithm: 'gzip' };
    } catch {
      /* Safari without CompressionStream, or a stream failure. */
    }
  }
  try {
    return { bytes: gzipSync(input), algorithm: 'gzip' };
  } catch {
    return { bytes: input, algorithm: 'none' };
  }
}
