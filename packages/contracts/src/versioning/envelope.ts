import { z } from 'zod';
import { TelemetryEventSchema } from '../anomalies/index.js';
import { ProtocolVersionSchema, PROTOCOL_VERSION } from './protocol.js';
import { SDKVersionSchema, SessionIdSchema } from './sdk-version.js';

export const EnvironmentSchema = z.enum(['production', 'staging', 'development']);

export type Environment = z.infer<typeof EnvironmentSchema>;

/** A telemetry event with its idempotency key. `type` remains the event discriminator. */
export const TelemetryEventEnvelopeSchema = z.intersection(
  z.object({
    event_id: z.string().uuid(),
    timestamp: z.string().datetime({ offset: true }),
  }),
  TelemetryEventSchema,
);

export type TelemetryEventEnvelope = z.infer<typeof TelemetryEventEnvelopeSchema>;

/**
 * Batch envelope sent to the Askdepth Ingestion API.
 * `protocol_version` is independent from the npm `sdk_version`.
 */
export const TelemetryEnvelopeSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  sdk_name: z.string().min(1),
  sdk_version: SDKVersionSchema,
  environment: EnvironmentSchema,
  session_id: SessionIdSchema,
  batch_id: z.string().uuid(),
  sent_at: z.string().datetime({ offset: true }),
  events: z.array(TelemetryEventEnvelopeSchema),
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
    protocol_version?: typeof PROTOCOL_VERSION;
  },
): TelemetryEnvelope {
  return TelemetryEnvelopeSchema.parse({
    ...partial,
    protocol_version: PROTOCOL_VERSION,
  });
}
