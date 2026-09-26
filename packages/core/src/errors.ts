import type { ErrorClickEvent } from '@askdepth/contracts';

export type ErrorClick = ErrorClickEvent;

export interface LastClick {
  selector: string;
  time: number;
}

const JS_WINDOW_MS = 500;
const NETWORK_WINDOW_MS = 10_000;

let last: LastClick | null = null;

export function resetErrors(): void {
  last = null;
}

export function noteClick(click: LastClick): void {
  last = click;
}

export function sanitizeUrl(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/** Strip query strings but keep `:line:column` for source maps. */
export function sanitizeStack(stack: string | undefined): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .slice(0, 8)
    .map((line) => line.replace(/\?[^:)\s]*/g, ''))
    .join('\n');
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
): Extract<ErrorClick, { error_type: 'js_exception' }> | null {
  const dt = within(now, JS_WINDOW_MS);
  if (dt === null || !last) return null;
  const event = {
    type: 'ERROR_CLICK' as const,
    target_selector: last.selector,
    error_type: 'js_exception' as const,
    error_details: { message, stack: sanitizeStack(stack), handled: false as const },
    time_to_error_ms: dt,
  };
  last = null;
  return event;
}

export function correlateNetworkError(
  method: string,
  url: string,
  status: number,
  durationMs: number,
  now: number,
): Extract<ErrorClick, { error_type: 'network_error' }> | null {
  const failed = status === 0 || (status >= 400 && status <= 599);
  if (!failed) return null;
  const dt = within(now, NETWORK_WINDOW_MS);
  if (dt === null || !last) return null;
  const event = {
    type: 'ERROR_CLICK' as const,
    target_selector: last.selector,
    error_type: 'network_error' as const,
    error_details: {
      method: method.toUpperCase(),
      url: sanitizeUrl(url),
      status_code: status,
      duration_ms: durationMs,
    },
    time_to_error_ms: dt,
  };
  last = null;
  return event;
}
