import { z } from 'zod';

export const ComputedStylesSchema = z.object({
  cursor: z.string(),
  'pointer-events': z.string(),
  display: z.string(),
  opacity: z.string(),
});

export const DeadClickEventSchema = z.object({
  type: z.literal('DEAD_CLICK'),
  target_selector: z.string().min(1),
  computed_styles: ComputedStylesSchema,
  observed_duration_ms: z.literal(800),
  is_interactive_element: z.boolean(),
});

export type ComputedStyles = z.infer<typeof ComputedStylesSchema>;
export type DeadClickEvent = z.infer<typeof DeadClickEventSchema>;
