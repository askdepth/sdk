export const SDK_NAME = '@askdepth/core';
export const PROTOCOL_VERSION = 1 as const;

declare const __ASKDEPTH_SDK_VERSION__: string | undefined;

export const SDK_VERSION: string =
  typeof __ASKDEPTH_SDK_VERSION__ !== 'undefined' && __ASKDEPTH_SDK_VERSION__
    ? __ASKDEPTH_SDK_VERSION__
    : '0.0.1';
