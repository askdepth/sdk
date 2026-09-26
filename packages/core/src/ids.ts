function bytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(buf);
  } else {
    // Web Crypto is the only CSPRNG available here. This path runs only when it is missing.
    let seed = Date.now() ^ (typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : 0);
    for (let i = 0; i < n; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      buf[i] = seed & 0xff;
    }
  }
  if (buf.every((b) => b === 0)) buf[0] = 1;
  return buf;
}

function hex(buf: Uint8Array): string {
  let out = '';
  for (let i = 0; i < buf.length; i += 1) {
    out += buf[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function randomHex(chars: number): string | null {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.randomUUID !== 'function') return null;
  try {
    const hexId = cryptoObj.randomUUID().replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/.test(hexId) || /^0+$/.test(hexId)) return null;
    return hexId.slice(0, chars);
  } catch {
    return null;
  }
}

/** 16 bytes → 32 hex chars. Prefers crypto.randomUUID when the platform has it. */
export function newTraceId(): string {
  return randomHex(32) ?? hex(bytes(16));
}

/** 8 bytes → 16 hex chars. */
export function newSpanId(): string {
  return randomHex(16) ?? hex(bytes(8));
}

export function newSessionId(): string {
  const secure =
    typeof window === 'undefined' || window.isSecureContext !== false;
  const cryptoObj = globalThis.crypto;
  if (secure && cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    try {
      return cryptoObj.randomUUID();
    } catch {
      /* fall through */
    }
  }
  const b = bytes(16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asProjectId(value: string): string | null {
  if (UUID.test(value) || /^c[a-z0-9]{24}$/i.test(value)) return value;
  return null;
}
