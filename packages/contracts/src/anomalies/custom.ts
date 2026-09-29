import { z } from 'zod';

const MAX_CUSTOM_KEYS = 32;
const MAX_CUSTOM_KEY_LENGTH = 64;
const MAX_CUSTOM_STRING_LENGTH = 512;
const MAX_CUSTOM_ARRAY_LENGTH = 50;
const MAX_CUSTOM_DEPTH = 3;

function isBoundedValue(value: unknown, depth: number): boolean {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_CUSTOM_STRING_LENGTH;
  if (depth >= MAX_CUSTOM_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.length <= MAX_CUSTOM_ARRAY_LENGTH && value.every((item) => isBoundedValue(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_CUSTOM_KEYS
    && entries.every(([key, item]) => key.length <= MAX_CUSTOM_KEY_LENGTH && isBoundedValue(item, depth + 1));
}

export const CustomPropertiesSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (!isBoundedValue(value, 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'custom properties exceed supported bounds' });
  }
});

export const TrackEventSchema = z.object({
  type: z.literal('track'),
  name: z.string().min(1).max(200),
  properties: CustomPropertiesSchema.optional(),
});

export const IdentifyEventSchema = z.object({
  type: z.literal('identify'),
  user_id: z.string().min(1).max(200),
  traits: CustomPropertiesSchema.optional(),
});

export type TrackEvent = z.infer<typeof TrackEventSchema>;
export type IdentifyEvent = z.infer<typeof IdentifyEventSchema>;
