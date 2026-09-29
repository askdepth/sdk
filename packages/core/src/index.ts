export {
  Askdepth,
  init,
  setConsent,
  revokeConsent,
  track,
  registerComponentResolver,
  reportCaughtError,
  identify,
  getTraceparent,
  getSessionId,
  isInitialized,
} from './sdk.js';
export type { AskdepthInitOptions, ConsentState, ComponentLocation, ComponentResolver } from './sdk.js';
export { SDK_NAME, SDK_VERSION, PROTOCOL_VERSION } from './version.js';
