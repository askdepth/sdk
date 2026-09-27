import type { RRWebEvent } from '@askdepth/contracts';

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-])\d{2,4}[\s.-]\d{2,4}(?:[\s.-]\d{2,4})?/g;
const DOCUMENT_LABEL = /\b(?:паспорт|passport|ssn)\s*[:#-]?\s*[A-Z0-9][A-Z0-9\s-]{4,}\b/gi;
const DOCUMENT_NUMBER = /\b\d{4}\s\d{6}\b/g;
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const CARD_LABEL = /\b(?:card|карта|cc|pan)\s*[:#-]?\s*([0-9][0-9 -]{11,20}[0-9])\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9_\-\.=]{16,}\b/gi;
const API_KEY = /\b(?:api[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi;
const SENSITIVE_QUERY = /token|email|phone|password|secret|key|card|cvv|cvc|ssn|auth/i;

function luhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return false;
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function apply(pattern: RegExp, text: string, replacement: string | ((match: string) => string)): string {
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement as (match: string) => string);
}

/** Redact card, email, phone, JWT, Bearer, and document numbers without mutating text lengths artificially. */
export function maskText(text: string): string {
  if (text.length < 6) return text;
  let result = text;

  // JWT Token redaction
  if (result.includes('eyJ')) {
    result = apply(JWT, result, '[REDACTED_JWT]');
  }

  // Bearer Token redaction
  if (/(?:bearer)/i.test(result)) {
    result = apply(BEARER, result, 'Bearer [REDACTED_TOKEN]');
  }

  // API Key / Secret assignments
  if (/(?:api[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key)/i.test(result)) {
    result = apply(API_KEY, result, '[REDACTED_SECRET]');
  }

  // Labeled card check: redact numbers with explicit card prefix even if test card or Luhn check fails
  if (/(?:card|карта|cc|pan)/i.test(result)) {
    CARD_LABEL.lastIndex = 0;
    result = result.replace(CARD_LABEL, (match, digits) => {
      const clean = digits.replace(/[ -]/g, '');
      if (clean.length >= 12 && clean.length <= 19) {
        return match.replace(digits, '[REDACTED_CARD]');
      }
      return match;
    });
  }

  // Fast pre-check: cards require at least 4 contiguous digits
  if (/\d{4}/.test(result)) {
    result = apply(CARD, result, (match) => {
      const digits = match.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return match;
      return '[REDACTED_CARD]';
    });
  }

  // Fast pre-check: emails require '@' symbol
  if (result.includes('@')) {
    result = apply(EMAIL, result, '[REDACTED_EMAIL]');
  }

  // Fast pre-check: phones require at least 3 digits
  if (/\d{3,}/.test(result)) {
    PHONE.lastIndex = 0;
    result = result.replace(PHONE, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return match;
      return '[REDACTED_PHONE]';
    });
  }

  // Fast pre-check for document keywords
  if (/(?:паспорт|passport|ssn)/i.test(result)) {
    result = apply(DOCUMENT_LABEL, result, '[REDACTED_DOCUMENT]');
  }

  if (/\d{4}\s\d{6}/.test(result)) {
    result = apply(DOCUMENT_NUMBER, result, '[REDACTED_DOCUMENT]');
  }

  return result;
}

/** Text inputs keep their length as stars unless a PII pattern replaces the whole secret. */
export function maskInputValue(value: string): string {
  const patterned = maskText(value);
  if (patterned !== value) return patterned;
  return '*'.repeat(value.length);
}

function stars(value: string): string {
  return '*'.repeat(value.length);
}

function scrubUrl(value: string): string {
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    const url = new URL(value, 'https://assets.invalid');
    const drop: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (SENSITIVE_QUERY.test(key)) drop.push(key);
    });
    for (const key of drop) url.searchParams.delete(key);
    if (!absolute) return `${url.pathname}${url.search}${url.hash}`;
    return url.toString();
  } catch {
    return value.replace(/([?&])((?:access_)?token|email|phone|password|secret|key|card|cvv|cvc|ssn)=[^&#]*/gi, '$1$2=');
  }
}

function scrubStyle(value: string): string {
  if (!value.toLowerCase().includes('url(')) return value;
  return value.replace(/url\((['"]?)(.*?)\1\)/gi, (_match, quote, url) => {
    return `url(${quote}${scrubUrl(url)}${quote})`;
  });
}

function cssLength(style: string, prop: string): string | undefined {
  const match = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function hasClass(attributes: Record<string, unknown>, className: string): boolean {
  const cls = attributes.class ?? attributes.className;
  if (typeof cls !== 'string') return false;
  return cls.split(/\s+/).includes(className);
}

function isBlocked(attributes: Record<string, unknown>): boolean {
  return (
    'data-askdepth-block' in attributes ||
    'data-rr-block' in attributes ||
    hasClass(attributes, 'askdepth-block') ||
    hasClass(attributes, 'rr-block')
  );
}

function isMasked(attributes: Record<string, unknown>): boolean {
  return (
    'data-askdepth-mask' in attributes ||
    'data-rr-mask' in attributes ||
    hasClass(attributes, 'askdepth-mask') ||
    hasClass(attributes, 'rr-mask')
  );
}

function isContentEditable(attributes: Record<string, unknown>): boolean {
  return (
    'contenteditable' in attributes &&
    attributes.contenteditable !== 'false' &&
    attributes.contenteditable !== false
  );
}

function sanitizeAttributes(attributes: Record<string, unknown>, forceStars: boolean): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(attributes)) {
    if (key === 'placeholder') {
      next[key] = '';
      continue;
    }
    if (key === 'value' && typeof val === 'string') {
      next[key] = forceStars ? stars(val) : maskInputValue(val);
      continue;
    }
    if ((key === 'aria-label' || key === 'title' || key === 'alt') && typeof val === 'string') {
      next[key] = forceStars ? stars(val) : maskText(val);
      continue;
    }
    if ((key === 'src' || key === 'href') && typeof val === 'string') {
      next[key] = val.includes('?') ? scrubUrl(val) : val;
      continue;
    }
    if (key === 'style' && typeof val === 'string') {
      next[key] = scrubStyle(val);
      continue;
    }
    // Sensitive data-* attributes (e.g. data-user-token, data-secret)
    if (key.startsWith('data-') && SENSITIVE_QUERY.test(key) && typeof val === 'string') {
      next[key] = stars(val);
      continue;
    }
    next[key] = val;
  }
  return next;
}

/** Stateful event sanitizer maintaining masked node IDs across snapshots and incremental mutations. */
export class EventSanitizer {
  private maskedIds = new Set<number>();
  private blockedIds = new Set<number>();

  public clear(): void {
    this.maskedIds.clear();
    this.blockedIds.clear();
  }

  public sanitize(event: RRWebEvent): RRWebEvent {
    const clone = JSON.parse(JSON.stringify(event)) as RRWebEvent;
    if (clone.type === 2) {
      // FullSnapshot: clear state and index newly serialized tree
      this.clear();
      if (clone.data && typeof clone.data === 'object') {
        const data = clone.data as Record<string, unknown>;
        if (data.node && typeof data.node === 'object') {
          this.sanitizeNode(data.node as Record<string, unknown>, false, false);
        }
      }
      return clone;
    }

    if (clone.type === 3 && clone.data && typeof clone.data === 'object') {
      this.sanitizeIncremental(clone.data as Record<string, unknown>);
      return clone;
    }

    if (clone.data && typeof clone.data === 'object') {
      this.sanitizeNode(clone.data as Record<string, unknown>, false, false);
    }
    return clone;
  }

  private sanitizeIncremental(data: Record<string, unknown>): void {
    // 1. Removes: clean up obsolete node IDs
    if (Array.isArray(data.removes)) {
      for (const rem of data.removes) {
        if (rem && typeof rem.id === 'number') {
          this.maskedIds.delete(rem.id);
          this.blockedIds.delete(rem.id);
        }
      }
    }

    // 2. Adds: propagate masking/blocking from parent
    if (Array.isArray(data.adds)) {
      for (const item of data.adds) {
        if (item && item.node && typeof item.node === 'object') {
          const parentMasked = typeof item.parentId === 'number' && this.maskedIds.has(item.parentId);
          const parentBlocked = typeof item.parentId === 'number' && this.blockedIds.has(item.parentId);
          this.sanitizeNode(item.node as Record<string, unknown>, parentMasked, parentBlocked);
        }
      }
    }

    // 3. Attributes
    if (Array.isArray(data.attributes)) {
      for (const item of data.attributes) {
        if (item && typeof item.id === 'number' && item.attributes && typeof item.attributes === 'object') {
          const attrs = item.attributes as Record<string, unknown>;
          if (isBlocked(attrs)) this.blockedIds.add(item.id);
          if (this.blockedIds.has(item.id)) {
            const safeAttrs: Record<string, unknown> = {
              'data-askdepth-block': '',
            };
            if ('width' in attrs) safeAttrs.width = attrs.width;
            if ('height' in attrs) safeAttrs.height = attrs.height;
            if ('rr_width' in attrs) safeAttrs.rr_width = attrs.rr_width;
            if ('rr_height' in attrs) safeAttrs.rr_height = attrs.rr_height;
            item.attributes = safeAttrs;
            continue;
          }
          if (isMasked(attrs) || isContentEditable(attrs)) this.maskedIds.add(item.id);
          const forceStars = this.maskedIds.has(item.id);
          item.attributes = sanitizeAttributes(attrs, forceStars);
        }
      }
    }

    // 4. Texts: characterData mutations inside contenteditable or masked containers
    if (Array.isArray(data.texts)) {
      for (const item of data.texts) {
        if (item && typeof item.value === 'string') {
          if (typeof item.id === 'number' && this.blockedIds.has(item.id)) {
            item.value = '';
            continue;
          }
          const isMaskedNode = typeof item.id === 'number' && this.maskedIds.has(item.id);
          item.value = isMaskedNode ? stars(item.value) : maskText(item.value);
        }
      }
    }

    // 5. Input mutations (source: 5)
    if (data.source === 5 && typeof data.text === 'string') {
      if (typeof data.id === 'number' && this.blockedIds.has(data.id)) {
        data.text = '';
        return;
      }
      const isMaskedNode = typeof data.id === 'number' && this.maskedIds.has(data.id);
      data.text = isMaskedNode ? stars(data.text) : maskInputValue(data.text);
    }
  }

  private sanitizeNode(node: Record<string, unknown>, forceStars: boolean, forceBlock: boolean): void {
    const id = typeof node.id === 'number' ? node.id : undefined;
    const attributes = node.attributes;
    const attributeRecord =
      attributes && typeof attributes === 'object' && !Array.isArray(attributes)
        ? (attributes as Record<string, unknown>)
        : null;
    const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
    const element = Boolean(tag && attributeRecord);

    const blocked = forceBlock || Boolean(element && attributeRecord && isBlocked(attributeRecord));
    if (id !== undefined && blocked) {
      this.blockedIds.add(id);
    }

    if (element && attributeRecord && blocked) {
      const style = typeof attributeRecord.style === 'string' ? attributeRecord.style : '';
      const width = attributeRecord.width ?? attributeRecord.rr_width ?? cssLength(style, 'width') ?? 120;
      const height = attributeRecord.height ?? attributeRecord.rr_height ?? cssLength(style, 'height') ?? 40;
      node.childNodes = [];
      // Strict allowlist: strip class, id, style, src, href to prevent any PII leaks from blocked nodes
      const safeAttrs: Record<string, unknown> = {
        'data-askdepth-block': '',
        width,
        height,
        rr_width: String(width),
        rr_height: String(height),
      };
      node.attributes = safeAttrs;
      return;
    }

    const contentEditable = Boolean(attributeRecord && isContentEditable(attributeRecord));
    const masked = forceStars || contentEditable || Boolean(attributeRecord && isMasked(attributeRecord));
    if (id !== undefined && masked) {
      this.maskedIds.add(id);
    }

    if (attributeRecord) {
      node.attributes = sanitizeAttributes(attributeRecord, masked);
    }

    if (typeof node.textContent === 'string') {
      node.textContent = masked ? stars(node.textContent) : maskText(node.textContent);
    }
    if (!tag && typeof node.id === 'number' && typeof node.value === 'string') {
      node.value = masked ? stars(node.value) : maskText(node.value);
    }
    if (node.source === 5 && typeof node.text === 'string') {
      node.text = masked ? stars(node.text) : maskInputValue(node.text);
    }

    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        if (child && typeof child === 'object') {
          this.sanitizeNode(child as Record<string, unknown>, masked, blocked);
        }
      }
    }
    for (const key of ['adds', 'texts', 'attributes', 'removes', 'node']) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            this.sanitizeNode(child as Record<string, unknown>, masked, blocked);
          }
        }
      } else if (value && typeof value === 'object') {
        this.sanitizeNode(value as Record<string, unknown>, masked, blocked);
      }
    }
  }
}

export function createEventSanitizer(): EventSanitizer {
  return new EventSanitizer();
}

const defaultSanitizer = new EventSanitizer();

/** Mask PII on an rrweb event before it is allowed into the ring buffer. */
export function sanitizeEvent(event: RRWebEvent): RRWebEvent {
  return defaultSanitizer.sanitize(event);
}
