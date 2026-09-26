import { z } from 'zod';

/**
 * W3C `traceparent` header.
 * `00-{trace-id 32 hex}-{parent-id 16 hex}-{flags 2 hex}`
 */
export const TRACEPARENT_PATTERN =
  /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export const TraceparentHeaderSchema = z
  .string()
  .regex(TRACEPARENT_PATTERN)
  .refine((value) => {
    const [, traceId, parentId] = value.split('-');
    return traceId !== '0'.repeat(32) && parentId !== '0'.repeat(16);
  }, 'trace-id and parent-id must be non-zero');

const nonZero = (length: number) => (value: string) => value !== '0'.repeat(length);

export const TraceparentPartsSchema = z.object({
  version: z.literal('00'),
  traceId: z.string().regex(/^[0-9a-f]{32}$/).refine(nonZero(32), 'trace-id must be non-zero'),
  parentId: z.string().regex(/^[0-9a-f]{16}$/).refine(nonZero(16), 'parent-id must be non-zero'),
  flags: z.string().regex(/^[0-9a-f]{2}$/),
});

export type TraceparentParts = z.infer<typeof TraceparentPartsSchema>;

export function parseTraceparent(header: string): TraceparentParts {
  const raw = TraceparentHeaderSchema.parse(header);
  const [version, traceId, parentId, flags] = raw.split('-') as [
    '00',
    string,
    string,
    string,
  ];
  return TraceparentPartsSchema.parse({ version, traceId, parentId, flags });
}

export function formatTraceparent(parts: TraceparentParts): string {
  const valid = TraceparentPartsSchema.parse(parts);
  return TraceparentHeaderSchema.parse(
    `${valid.version}-${valid.traceId}-${valid.parentId}-${valid.flags}`,
  );
}
