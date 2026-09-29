/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { Askdepth } from '../src/index.js';

describe('SSR no-op', () => {
  it('imports and initializes without a DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(() => Askdepth.init({ writeKey: 'test' })).not.toThrow();
    expect(Askdepth.getTraceparent()).toBeNull();
    expect(Askdepth.getSessionId()).toBeNull();
    expect(Askdepth.isInitialized()).toBe(false);
    expect(() => {
      Askdepth.track('page');
      Askdepth.identify('user');
      Askdepth.revokeConsent();
    }).not.toThrow();
  });
});
