import { Askdepth } from '@askdepth/core';
import { PAGE_VIEW_EVENT } from './constants.js';

let activeRefCount = 0;
let restore: (() => void) | null = null;

const MAX_INPUT_PATH_LENGTH = 4_096;
const MAX_PATH_SEGMENTS = 12;
const STATIC_ROUTE_SEGMENTS = new Set([
  'about', 'account', 'admin', 'api', 'app', 'auth', 'billing', 'blog', 'cart',
  'checkout', 'contact', 'dashboard', 'docs', 'home', 'login', 'logout',
  'orders', 'pricing', 'products', 'profile', 'search', 'settings', 'signup',
  'support', 'users', 'v1',
]);

export function currentUrl(): string {
  const pathname = window.location.pathname || '/';
  const bounded = pathname.slice(0, MAX_INPUT_PATH_LENGTH);
  const segments = bounded.split('/').filter(Boolean);
  const safe = segments.slice(0, MAX_PATH_SEGMENTS).map((segment) =>
    STATIC_ROUTE_SEGMENTS.has(segment) ? segment : ':redacted',
  );
  if (pathname.length > MAX_INPUT_PATH_LENGTH || segments.length > MAX_PATH_SEGMENTS) {
    safe.push(':truncated');
  }
  return safe.length > 0 ? `/${safe.join('/')}` : '/';
}

/**
 * Starts automatic SPA route tracking.
 * Returns an unsubscription function that cleans up history overrides and listeners
 * when all providers unmount.
 */
export function startPageViews(): () => void {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') {
    return () => undefined;
  }

  activeRefCount += 1;

  if (!restore) {
    const notify = () => {
      Askdepth.track(PAGE_VIEW_EVENT, { url: currentUrl() });
    };

    // Emit initial page view on mount
    notify();

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const wrap =
      (original: History['pushState']) =>
      function (this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        notify();
        return result;
      };

    window.history.pushState = wrap(originalPushState);
    window.history.replaceState = wrap(originalReplaceState);
    window.addEventListener('popstate', notify);

    restore = () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', notify);
      restore = null;
    };
  }

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    activeRefCount = Math.max(0, activeRefCount - 1);
    if (activeRefCount === 0 && restore) {
      restore();
    }
  };
}

export function resetPageViewsForTests(): void {
  restore?.();
  activeRefCount = 0;
  restore = null;
}
