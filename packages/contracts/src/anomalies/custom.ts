import { z } from 'zod';

export const TrackEventSchema = z.object({
  type: z.literal('track'),
  name: z.string().min(1),
  properties: z.record(z.unknown()).optional(),
});

export const IdentifyEventSchema = z.object({
  type: z.literal('identify'),
  user_id: z.string().min(1),
  traits: z.record(z.unknown()).optional(),
});

export type TrackEvent = z.infer<typeof TrackEventSchema>;
export type IdentifyEvent = z.infer<typeof IdentifyEventSchema>;
