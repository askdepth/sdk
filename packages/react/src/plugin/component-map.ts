import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ComponentMapPayloadSchema,
  computeCanonicalMapChecksum,
  type ComponentMapPayload,
  type ComponentSourceLocation,
} from "@askdepth/contracts";
import type { JsxTransformResult } from "./transformers/jsx-attribute.js";

export interface ComponentMapOptions {
  /** Deployment or build identifier used to locate the private lookup files. */
  buildId?: string | undefined;
  /** Private output directory. Keep this outside publicly served assets. */
  mappingDir?: string | undefined;
  /** Repository in owner/repo format. */
  repository?: string | undefined;
  /** Git commit SHA (40 hex chars). */
  commitSha?: string | undefined;
}

export function resolveBuildId(options: ComponentMapOptions = {}): string {
  const buildId =
    options.buildId ??
    process.env.ASKDEPTH_BUILD_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.BUILD_ID ??
    `local-${process.pid}`;
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(buildId) || buildId === "..") {
    throw new Error("Invalid Askdepth build ID");
  }
  return buildId;
}

export function resolveMappingDir(options: ComponentMapOptions = {}): string {
  return options.mappingDir ?? process.env.ASKDEPTH_COMPONENT_MAP_DIR ?? join(process.cwd(), ".askdepth", "component-maps");
}

export function resolveRepository(options: ComponentMapOptions = {}): string {
  if (options.repository && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) {
    return options.repository;
  }
  if (process.env.ASKDEPTH_REPOSITORY && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.ASKDEPTH_REPOSITORY)) {
    return process.env.ASKDEPTH_REPOSITORY;
  }
  if (process.env.GITHUB_REPOSITORY && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY)) {
    return process.env.GITHUB_REPOSITORY;
  }
  if (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG) {
    const combined = `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`;
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(combined)) return combined;
  }
  return "unknown/unknown";
}

export function resolveCommitSha(options: ComponentMapOptions = {}): string {
  const sha =
    options.commitSha ??
    process.env.ASKDEPTH_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(sha)) {
    return sha;
  }
  return "0000000000000000000000000000000000000000";
}

export function parseSourceLocation(locStr: string): { file: string; line: number; col: number } | null {
  const lastColon = locStr.lastIndexOf(":");
  if (lastColon === -1) return null;
  const secondColon = locStr.lastIndexOf(":", lastColon - 1);
  if (secondColon === -1) return null;
  const file = locStr.slice(0, secondColon).split("\\").join("/");
  const line = Number(locStr.slice(secondColon + 1, lastColon));
  const col = Number(locStr.slice(lastColon + 1));
  if (!file || Number.isNaN(line) || Number.isNaN(col) || line < 0 || col < 0) return null;
  return { file, line, col };
}

export function writePrivateComponentMap(
  filename: string,
  source: string,
  result: JsxTransformResult,
  options: ComponentMapOptions = {},
): void {
  const buildId = resolveBuildId(options);
  const mappingDir = resolveMappingDir(options);
  const directory = resolve(mappingDir, buildId);
  mkdirSync(directory, { recursive: true });
  const fileId = createHash("sha256").update(filename).update("\0").update(source).digest("hex");
  const target = join(directory, `${fileId}.json`);
  const temporary = join(directory, `${fileId}.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify({ buildId, locations: result.locations }));
  renameSync(temporary, target);
}

export function consolidateComponentMap(
  options: ComponentMapOptions = {},
): ComponentMapPayload | null {
  const buildId = resolveBuildId(options);
  const mappingDir = resolveMappingDir(options);
  const directory = resolve(mappingDir, buildId);
  if (!existsSync(directory)) return null;

  const files = readdirSync(directory).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
  if (files.length === 0) return null;

  const mappings: Record<string, ComponentSourceLocation> = {};

  for (const file of files) {
    try {
      const content = readFileSync(join(directory, file), "utf8");
      const parsed = JSON.parse(content) as { locations?: Record<string, string> };
      if (!parsed.locations || typeof parsed.locations !== "object") continue;
      for (const [hash, locStr] of Object.entries(parsed.locations)) {
        if (!/^cmp_[0-9a-f]{8}$/.test(hash) || typeof locStr !== "string") continue;
        const parsedLoc = parseSourceLocation(locStr);
        if (!parsedLoc) continue;
        mappings[hash] = {
          file: parsedLoc.file,
          line: parsedLoc.line,
          col: parsedLoc.col,
        };
      }
    } catch {
      // skip unparseable or corrupted chunk files
    }
  }

  const repository = resolveRepository(options);
  const commitSha = resolveCommitSha(options);

  const manifestData = {
    schema_version: 1 as const,
    build_id: buildId,
    repository,
    commit_sha: commitSha,
    created_at: new Date().toISOString(),
    mappings,
  };

  const checksum = computeCanonicalMapChecksum(manifestData);

  const manifest: ComponentMapPayload = {
    ...manifestData,
    checksum,
  };

  ComponentMapPayloadSchema.parse(manifest);

  const manifestPath = resolve(mappingDir, `${buildId}.manifest.json`);
  const tempPath = resolve(mappingDir, `${buildId}.manifest.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(tempPath, JSON.stringify(manifest, null, 2), "utf8");
  renameSync(tempPath, manifestPath);

  return manifest;
}
