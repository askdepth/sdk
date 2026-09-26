import { z } from 'zod';

/** SemVer of an Askdepth npm artifact, e.g. `0.0.1` or `0.1.0-canary.1`. */
export const SDKVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    { message: 'sdk_version must be SemVer' },
  );

export type SDKVersion = z.infer<typeof SDKVersionSchema>;

/** Askdepth project identifier: UUID or CUID. */
export const ProjectIdSchema = z.union([z.string().uuid(), z.string().cuid()]);

export const SessionIdSchema = z.string().uuid();
