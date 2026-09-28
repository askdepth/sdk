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
      if (activeRefCount > 0) {
        Askdepth.track(PAGE_VIEW_EVENT, { url: currentUrl() });
      }
    };

    // Emit initial page view on mount
    notify();

    const currentPushState = window.history.pushState;
    const currentReplaceState = window.history.replaceState;

    const originalPushState =
      ((currentPushState as unknown as { __askdepth_original__?: History['pushState'] }).__askdepth_original__) ??
      currentPushState;
    const originalReplaceState =
      ((currentReplaceState as unknown as { __askdepth_original__?: History['replaceState'] }).__askdepth_original__) ??
      currentReplaceState;

    const isPushWrapped = Boolean(
      (currentPushState as unknown as { __askdepth_page_view__?: boolean }).__askdepth_page_view__,
    );
    const isReplaceWrapped = Boolean(
      (currentReplaceState as unknown as { __askdepth_page_view__?: boolean }).__askdepth_page_view__,
    );

    const wrap = (original: History['pushState']) => {
      const fn = function (this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
      (fn as unknown as { __askdepth_original__: History['pushState']; __askdepth_page_view__: boolean }).__askdepth_original__ = original;
      (fn as unknown as { __askdepth_page_view__: boolean }).__askdepth_page_view__ = true;
      return fn;
    };

    const wrappedPushState = isPushWrapped ? currentPushState : wrap(originalPushState);
    const wrappedReplaceState = isReplaceWrapped ? currentReplaceState : wrap(originalReplaceState);

    if (!isPushWrapped) {
      window.history.pushState = wrappedPushState;
    }
    if (!isReplaceWrapped) {
      window.history.replaceState = wrappedReplaceState;
    }
    window.addEventListener('popstate', notify);

    restore = () => {
      if (window.history.pushState === wrappedPushState) {
        window.history.pushState = originalPushState;
      }
      if (window.history.replaceState === wrappedReplaceState) {
        window.history.replaceState = originalReplaceState;
      }
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
  const currentPush = typeof window !== 'undefined' ? window.history?.pushState : undefined;
  const currentReplace = typeof window !== 'undefined' ? window.history?.replaceState : undefined;
  const origPush = (currentPush as unknown as { __askdepth_original__?: History['pushState'] })?.__askdepth_original__;
  const origReplace = (currentReplace as unknown as { __askdepth_original__?: History['replaceState'] })?.__askdepth_original__;
  restore?.();
  if (origPush && typeof window !== 'undefined' && window.history) {
    window.history.pushState = origPush;
  }
  if (origReplace && typeof window !== 'undefined' && window.history) {
    window.history.replaceState = origReplace;
  }
  activeRefCount = 0;
  restore = null;
}
