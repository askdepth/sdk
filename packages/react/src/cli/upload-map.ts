import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  ComponentMapPayloadSchema,
  computeCanonicalMapChecksum,
  type ComponentMapPayload,
} from "@askdepth/contracts";
import {
  consolidateComponentMap,
  resolveBuildId,
  resolveCommitSha,
  resolveRepository,
} from "../plugin/component-map.js";

export interface UploadMapOptions {
  endpoint?: string | undefined;
  deployToken?: string | undefined;
  apiKey?: string | undefined;
  buildId?: string | undefined;
  repository?: string | undefined;
  commitSha?: string | undefined;
  dir?: string | undefined;
  help?: boolean | undefined;
}

export const HELP_TEXT = `Usage: askdepth-upload-map [options]

Upload Askdepth component-to-code mapping to ingestion service.

Options:
  -e, --endpoint <url>       Askdepth Ingest endpoint URL (env: ASKDEPTH_INGEST_URL, default: https://in.askdepth.com)
  -t, --deploy-token <token> Askdepth Deploy Token (env: ASKDEPTH_DEPLOY_TOKEN or ASKDEPTH_API_KEY)
  -k, --api-key <key>        Alias for --deploy-token
  -b, --build-id <id>        Build ID (env: ASKDEPTH_BUILD_ID, VERCEL_GIT_COMMIT_SHA, etc.)
  -r, --repository <repo>    Repository in owner/repo format (env: ASKDEPTH_REPOSITORY, GITHUB_REPOSITORY)
  -c, --commit-sha <sha>     Git 40-character commit SHA (env: ASKDEPTH_COMMIT_SHA, GITHUB_SHA)
  -d, --dir <path>           Directory containing component maps (default: ./.askdepth/component-maps)
  -h, --help                 Display this help message
`;

export function parseArgs(args: string[]): UploadMapOptions {
  const options: UploadMapOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--endpoint" || arg === "-e") {
      const val = args[++i];
      if (val !== undefined) options.endpoint = val;
    } else if (arg.startsWith("--endpoint=")) {
      options.endpoint = arg.slice("--endpoint=".length);
    } else if (arg === "--deploy-token" || arg === "-t") {
      const val = args[++i];
      if (val !== undefined) {
        options.deployToken = val;
        options.apiKey = val;
      }
    } else if (arg.startsWith("--deploy-token=")) {
      const val = arg.slice("--deploy-token=".length);
      options.deployToken = val;
      options.apiKey = val;
    } else if (arg === "--api-key" || arg === "-k" || arg === "--write-key") {
      const val = args[++i];
      if (val !== undefined) {
        options.apiKey = val;
        options.deployToken = val;
      }
    } else if (arg.startsWith("--api-key=")) {
      const val = arg.slice("--api-key=".length);
      options.apiKey = val;
      options.deployToken = val;
    } else if (arg === "--build-id" || arg === "-b") {
      const val = args[++i];
      if (val !== undefined) options.buildId = val;
    } else if (arg.startsWith("--build-id=")) {
      options.buildId = arg.slice("--build-id=".length);
    } else if (arg === "--repository" || arg === "-r") {
      const val = args[++i];
      if (val !== undefined) options.repository = val;
    } else if (arg.startsWith("--repository=")) {
      options.repository = arg.slice("--repository=".length);
    } else if (arg === "--commit-sha" || arg === "-c") {
      const val = args[++i];
      if (val !== undefined) options.commitSha = val;
    } else if (arg.startsWith("--commit-sha=")) {
      options.commitSha = arg.slice("--commit-sha=".length);
    } else if (arg === "--dir" || arg === "-d") {
      const val = args[++i];
      if (val !== undefined) options.dir = val;
    } else if (arg.startsWith("--dir=")) {
      options.dir = arg.slice("--dir=".length);
    }
  }
  return options;
}

export function findManifestFile(dirPath: string, buildId?: string): string | null {
  if (!existsSync(dirPath)) return null;

  if (buildId) {
    const directManifest = join(dirPath, `${buildId}.manifest.json`);
    if (existsSync(directManifest)) return directManifest;

    // Check if chunk files exist and consolidate on demand
    const chunkDir = join(dirPath, buildId);
    if (existsSync(chunkDir)) {
      consolidateComponentMap({ buildId, mappingDir: dirPath });
      if (existsSync(directManifest)) return directManifest;
    }

    return null;
  }

  // Look for any .manifest.json in the directory
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".manifest.json"));
  if (files.length === 1 && files[0]) {
    return join(dirPath, files[0]);
  }
  if (files.length > 1) {
    // Return the latest one if multiple exist
    const latest = files.sort().reverse()[0];
    if (latest) return join(dirPath, latest);
  }

  return null;
}

