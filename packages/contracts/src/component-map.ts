import { z } from "zod";

export const isSafeRelativePath = (path: string): boolean => {
  return (
    Boolean(path) &&
    !/[\\:\x00-\x1f\x7f]/.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
};

export const ComponentSourceLocationSchema = z.object({
  file: z
    .string()
    .min(1)
    .max(512)
    .refine(isSafeRelativePath, { message: "File path must be a safe repository-relative path" }),
  line: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  component_name: z.string().max(120).optional(),
});

export const ComponentMapPayloadSchema = z.object({
  schema_version: z.literal(1),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).max(256),
  commit_sha: z.string().regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  build_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  created_at: z.string().datetime({ offset: true }),
  // Key format: "cmp_a8f9c123" -> location details
  mappings: z.record(
    z.string().regex(/^cmp_[0-9a-f]{8}$/),
    ComponentSourceLocationSchema,
  ),
});

export type ComponentSourceLocation = z.infer<typeof ComponentSourceLocationSchema>;
export type ComponentMapPayload = z.infer<typeof ComponentMapPayloadSchema>;

function sha256Hex(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0, j = 0;
  let result = "";
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let c = candidate * candidate; c < 313; c += candidate) isComposite[c] = true;
      if (primeCounter < 8) hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }
  ascii += "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (ascii.charCodeAt(i) << ((3 - (i % 4)) * 8));
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = [...hash];
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0, w2 = w[i - 2] || 0;
      const a = hash[0] || 0, e = hash[4] || 0;
      const temp1 =
        ((hash[7] || 0) +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & (hash[5] || 0)) ^ (~e & (hash[6] || 0))) +
          (k[i] || 0) +
          (w[i] =
            i < 16
              ? w[i] || 0
              : ((w[i - 16] || 0) +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  (w[i - 7] || 0) +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0)) |
        0;
      const temp2 =
        ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & (hash[1] || 0)) ^ (a & (hash[2] || 0)) ^ ((hash[1] || 0) & (hash[2] || 0)))) |
        0;
      hash[7] = hash[6] || 0;
      hash[6] = hash[5] || 0;
      hash[5] = hash[4] || 0;
      hash[4] = ((hash[3] || 0) + temp1) | 0;
      hash[3] = hash[2] || 0;
      hash[2] = hash[1] || 0;
      hash[1] = hash[0] || 0;
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = ((hash[i] || 0) + (oldHash[i] || 0)) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = ((hash[i] || 0) >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

export function computeCanonicalMapChecksum(payload: {
  schema_version: number;
  repository: string;
  commit_sha: string;
  build_id: string;
  mappings: Record<string, { file: string; line: number; col: number; component_name?: string | undefined }>;
}): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, canonical(v)]),
      );
    }
    return value;
  };
  return sha256Hex(
    JSON.stringify(
      canonical({
        schema_version: payload.schema_version,
        repository: payload.repository,
        commit_sha: payload.commit_sha,
        build_id: payload.build_id,
        mappings: payload.mappings,
      }),
    ),
  );
}
