import { describe, expect, it } from 'vitest';
import { createAskdepthConfig } from '../src/index.js';

describe('@askdepth/react scaffold', () => {
  it('passes through init options', () => {
    const cfg = createAskdepthConfig({
      writeKey: 'wk',
      endpoint: 'https://example.test/v1',
      consent: 'granted',
    });
    expect(cfg.writeKey).toBe('wk');
  });
});
