import { z } from 'zod';

export const ComponentSourceLocationSchema = z.object({
  file: z.string().min(1).max(512),
  line: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  component_name: z.string().max(120).optional(),
});

export const ComponentMapPayloadSchema = z.object({
  build_id: z.string().min(1).max(128),
  created_at: z.string().datetime({ offset: true }),
  // Key format: "cmp_a8f9c123" -> location details
  mappings: z.record(
    z.string().regex(/^cmp_[0-9a-f]{8}$/),
    ComponentSourceLocationSchema,
  ),
});

export type ComponentSourceLocation = z.infer<typeof ComponentSourceLocationSchema>;
export type ComponentMapPayload = z.infer<typeof ComponentMapPayloadSchema>;
