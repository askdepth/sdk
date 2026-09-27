const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined;

export function encodeText(text: string): Uint8Array {
  if (textEncoder) return textEncoder.encode(text);
  const buf = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) buf[i] = text.charCodeAt(i) & 0xff;
  return buf;
}

export function byteSize(value: unknown): number {
  return encodeText(JSON.stringify(value)).length;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

export function splitBytes(bytes: Uint8Array, limit: number): Uint8Array[] {
  if (limit <= 0 || bytes.byteLength <= limit) return [bytes];
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += limit) {
    parts.push(bytes.subarray(offset, Math.min(offset + limit, bytes.byteLength)));
  }
  return parts;
}

/** Chromium desktop keeps 3 MiB. WebKit and mobile browsers keep 1.5 MiB. */
export function maxBufferBytes(userAgent: string): number {
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const webkit = /AppleWebKit/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Android/i.test(userAgent);
  if (mobile || webkit) return Math.floor(1.5 * 1024 * 1024);
  return 3 * 1024 * 1024;
}
