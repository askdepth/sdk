import type { RageClickEvent } from '@askdepth/contracts';

export interface ClickRecord {
  x: number;
  y: number;
  time: number;
  target: HTMLElement;
  selector: string;
  tag: string;
}

export type RageClick = RageClickEvent;

const RING = 5;
const WINDOW_MS = 1500;
const RADIUS_PX = 30;
const clicks: ClickRecord[] = [];

export function resetRage(): void {
  clicks.length = 0;
}

export function dropRageClick(rec: ClickRecord): void {
  const index = clicks.indexOf(rec);
  if (index >= 0) clicks.splice(index, 1);
}

export function isRapidAllowed(el: Element, selectors: readonly string[]): boolean {
  if (el.closest('[data-askdepth-allow-rapid]')) return true;
  if (el.closest('input[type="number"]') || el.closest('[role="spinbutton"]')) return true;
  if (isNumberStepper(el)) return true;
  for (const sel of selectors) {
    try {
      if (el.matches(sel) || !!el.closest(sel)) return true;
    } catch {
      /* ignore invalid selector */
    }
  }
  return false;
}

/** +/- controls that sit next to a number input, not only the input itself. */
function isNumberStepper(el: Element): boolean {
  const control = el.closest('button, [role="button"]');
  const parent = control?.parentElement;
  if (!control || !parent) return false;
  for (let sib = parent.firstElementChild; sib; sib = sib.nextElementSibling) {
    if (sib !== control && sib.tagName === 'INPUT' && (sib as HTMLInputElement).type === 'number') return true;
  }
  return false;
}

function maxPairDistance(points: readonly ClickRecord[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dist = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
      if (dist > max) max = dist;
    }
  }
  return max;
}

/** Trailing cluster: every point within 1.5s and 30px of every other point. */
function trailingCluster(): ClickRecord[] | null {
  const last = clicks[clicks.length - 1];
  if (!last) return null;
  let group = clicks.filter((click) => last.time - click.time <= WINDOW_MS);
  while (group.length >= 3 && maxPairDistance(group) > RADIUS_PX) group = group.slice(1);
  if (group.length < 3) return null;
  if (group[group.length - 1]!.time - group[0]!.time > WINDOW_MS) return null;
  return group;
}

/** Push one click. Returns a rage event when the cluster rule matches. */
export function pushRageClick(rec: ClickRecord): RageClick | null {
  clicks.push(rec);
  if (clicks.length > RING) clicks.shift();
  const group = trailingCluster();
  if (!group) return null;
  const last = group[group.length - 1]!;
  const event: RageClick = {
    type: 'RAGE_CLICK',
    target_selector: last.selector,
    coordinates: group.map((click) => ({ x: click.x, y: click.y, timestamp: click.time })),
    click_count: group.length,
    target_tag: last.tag,
  };
  clicks.length = 0;
  return event;
}
