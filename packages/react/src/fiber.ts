import { ASKDEPTH_ID_ATTR, ASKDEPTH_SRC_ATTR, COMPOSITE_FIBER_TAGS, FIBER_KEY_PREFIX, LEGACY_FIBER_KEY_PREFIX } from './constants.js';
import type { ResolvedComponentLocation } from './types.js';

const MAX_FIBER_DEPTH = 64;

interface FiberType {
  displayName?: string;
  name?: string;
  render?: FiberType;
  type?: FiberType;
  _payload?: {
    _result?: {
      displayName?: string;
      name?: string;
    };
  };
}

interface FiberNode {
  tag?: number;
  type?: FiberType | string | symbol | null;
  return?: FiberNode | null;
  memoizedProps?: Record<string, unknown> | null;
  pendingProps?: Record<string, unknown> | null;
  alternate?: FiberNode | null;
}

function componentNameOf(type: FiberNode['type'], seen: Set<object>): string | null {
  if (!type || typeof type === 'string' || typeof type === 'symbol') return null;
  if (typeof type === 'function') {
    const fn = type as FiberType;
    return fn.displayName || fn.name || null;
  }
  if (typeof type !== 'object' || seen.has(type)) return null;
  seen.add(type);
  return (
    type.displayName ||
    type.name ||
    componentNameOf(type.render, seen) ||
    componentNameOf(type.type, seen) ||
    type._payload?._result?.displayName ||
    type._payload?._result?.name ||
    null
  );
}

function readAttr(props: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = props?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function fiberKey(target: Element): string | undefined {
  return Object.getOwnPropertyNames(target).find(
    (name) => name.startsWith(FIBER_KEY_PREFIX) || name.startsWith(LEGACY_FIBER_KEY_PREFIX),
  );
}

function locationFrom(
  componentName: string,
  componentStack: string[],
  sourceAttr: string | undefined,
  hashId: string | undefined,
): ResolvedComponentLocation {
  const location: ResolvedComponentLocation = { componentName, componentStack };
  if (sourceAttr) location.sourceAttr = sourceAttr;
  if (hashId) location.hashId = hashId;
  return location;
}

export function resolveComponentLocation(target: Element): ResolvedComponentLocation | null {
  const directSrc = target.getAttribute(ASKDEPTH_SRC_ATTR) ?? undefined;
  const directId = target.getAttribute(ASKDEPTH_ID_ATTR) ?? undefined;
  const key = fiberKey(target);
  if (!key && !directSrc && !directId) return null;

  const stack: string[] = [];
  let primaryName = '';
  let sourceAttr = directSrc;
  let hashId = directId;
  let fiber = key ? ((target as unknown as Record<string, FiberNode | undefined>)[key] ?? null) : null;
  let depth = 0;

  while (fiber && depth < MAX_FIBER_DEPTH) {
    depth += 1;
    const tag = fiber.tag;
    if (
      typeof tag === 'number' &&
      COMPOSITE_FIBER_TAGS.has(tag) &&
      fiber.type &&
      typeof fiber.type !== 'symbol' &&
      typeof fiber.type !== 'string'
    ) {
      const name = componentNameOf(fiber.type, new Set()) ?? 'Anonymous';
      if (!name.startsWith('Askdepth')) {
        if (!primaryName) primaryName = name;
        stack.push(name);
      }
    }
    if (!sourceAttr) {
      sourceAttr =
        readAttr(fiber.memoizedProps, ASKDEPTH_SRC_ATTR) ??
        readAttr(fiber.pendingProps, ASKDEPTH_SRC_ATTR) ??
        readAttr(fiber.alternate?.memoizedProps, ASKDEPTH_SRC_ATTR);
    }
    if (!hashId) {
      hashId =
        readAttr(fiber.memoizedProps, ASKDEPTH_ID_ATTR) ??
        readAttr(fiber.pendingProps, ASKDEPTH_ID_ATTR) ??
        readAttr(fiber.alternate?.memoizedProps, ASKDEPTH_ID_ATTR);
    }
    fiber = fiber.return ?? null;
  }

  if (!primaryName && !sourceAttr && !hashId) return null;

  return locationFrom(
    primaryName || target.tagName.toLowerCase(),
    stack.length > 0 ? stack : [target.tagName.toLowerCase()],
    sourceAttr,
    hashId,
  );
}
