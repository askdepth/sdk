import { z } from 'zod';

export const ClickPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  timestamp: z.number(),
});

export const RageClickEventSchema = z.object({
  type: z.literal('RAGE_CLICK'),
  target_selector: z.string().min(1),
  coordinates: z.array(ClickPointSchema).min(3),
  click_count: z.number().int().min(3),
  target_tag: z.string().min(1),
});

export type ClickPoint = z.infer<typeof ClickPointSchema>;
export type RageClickEvent = z.infer<typeof RageClickEventSchema>;
