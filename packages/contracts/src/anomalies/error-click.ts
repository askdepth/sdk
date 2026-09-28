import { z } from 'zod';
import { ComponentLocationSchema } from './component-location.js';

export const JsErrorDetailsSchema = z.object({
  message: z.string().max(240),
  stack: z.string().max(1_200),
  component_stack: z.string().max(1_200).optional(),
  handled: z.boolean(),
});

export const NetworkErrorDetailsSchema = z.object({
  method: z.string().regex(/^[A-Z]+$/).max(12),
  url: z.string().min(1).max(2_048),
  status_code: z.number().int().min(0).max(599),
  duration_ms: z.number().nonnegative().max(600_000),
});

export const JsErrorClickEventSchema = z.object({
  type: z.literal('ERROR_CLICK'),
  target_selector: z.string().min(1).max(1_024),
  error_type: z.literal('js_exception'),
  error_details: JsErrorDetailsSchema,
  time_to_error_ms: z.number().min(0).max(500),
  component: ComponentLocationSchema.optional(),
});

export const NetworkErrorClickEventSchema = z.object({
  type: z.literal('ERROR_CLICK'),
  target_selector: z.string().min(1).max(1_024),
  error_type: z.literal('network_error'),
  error_details: NetworkErrorDetailsSchema,
  time_to_error_ms: z.number().min(0).max(10_000),
  component: ComponentLocationSchema.optional(),
});

export const ErrorClickEventSchema = z.union([
  JsErrorClickEventSchema,
  NetworkErrorClickEventSchema,
]);

export type JsErrorDetails = z.infer<typeof JsErrorDetailsSchema>;
export type NetworkErrorDetails = z.infer<typeof NetworkErrorDetailsSchema>;
export type ErrorClickEvent = z.infer<typeof ErrorClickEventSchema>;
