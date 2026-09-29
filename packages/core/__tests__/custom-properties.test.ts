import { describe, expect, it } from 'vitest';
import { sanitizeCustomProperties } from '../src/custom-properties.js';

describe('custom telemetry properties', () => {
  it('drops sensitive keys and bounds nested values before queueing', () => {
    const properties = sanitizeCustomProperties({
      plan: 'pro',
      email: 'person@example.test',
      nested: { authorization: 'Bearer secret', retained: 'x'.repeat(513) },
      items: Array.from({ length: 60 }, (_, index) => index),
    });

    expect(properties).toEqual({
      plan: 'pro',
      nested: { retained: 'x'.repeat(512) },
      items: Array.from({ length: 50 }, (_, index) => index),
    });
  });
});
