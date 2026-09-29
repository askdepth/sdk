/** Lightweight protocol revision constant for browser SDK consumers. */
export const PROTOCOL_VERSION = '0.1.0' as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