export async function uploadComponentMap(
  options: UploadMapOptions = {},
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ success: boolean; status: number; message: string; payload?: ComponentMapPayload }> {
  const endpoint = (
    options.endpoint ||
    process.env.ASKDEPTH_INGEST_URL ||
    "https://in.askdepth.com"
  ).replace(/\/+$/, "");

  const deployToken =
    options.deployToken ||
    options.apiKey ||
    process.env.ASKDEPTH_DEPLOY_TOKEN ||
    process.env.ASKDEPTH_API_KEY ||
    process.env.ASKDEPTH_WRITE_KEY;

  if (!deployToken) {
    return {
      success: false,
      status: 401,
      message: "Missing deploy token. Provide --deploy-token or set ASKDEPTH_DEPLOY_TOKEN environment variable.",
    };
  }

  const rawDir = options.dir || process.env.ASKDEPTH_COMPONENT_MAP_DIR || "./.askdepth/component-maps";
  const mappingDir = isAbsolute(rawDir) ? rawDir : resolve(process.cwd(), rawDir);

  let buildId = options.buildId;
  if (!buildId) {
    try {
      buildId = resolveBuildId({ mappingDir });
    } catch {
      // ignore resolution error if can't resolve from env
    }
  }

  const manifestPath = findManifestFile(mappingDir, buildId);
  if (!manifestPath || !existsSync(manifestPath)) {
    return {
      success: false,
      status: 404,
      message: `No component manifest found in ${mappingDir}${buildId ? ` for build ${buildId}` : ""}. Run production build first.`,
    };
  }

  let parsed: unknown;
  try {
    const content = readFileSync(manifestPath, "utf8");
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      success: false,
      status: 400,
      message: `Failed to read or parse manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (!obj.schema_version) {
      obj.schema_version = 1;
    }
    if (!obj.repository) {
      obj.repository = resolveRepository({ repository: options.repository });
    }
    if (!obj.commit_sha) {
      obj.commit_sha = resolveCommitSha({ commitSha: options.commitSha });
    }
    if (!obj.checksum && typeof obj.build_id === "string" && obj.mappings && typeof obj.mappings === "object") {
      try {
        obj.checksum = computeCanonicalMapChecksum(obj as any);
      } catch {
        // let safeParse surface validation error
      }
    }
  }

  const result = ComponentMapPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      status: 422,
      message: `Manifest at ${manifestPath} does not match ComponentMapPayloadSchema: ${result.error.message}`,
    };
  }

  const payload = result.data;
  const canonicalChecksum = computeCanonicalMapChecksum(payload);
  if (payload.checksum !== canonicalChecksum) {
    payload.checksum = canonicalChecksum;
  }

  const targetUrl = `${endpoint}/v1/component-maps`;

  try {
    const response = await fetchImpl(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-askdepth-deploy-token": deployToken,
        "x-askdepth-build-id": payload.build_id,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const count = Object.keys(payload.mappings).length;
      return {
        success: true,
        status: response.status,
        message: `Successfully uploaded component map for build "${payload.build_id}" (${count} components) to ${targetUrl}.`,
        payload,
      };
    }

    let responseText = "";
    try {
      responseText = await response.text();
    } catch {
      responseText = "";
    }

    return {
      success: false,
      status: response.status,
      message: `Upload failed (${response.status} ${response.statusText}): ${responseText}`,
      payload,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      message: `Network error uploading to ${targetUrl}: ${error instanceof Error ? error.message : String(error)}`,
      payload,
    };
  }
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);
  if (options.help) {
    console.log(HELP_TEXT);
    process.exitCode = 0;
    return;
  }
  const result = await uploadComponentMap(options);
  if (result.success) {
    console.log(`[Askdepth] ${result.message}`);
    process.exitCode = 0;
  } else {
    console.error(`[Askdepth] Error: ${result.message}`);
    process.exitCode = 1;
  }
}

// Execute when run directly as CLI
if (typeof process !== "undefined" && process.argv && /(upload-map|askdepth-upload-map)(\.[cm]?js)?$/.test(process.argv[1] ?? "")) {
  void runCli();
}
