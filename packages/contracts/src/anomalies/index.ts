import { z } from 'zod';
import { RageClickEventSchema } from './rage-click.js';
import { DeadClickEventSchema } from './dead-click.js';
import { ErrorClickEventSchema } from './error-click.js';
import { CustomPropertiesSchema, IdentifyEventSchema, TrackEventSchema } from './custom.js';

export const AnomalyEventSchema = z.union([
  RageClickEventSchema,
  DeadClickEventSchema,
  ErrorClickEventSchema,
]);

export const TelemetryEventSchema = z.union([
  AnomalyEventSchema,
  TrackEventSchema,
  IdentifyEventSchema,
]);

export type AnomalyEvent = z.infer<typeof AnomalyEventSchema>;
export type AnomalyType = AnomalyEvent['type'];
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export { CustomPropertiesSchema };

export * from './rage-click.js';
export * from './dead-click.js';
export * from './error-click.js';
export * from './component-location.js';
export * from './custom.js';
