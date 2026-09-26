import { z } from 'zod';

/** Wire protocol revision. Frozen until a breaking envelope change. */
export const PROTOCOL_VERSION = 1 as const;

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);

export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;
