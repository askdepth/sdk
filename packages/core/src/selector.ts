export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 5) {
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${nthOfType(node)})`);
    node = node.parentElement;
    depth += 1;
  }
  return parts.join(' > ') || 'unknown';
}

function nthOfType(node: Element): number {
  let count = 1;
  let sib = node.previousElementSibling;
  while (sib) {
    if (sib.tagName === node.tagName) count += 1;
    sib = sib.previousElementSibling;
  }
  return count;
}

export function asElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object') return null;
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}
