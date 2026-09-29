export interface LastUserInteraction {
  targetElement: Element;
  timestamp: number;
}

export const DEFAULT_MAX_INTERACTION_AGE_MS = 5_000;

let last: LastUserInteraction | null = null;
let activeRefCount = 0;
let clickListener: ((event: MouseEvent) => void) | null = null;

function elementFrom(target: EventTarget | null): Element | null {
  if (typeof Element === 'undefined') return null;
  if (target instanceof Element) return target;
  if (typeof Node !== 'undefined' && target instanceof Node) return target.parentElement;
  return null;
}

/**
 * Returns the last user interaction if it occurred within `maxAgeMs`.
 * Automatically purges stale references to prevent retaining detached DOM trees.
 */
export function getLastUserInteraction(
  maxAgeMs = DEFAULT_MAX_INTERACTION_AGE_MS,
): LastUserInteraction | null {
  if (!last) return null;
  if (Date.now() - last.timestamp > maxAgeMs) {
    last = null;
    return null;
  }
  return last;
}

/**
 * Releases the stored DOM element immediately to facilitate garbage collection.
 */
export function clearLastUserInteraction(): void {
  last = null;
}

/**
 * Installs interaction tracking with reference counting.
 * Returns an unsubscribe callback that removes the window listener once all providers unmount.
 */
export function installInteractionMemory(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  activeRefCount += 1;
  if (!clickListener) {
    clickListener = (event: MouseEvent) => {
      const target = elementFrom(event.target);
      if (!target) return;
      last = { targetElement: target, timestamp: Date.now() };
    };
    window.addEventListener('click', clickListener, { capture: true, passive: true });
  }

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    activeRefCount = Math.max(0, activeRefCount - 1);
    if (activeRefCount === 0 && clickListener) {
      window.removeEventListener('click', clickListener, { capture: true });
      clickListener = null;
      last = null;
    }
  };
}

export function resetInteractionMemoryForTests(): void {
  if (clickListener && typeof window !== 'undefined') {
    window.removeEventListener('click', clickListener, { capture: true });
  }
  clickListener = null;
  activeRefCount = 0;
  last = null;
}
