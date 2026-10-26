const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : undefined;

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
  let binary = "";
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

export function sha256Hex(input: Uint8Array | string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0, j = 0, result = "";
  const bytes = typeof input === "string" ? encodeText(input) : input;
  const byteLength = bytes.length;
  const bitLength = byteLength * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let c = candidate * candidate; c < 313; c += candidate) isComposite[c] = true;
      if (primeCounter < 8) hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }
  const paddedLength = (((byteLength + 8) >> 6) + 1) << 4;
  const words = new Int32Array(paddedLength);
  for (i = 0; i < byteLength; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | ((bytes[i]! & 255) << ((3 - (i % 4)) * 8));
  }
  words[byteLength >> 2] = (words[byteLength >> 2] || 0) | (128 << ((3 - (byteLength % 4)) * 8));
  words[paddedLength - 2] = (bitLength / maxWord) | 0;
  words[paddedLength - 1] = bitLength;

  for (j = 0; j < paddedLength; j += 16) {
    const w = new Int32Array(64);
    for (i = 0; i < 16; i++) w[i] = words[j + i] || 0;
    for (i = 16; i < 64; i++) {
      const w15 = w[i - 15] || 0, w2 = w[i - 2] || 0;
      w[i] =
        ((w[i - 16] || 0) +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          (w[i - 7] || 0) +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
        0;
    }
    let a = hash[0] || 0,
      b = hash[1] || 0,
      c = hash[2] || 0,
      d = hash[3] || 0,
      e = hash[4] || 0,
      f = hash[5] || 0,
      g = hash[6] || 0,
      h = hash[7] || 0;
    for (i = 0; i < 64; i++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (k[i] || 0) + (w[i] || 0)) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    hash[0] = ((hash[0] || 0) + a) | 0;
    hash[1] = ((hash[1] || 0) + b) | 0;
    hash[2] = ((hash[2] || 0) + c) | 0;
    hash[3] = ((hash[3] || 0) + d) | 0;
    hash[4] = ((hash[4] || 0) + e) | 0;
    hash[5] = ((hash[5] || 0) + f) | 0;
    hash[6] = ((hash[6] || 0) + g) | 0;
    hash[7] = ((hash[7] || 0) + h) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = ((hash[i] || 0) >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}
