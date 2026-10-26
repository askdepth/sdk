import type { ErrorClickEvent } from "@askdepth/contracts";

export type ErrorClick = ErrorClickEvent;

export interface LastClick {
  selector: string;
  time: number;
  interactionId?: string;
}

const JS_WINDOW_MS = 500;
const NETWORK_WINDOW_MS = 10_000;
const MAX_SELECTOR_LENGTH = 1_024;
const MAX_URL_LENGTH = 2_048;
const MAX_NETWORK_DURATION_MS = 600_000;

let last: LastClick | null = null;

export function resetErrors(): void {
  last = null;
}

export function noteClick(click: LastClick): void {
  last = click;
}

export function sanitizeUrl(url: string): string {
  const q = url.indexOf("?");
  return (q === -1 ? url : url.slice(0, q)).slice(0, MAX_URL_LENGTH);
}

function sanitizeSelector(selector: string): string {
  return selector.slice(0, MAX_SELECTOR_LENGTH);
}

function sha256Hex(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0, j = 0;
  let result = "";
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
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
  ascii += "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (ascii.charCodeAt(i) << ((3 - (i % 4)) * 8));
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = [...hash];
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0, w2 = w[i - 2] || 0;
      const a = hash[0] || 0, e = hash[4] || 0;
      const temp1 =
        ((hash[7] || 0) +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & (hash[5] || 0)) ^ (~e & (hash[6] || 0))) +
          (k[i] || 0) +
          (w[i] =
            i < 16
              ? w[i] || 0
              : ((w[i - 16] || 0) +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  (w[i - 7] || 0) +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0)) |
        0;
      const temp2 =
        ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & (hash[1] || 0)) ^ (a & (hash[2] || 0)) ^ ((hash[1] || 0) & (hash[2] || 0)))) |
        0;
      hash[7] = hash[6] || 0;
      hash[6] = hash[5] || 0;
      hash[5] = hash[4] || 0;
      hash[4] = ((hash[3] || 0) + temp1) | 0;
      hash[3] = hash[2] || 0;
      hash[2] = hash[1] || 0;
      hash[1] = hash[0] || 0;
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = ((hash[i] || 0) + (oldHash[i] || 0)) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = ((hash[i] || 0) >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

/** Keep only function names and source positions; stack paths and messages may contain user data. */
export function sanitizeStack(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .filter((line) => /^\s*at\s/.test(line) || /@[^\s]+:\d+/.test(line))
    .slice(0, 8)
    .map((line) => {
      const withoutQuery = line.replace(/\?[^:)\s]*/g, "");
      const position = withoutQuery.match(/:(\d{1,7}):(\d{1,7})\)?$/);
      if (!position) return "";
      const name =
        withoutQuery.match(/^\s*at\s+([A-Za-z_$][A-Za-z0-9_$.]{0,79})\b/)?.[1] ??
        withoutQuery.match(/^([A-Za-z_$][A-Za-z0-9_$.]{0,79})@/)?.[1] ??
        "anonymous";
      return `at ${name}:${position[1]}:${position[2]}`;
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_200);
}

/** React may catch a render error without a click. Report it with an explicit boundary selector. */
export function caughtReactError(
  error: Error,
  now: number,
  componentStack?: string,
): Extract<ErrorClick, { error_type: "js_exception" }> & {
  error_code?: string;
  error_fingerprint?: string;
  interaction_id?: string;
} {
  const dt = within(now, JS_WINDOW_MS);
  const selector = sanitizeSelector(dt !== null && last ? last.selector : "react:error-boundary");
  const interactionId = dt !== null && last ? last.interactionId : undefined;
  if (dt !== null) last = null;
  const sanitizedComponentStack = componentStack ? sanitizeStack(componentStack) : "";
  const sanitizedStack = sanitizeStack(error.stack);
  const fingerprintSource = `${error.name || "Error"}:${error.message || ""}\n${sanitizedComponentStack || sanitizedStack}`;
  const fingerprint = sha256Hex(fingerprintSource);
  return {
    type: "ERROR_CLICK",
    target_selector: selector,
    error_type: "js_exception",
    error_code: "REACT_COMPONENT_ERROR",
    error_fingerprint: fingerprint,
    ...(interactionId ? { interaction_id: interactionId } : {}),
    error_details: {
      message: "React component error",
      stack: sanitizedStack,
      ...(sanitizedComponentStack ? { component_stack: sanitizedComponentStack } : {}),
      handled: true,
    },
    time_to_error_ms: dt ?? 0,
  };
}

function within(now: number, maxMs: number): number | null {
  if (!last) return null;
  const dt = now - last.time;
  if (dt < 0 || dt > maxMs) return null;
  return dt;
}

export function correlateJsError(
  message: string,
  stack: string | undefined,
  now: number,
): (Extract<ErrorClick, { error_type: "js_exception" }> & { interaction_id?: string; error_fingerprint?: string }) | null {
  const dt = within(now, JS_WINDOW_MS);
  if (dt === null || !last) return null;
  const selector = last.selector;
  const interactionId = last.interactionId;
  last = null;
  const sanitizedStack = sanitizeStack(stack);
  const fingerprint = sha256Hex(`${message}\n${sanitizedStack}`);
  const event = {
    type: "ERROR_CLICK" as const,
    target_selector: selector,
    error_type: "js_exception" as const,
    error_fingerprint: fingerprint,
    ...(interactionId ? { interaction_id: interactionId } : {}),
    error_details: { message: "JavaScript error", stack: sanitizedStack, handled: false as const },
    time_to_error_ms: dt,
  };
  return event;
}

export function correlateNetworkError(
  method: string,
  url: string,
  status: number,
  durationMs: number,
  now: number,
): (Extract<ErrorClick, { error_type: "network_error" }> & { interaction_id?: string }) | null {
  const failed = status === 0 || (status >= 400 && status <= 599);
  if (!failed) return null;
  const dt = within(now, NETWORK_WINDOW_MS);
  if (dt === null || !last) return null;
  const selector = last.selector;
  const interactionId = last.interactionId;
  last = null;
  const cleanUrl = sanitizeUrl(url);
  const duration = Math.min(Math.max(0, durationMs), MAX_NETWORK_DURATION_MS);
  const event = {
    type: "ERROR_CLICK" as const,
    target_selector: selector,
    error_type: "network_error" as const,
    ...(interactionId ? { interaction_id: interactionId } : {}),
    error_details: {
      method: method.slice(0, 32),
      url: cleanUrl,
      status_code: Math.min(Math.max(0, status), 599),
      duration_ms: duration,
    },
    time_to_error_ms: dt,
  };
  return event;
}
