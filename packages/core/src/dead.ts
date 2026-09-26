import type { DeadClickEvent } from '@askdepth/contracts';
import { navigationToken, networkToken } from './activity.js';
import { cssPath } from './selector.js';

export type DeadClick = DeadClickEvent;

const INTERACTIVE =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [tabindex]';

const TEXT_INPUT = /^(text|password|email|search|tel|url|number)$/;

export function interactiveTarget(el: Element): Element | null {
  const closest = el.closest(INTERACTIVE);
  if (closest) return closest;
  try {
    if (getComputedStyle(el).cursor === 'pointer') return el;
  } catch {
    return null;
  }
  return null;
}

/** Focused text field — caret movement is not a dead click. Submit/checkbox stay eligible. */
export function isOpenTextInput(el: Element): boolean {
  if (typeof document !== 'undefined' && document.activeElement !== el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = ((el as HTMLInputElement).getAttribute('type') || 'text').toLowerCase();
  return TEXT_INPUT.test(type);
}

function stylesOf(el: Element): DeadClick['computed_styles'] {
  let cursor = '';
  let pointerEvents = '';
  let display = '';
  let opacity = '';
  try {
    const cs = getComputedStyle(el);
    cursor = cs.cursor || '';
    pointerEvents = cs.pointerEvents || '';
    display = cs.display || '';
    opacity = cs.opacity || '';
  } catch {
    /* jsdom without layout */
  }
  return { cursor, 'pointer-events': pointerEvents, display, opacity };
}

export function armDeadClick(el: Element, onDead: (event: DeadClick) => void): () => void {
  const target = interactiveTarget(el);
  if (!target || isOpenTextInput(target)) return () => undefined;

  let dirty = false;
  const net = networkToken();
  const nav = navigationToken();
  const href = typeof location !== 'undefined' ? location.href : '';
  let obs: MutationObserver | null = null;
  try {
    obs = new MutationObserver(() => {
      dirty = true;
    });
    const root = document.documentElement ?? document.body;
    obs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  } catch {
    obs = null;
  }

  const timer = setTimeout(() => {
    obs?.disconnect();
    let selected = false;
    try {
      selected = (window.getSelection?.()?.toString().length ?? 0) > 0;
    } catch {
      selected = false;
    }
    if (dirty || networkToken() !== net || navigationToken() !== nav) return;
    if (typeof location !== 'undefined' && location.href !== href) return;
    if (selected) return;
    onDead({
      type: 'DEAD_CLICK',
      target_selector: cssPath(target),
      computed_styles: stylesOf(target),
      observed_duration_ms: 800,
      is_interactive_element: true,
    });
  }, 800);

  return () => {
    clearTimeout(timer);
    obs?.disconnect();
  };
}
