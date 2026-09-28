import type { ErrorClickEvent } from '@askdepth/contracts';

export type ErrorClick = ErrorClickEvent;

export interface LastClick {
  selector: string;
  time: number;
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
  const q = url.indexOf('?');
  return (q === -1 ? url : url.slice(0, q)).slice(0, MAX_URL_LENGTH);
}

function sanitizeSelector(selector: string): string {
  return selector.slice(0, MAX_SELECTOR_LENGTH);
}

/** Keep only function names and source positions; stack paths and messages may contain user data. */
export function sanitizeStack(stack: string | undefined): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .filter((line) => /^\s*at\s/.test(line) || /@[^\s]+:\d+/.test(line))
    .slice(0, 8)
    .map((line) => {
      const withoutQuery = line.replace(/\?[^:)\s]*/g, '');
      const position = withoutQuery.match(/:(\d{1,7}):(\d{1,7})\)?$/);
      if (!position) return '';
      const name = withoutQuery.match(/^\s*at\s+([A-Za-z_$][A-Za-z0-9_$.]{0,79})\b/)?.[1]
        ?? withoutQuery.match(/^([A-Za-z_$][A-Za-z0-9_$.]{0,79})@/)?.[1]
        ?? 'anonymous';
      return `at ${name}:${position[1]}:${position[2]}`;
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 1_200);
}

/** React may catch a render error without a click. Report it with an explicit boundary selector. */
export function caughtReactError(
  error: Error,
  now: number,
  componentStack?: string,
): Extract<ErrorClick, { error_type: 'js_exception' }> {
  const dt = within(now, JS_WINDOW_MS);
  const selector = sanitizeSelector(dt !== null && last ? last.selector : 'react:error-boundary');
  if (dt !== null) last = null;
  const sanitizedComponentStack = componentStack ? sanitizeStack(componentStack) : '';
  return {
    type: 'ERROR_CLICK',
    target_selector: selector,
    error_type: 'js_exception',
    error_details: {
      message: 'React component error',
      stack: sanitizeStack(error.stack),
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
): Extract<ErrorClick, { error_type: 'js_exception' }> | null {
  const dt = within(now, JS_WINDOW_MS);
  if (dt === null || !last) return null;
  const event = {
    type: 'ERROR_CLICK' as const,
    target_selector: last.selector,
    error_type: 'js_exception' as const,
    error_details: { message: 'JavaScript error', stack: sanitizeStack(stack), handled: false as const },
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
    target_selector: sanitizeSelector(last.selector),
    error_type: 'network_error' as const,
    error_details: {
      method: method.toUpperCase(),
      url: sanitizeUrl(url),
      status_code: status,
      duration_ms: Math.min(Math.max(0, durationMs), MAX_NETWORK_DURATION_MS),
    },
    time_to_error_ms: dt,
  };
  last = null;
  return event;
}
