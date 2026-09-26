import { z } from 'zod';
import { TelemetryEventSchema } from '../anomalies/index.js';
import { ProtocolVersionSchema, PROTOCOL_VERSION } from './protocol.js';
import { ProjectIdSchema, SDKVersionSchema, SessionIdSchema } from './sdk-version.js';

export const EnvironmentSchema = z.enum(['production', 'staging', 'development']);

export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Batch envelope sent to the Askdepth Ingestion API.
 * `protocol_version` is independent from the npm `sdk_version`.
 */
export const TelemetryEnvelopeSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  sdk_name: z.string().min(1),
  sdk_version: SDKVersionSchema,
  project_id: ProjectIdSchema,
  environment: EnvironmentSchema,
  session_id: SessionIdSchema,
  sent_at: z.string().datetime({ offset: true }),
  events: z.array(TelemetryEventSchema),
});

export type TelemetryEnvelope = z.infer<typeof TelemetryEnvelopeSchema>;

/** Header fields of the envelope, without the event batch. */
export type TelemetryEnvelopeHeader = Omit<TelemetryEnvelope, 'events'>;

export const TelemetryEnvelopeHeaderSchema = TelemetryEnvelopeSchema.omit({
  events: true,
});

export function parseTelemetryEnvelope(input: unknown): TelemetryEnvelope {
  return TelemetryEnvelopeSchema.parse(input);
}

export function isTelemetryEnvelope(input: unknown): input is TelemetryEnvelope {
  return TelemetryEnvelopeSchema.safeParse(input).success;
}

export function createTelemetryEnvelope(
  partial: Omit<TelemetryEnvelope, 'protocol_version'> & {
    protocol_version?: 1;
  },
): TelemetryEnvelope {
  return TelemetryEnvelopeSchema.parse({
    ...partial,
    protocol_version: PROTOCOL_VERSION,
  });
}
