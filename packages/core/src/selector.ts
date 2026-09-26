export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 5) {
    let part = node.tagName.toLowerCase();
    const className = node.getAttribute('class');
    if (className) {
      const token = className.trim().split(/\s+/)[0];
      if (token) part += `.${token.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`;
    }
    // getAttribute, not `.id` — form controls can clobber the IDL property.
    const id = node.getAttribute('id');
    if (id) {
      parts.unshift(`${part}#${id.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`);
      break;
    }
    part += `:nth-of-type(${nthOfType(node)})`;
    parts.unshift(part);
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
