import { PROTOCOL_VERSION as CONTRACT_PROTOCOL_VERSION } from '@askdepth/contracts/protocol-version';

export const SDK_NAME = '@askdepth/core';
export const PROTOCOL_VERSION = CONTRACT_PROTOCOL_VERSION;

declare const __ASKDEPTH_SDK_VERSION__: string | undefined;

export const SDK_VERSION: string =
  typeof __ASKDEPTH_SDK_VERSION__ !== 'undefined' && __ASKDEPTH_SDK_VERSION__
    ? __ASKDEPTH_SDK_VERSION__
    : '0.0.1';
