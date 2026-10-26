import { z } from "zod";

const opaqueId = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);

export const AnomalyCorrelationSchema = z.object({
  interaction_id: opaqueId.optional(),
  interaction_at: z.string().datetime({ offset: true }).optional(),
  detected_at: z.string().datetime({ offset: true }).optional(),
  detector_version: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/).optional(),
  sampling_probability: z.number().min(0).max(1).optional(),
  document_id: opaqueId.optional(),
  recorder_id: opaqueId.optional(),
  target_node_id: z.union([opaqueId, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).optional(),
  error_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  error_code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
  build_id: opaqueId.nullish(),
});

export type AnomalyCorrelation = z.infer<typeof AnomalyCorrelationSchema>;
