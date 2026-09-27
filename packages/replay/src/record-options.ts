import type { RRWebEvent } from '@askdepth/contracts';
import { CHECKOUT_EVERY_MS } from './constants.js';
import { maskInputValue } from './mask.js';
import { maxBufferBytes } from './bytes.js';

export interface RecordEmit {
  (event: RRWebEvent, isCheckout?: boolean): void;
}

/** Recorder options shared by the live rrweb session. */
export function createRecordOptions(args: {
  emit: RecordEmit;
  checkoutEveryNms?: number;
  userAgent?: string;
  maskTextSelector?: string;
}) {
  const mobile = maxBufferBytes(args.userAgent ?? '') < 3 * 1024 * 1024;
  return {
    emit: args.emit,
    checkoutEveryNms: args.checkoutEveryNms ?? CHECKOUT_EVERY_MS,
    inlineStylesheet: true,
    collectFonts: false,
    inlineImages: false,
    recordCanvas: false,
    maskAllInputs: true,
    maskInputFn: (value: string) => maskInputValue(value),
    maskTextFn: (value: string) => (value ? value.replace(/[^\s]/g, '*') : ''),
    maskTextSelector:
      args.maskTextSelector ??
      '[data-askdepth-mask], .askdepth-mask, [contenteditable]:not([contenteditable="false"])',
    maskTextClass: 'askdepth-mask',
    blockSelector: '[data-askdepth-block], [data-rr-block], .askdepth-block, .rr-block',
    blockClass: 'askdepth-block',
    sampling: {
      mousemove: mobile ? false : 50,
      mouseInteraction: {
        MouseUp: false,
        MouseDown: true,
        Click: true,
        ContextMenu: true,
        DblClick: false,
        Focus: false,
        Blur: false,
        TouchStart: true,
        TouchEnd: false,
        TouchCancel: false,
      },
      scroll: 150,
      input: 'last' as const,
    },
  };
}
