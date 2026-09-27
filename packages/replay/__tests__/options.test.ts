import { describe, expect, it } from 'vitest';
import { maxBufferBytes } from '../src/bytes.js';
import { CHECKOUT_EVERY_MS } from '../src/constants.js';
import { compressBytes } from '../src/compress.js';
import { gunzipSync } from 'fflate';
import { createRecordOptions } from '../src/record-options.js';

describe('recorder options and compression', () => {
  it('throttles pointer movement, inlines styles, and checkpoints every 45 seconds', () => {
    const options = createRecordOptions({ emit: () => undefined });
    expect(options.checkoutEveryNms).toBe(CHECKOUT_EVERY_MS);
    expect(options.inlineStylesheet).toBe(true);
    expect(options.collectFonts).toBe(false);
    expect(options.maskAllInputs).toBe(true);
    expect(options.blockSelector).toContain('data-askdepth-block');
    expect(options.maskTextSelector).toContain('data-askdepth-mask');
    expect(options.sampling.mousemove).toBe(50);
    expect(options.sampling.scroll).toBe(150);
    expect(options.sampling.input).toBe('last');
    expect(options.sampling.mouseInteraction.Click).toBe(true);
    expect(options.sampling.mouseInteraction.MouseDown).toBe(true);
    expect(options.sampling.mouseInteraction.ContextMenu).toBe(true);
    expect(options.sampling.mouseInteraction.TouchStart).toBe(true);
    expect(options.sampling.mouseInteraction.Focus).toBe(false);
  });

  it('disables mousemove sampling on mobile and WebKit', () => {
    const iphone = createRecordOptions({
      emit: () => undefined,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    expect(iphone.sampling.mousemove).toBe(false);
    expect(maxBufferBytes('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(Math.floor(1.5 * 1024 * 1024));
    expect(
      maxBufferBytes('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'),
    ).toBe(Math.floor(1.5 * 1024 * 1024));
    expect(maxBufferBytes('Mozilla/5.0 Chrome/120.0.0.0')).toBe(3 * 1024 * 1024);
  });

  it('gzip-compresses with the native stream and with the fflate fallback', async () => {
    const input = new TextEncoder().encode('{"events":[{"type":2,"timestamp":1}]}');
    const native = await compressBytes(input);
    expect(native.algorithm).toBe('gzip');
    expect(new TextDecoder().decode(gunzipSync(native.bytes))).toBe('{"events":[{"type":2,"timestamp":1}]}');
    const polyfill = await compressBytes(input, 'fflate');
    expect(polyfill.algorithm).toBe('gzip');
    expect(new TextDecoder().decode(gunzipSync(polyfill.bytes))).toContain('"type":2');
    expect((await compressBytes(new Uint8Array(), 'none')).algorithm).toBe('none');
    expect((await compressBytes(new Uint8Array())).algorithm).toBe('none');
  });
});
