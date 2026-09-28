import { z } from 'zod';

/** Bounded, static component identifiers; never include DOM text or props. */
export const ComponentLocationSchema = z.object({
  name: z.string().min(1).max(120),
  stack: z.array(z.string().min(1).max(120)).max(8),
  source: z.string().max(200).optional(),
  hash_id: z.string().max(64).optional(),
});

export type ComponentLocationEvent = z.infer<typeof ComponentLocationSchema>;
