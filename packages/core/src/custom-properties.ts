const MAX_KEYS = 32;
const MAX_KEY_LENGTH = 64;
const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 3;
const SENSITIVE_KEY = /(?:pass(?:word)?|secret|token|auth(?:orization)?|cookie|session|e-?mail|phone|address|ssn|credit|card)/i;

function sanitizeValue(value: unknown, depth: number): unknown | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (depth >= MAX_DEPTH || !value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item): item is Exclude<typeof item, undefined> => item !== undefined);
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (Object.keys(result).length >= MAX_KEYS) break;
    if (key.length > MAX_KEY_LENGTH || SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeValue(item, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

export function sanitizeCustomProperties(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const sanitized = sanitizeValue(input, 0);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') return undefined;
  return Object.keys(sanitized).length > 0 ? sanitized as Record<string, unknown> : undefined;
}
