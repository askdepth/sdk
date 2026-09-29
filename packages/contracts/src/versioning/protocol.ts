import { z } from 'zod';
import { PROTOCOL_VERSION } from './protocol-version.js';

/** Wire protocol revision. Frozen until a breaking envelope change. */
export { PROTOCOL_VERSION } from './protocol-version.js';

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);

export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;
