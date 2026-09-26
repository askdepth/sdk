import { z } from 'zod';

export const JsErrorDetailsSchema = z.object({
  message: z.string(),
  stack: z.string(),
  handled: z.boolean(),
});

export const NetworkErrorDetailsSchema = z.object({
  method: z.string().min(1),
  url: z.string().min(1),
  status_code: z.number().int().min(0).max(599),
  duration_ms: z.number().nonnegative(),
});

export const JsErrorClickEventSchema = z.object({
  type: z.literal('ERROR_CLICK'),
  target_selector: z.string().min(1),
  error_type: z.literal('js_exception'),
  error_details: JsErrorDetailsSchema,
  time_to_error_ms: z.number().min(0).max(500),
});

export const NetworkErrorClickEventSchema = z.object({
  type: z.literal('ERROR_CLICK'),
  target_selector: z.string().min(1),
  error_type: z.literal('network_error'),
  error_details: NetworkErrorDetailsSchema,
  time_to_error_ms: z.number().min(0).max(10_000),
});

export const ErrorClickEventSchema = z.union([
  JsErrorClickEventSchema,
  NetworkErrorClickEventSchema,
]);

export type JsErrorDetails = z.infer<typeof JsErrorDetailsSchema>;
export type NetworkErrorDetails = z.infer<typeof NetworkErrorDetailsSchema>;
export type ErrorClickEvent = z.infer<typeof ErrorClickEventSchema>;
