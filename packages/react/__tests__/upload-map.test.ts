import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { computeCanonicalMapChecksum } from "@askdepth/contracts";
import { findManifestFile, parseArgs, runCli, uploadComponentMap } from "../src/cli/upload-map.js";

describe("upload-map CLI", () => {
  describe("parseArgs", () => {
    it("parses short and long flags with separate or equal values", () => {
      expect(
        parseArgs([
          "-e",
          "http://localhost:8080",
          "-t",
          "tok123",
          "-b",
          "b1",
          "-r",
          "owner/repo",
          "-c",
          "0123456789abcdef0123456789abcdef01234567",
          "-d",
          "./maps",
        ]),
      ).toEqual({
        endpoint: "http://localhost:8080",
        deployToken: "tok123",
        apiKey: "tok123",
        buildId: "b1",
        repository: "owner/repo",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        dir: "./maps",
      });

      expect(
        parseArgs([
          "--endpoint=http://localhost:8080",
          "--deploy-token=tok123",
          "--build-id=b1",
          "--repository=owner/repo",
          "--commit-sha=0123456789abcdef0123456789abcdef01234567",
          "--dir=./maps",
        ]),
      ).toEqual({
        endpoint: "http://localhost:8080",
        deployToken: "tok123",
        apiKey: "tok123",
        buildId: "b1",
        repository: "owner/repo",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        dir: "./maps",
      });

      expect(parseArgs(["--api-key", "key_1"])).toEqual({
        apiKey: "key_1",
        deployToken: "key_1",
      });

      expect(parseArgs(["--write-key", "wk_1"])).toEqual({
        apiKey: "wk_1",
        deployToken: "wk_1",
      });

      expect(parseArgs(["-h"])).toEqual({
        help: true,
      });

      expect(parseArgs(["--help"])).toEqual({
        help: true,
      });
    });
  });

  describe("findManifestFile", () => {
    it("finds existing manifest directly", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "manifest-find-"));
      try {
        const manifestPath = join(tempDir, "my-build.manifest.json");
        writeFileSync(manifestPath, "{}");
        expect(findManifestFile(tempDir, "my-build")).toBe(manifestPath);
        expect(findManifestFile(tempDir)).toBe(manifestPath);

        const newerPath = join(tempDir, "z-build.manifest.json");
        writeFileSync(newerPath, "{}");
        expect(findManifestFile(tempDir)).toBe(newerPath);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("consolidates chunk files if manifest does not exist yet", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "manifest-chunk-find-"));
      try {
        const chunkDir = join(tempDir, "chunk-build");
        mkdirSync(chunkDir, { recursive: true });
        writeFileSync(
          join(chunkDir, "chunk1.json"),
          JSON.stringify({
            buildId: "chunk-build",
            locations: {
              cmp_ca8a0529: "src/Button.tsx:2:10",
            },
          }),
        );

        const found = findManifestFile(tempDir, "chunk-build");
        expect(found).toBe(join(tempDir, "chunk-build.manifest.json"));
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("returns null when directory does not exist or has no manifests", () => {
      expect(findManifestFile("/non-existent-dir-12345")).toBeNull();
      const emptyDir = mkdtempSync(join(tmpdir(), "empty-manifest-"));
      try {
        expect(findManifestFile(emptyDir, "unknown-build")).toBeNull();
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("uploadComponentMap", () => {
    it("fails with 401 when deploy token is missing", async () => {
      const prevKey = process.env.ASKDEPTH_API_KEY;
      const prevWrite = process.env.ASKDEPTH_WRITE_KEY;
      const prevDeploy = process.env.ASKDEPTH_DEPLOY_TOKEN;
      try {
        delete process.env.ASKDEPTH_API_KEY;
        delete process.env.ASKDEPTH_WRITE_KEY;
        delete process.env.ASKDEPTH_DEPLOY_TOKEN;
        const result = await uploadComponentMap({});
        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
        expect(result.message).toContain("Missing deploy token");
      } finally {
        if (prevKey !== undefined) process.env.ASKDEPTH_API_KEY = prevKey;
        if (prevWrite !== undefined) process.env.ASKDEPTH_WRITE_KEY = prevWrite;
        if (prevDeploy !== undefined) process.env.ASKDEPTH_DEPLOY_TOKEN = prevDeploy;
      }
    });

    it("fails with 404 when manifest does not exist", async () => {
      const result = await uploadComponentMap({
        deployToken: "tok_123",
        dir: "/tmp/non-existent-dir-for-askdepth-test-9999",
      });
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.message).toContain("No component manifest found");
    });

    it("fails with 400 when manifest JSON is invalid", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "invalid-json-manifest-"));
      try {
        writeFileSync(join(tempDir, "bad.manifest.json"), "{ invalid json");
        const result = await uploadComponentMap({
          deployToken: "tok_123",
          dir: tempDir,
          buildId: "bad",
        });
        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain("Failed to read or parse");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("fails with 422 when manifest does not match ComponentMapPayloadSchema", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "invalid-manifest-"));
      try {
        writeFileSync(
          join(tempDir, "invalid.manifest.json"),
          JSON.stringify({ build_id: "b1", created_at: "now", mappings: { bad_key: {} } }),
        );
        const result = await uploadComponentMap({
          deployToken: "tok_123",
          dir: tempDir,
          buildId: "invalid",
        });
        expect(result.success).toBe(false);
        expect(result.status).toBe(422);
        expect(result.message).toContain("does not match ComponentMapPayloadSchema");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("uploads valid manifest successfully and passes headers and canonical checksum", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "valid-manifest-"));
      try {
        const payload = {
          build_id: "build-success-123",
          created_at: new Date().toISOString(),
          mappings: {
            cmp_ca8a0529: {
              file: "src/Button.tsx",
              line: 2,
              col: 10,
            },
          },
        };
        writeFileSync(join(tempDir, "build-success-123.manifest.json"), JSON.stringify(payload));

        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
          expect(init?.method).toBe("POST");
          const headers = init?.headers as Record<string, string>;
          expect(headers["content-type"]).toBe("application/json");
          expect(headers["x-askdepth-deploy-token"]).toBe("secret-deploy-token");
          expect(headers["x-askdepth-build-id"]).toBe("build-success-123");
          expect(headers["x-askdepth-api-key"]).toBeUndefined();

          const sentBody = JSON.parse(String(init?.body));
          expect(sentBody.schema_version).toBe(1);
          expect(sentBody.build_id).toBe("build-success-123");
          expect(sentBody.checksum).toBe(computeCanonicalMapChecksum(sentBody));
          return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        });

        const result = await uploadComponentMap(
          {
            deployToken: "secret-deploy-token",
            dir: tempDir,
            buildId: "build-success-123",
            endpoint: "https://custom-ingest.test",
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(true);
        expect(result.status).toBe(200);
        expect(result.message).toContain("Successfully uploaded component map");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("handles server error response gracefully", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "server-err-manifest-"));
      try {
        const payload = {
          build_id: "build-500",
          created_at: new Date().toISOString(),
          mappings: {},
        };
        writeFileSync(join(tempDir, "build-500.manifest.json"), JSON.stringify(payload));

        const fetchMock = vi.fn(async () => new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }));

        const result = await uploadComponentMap(
          {
            deployToken: "key",
            dir: tempDir,
            buildId: "build-500",
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(500);
        expect(result.message).toContain("Upload failed (500 Internal Server Error): Internal Server Error");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("handles network failure gracefully", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "network-err-manifest-"));
      try {
        const payload = {
          build_id: "build-net",
          created_at: new Date().toISOString(),
          mappings: {},
        };
        writeFileSync(join(tempDir, "build-net.manifest.json"), JSON.stringify(payload));

        const fetchMock = vi.fn(async () => {
          throw new Error("fetch failed");
        });

        const result = await uploadComponentMap(
          {
            deployToken: "key",
            dir: tempDir,
            buildId: "build-net",
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(0);
        expect(result.message).toContain("Network error uploading");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("runCli", () => {
    it("sets exitCode to 0 on success and 1 on error", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        await runCli(["--deploy-token", ""]);
        expect(process.exitCode).toBe(1);
        expect(error).toHaveBeenCalled();
      } finally {
        log.mockRestore();
        error.mockRestore();
        process.exitCode = 0;
      }
    });

    it("displays help text and exits with code 0 on --help or -h", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await runCli(["--help"]);
        expect(process.exitCode).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage: askdepth-upload-map"));

        log.mockClear();
        await runCli(["-h"]);
        expect(process.exitCode).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage: askdepth-upload-map"));
      } finally {
        log.mockRestore();
        process.exitCode = 0;
      }
    });
  });

  describe("environment variables fallback in uploadComponentMap", () => {
    it("uses ASKDEPTH_INGEST_URL and ASKDEPTH_DEPLOY_TOKEN when options not passed", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "env-fallback-"));
      const prevUrl = process.env.ASKDEPTH_INGEST_URL;
      const prevKey = process.env.ASKDEPTH_KEY;
      const prevWrite = process.env.ASKDEPTH_WRITE_KEY;
      const prevDeploy = process.env.ASKDEPTH_DEPLOY_TOKEN;
      try {
        process.env.ASKDEPTH_INGEST_URL = "https://ingest-env.test";
        process.env.ASKDEPTH_DEPLOY_TOKEN = "deploy-token-env";
        delete process.env.ASKDEPTH_API_KEY;
        delete process.env.ASKDEPTH_WRITE_KEY;

        const payload = {
          build_id: "build-env",
          created_at: new Date().toISOString(),
          mappings: {},
        };
        writeFileSync(join(tempDir, "build-env.manifest.json"), JSON.stringify(payload));

        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
          expect(String(_url)).toBe("https://ingest-env.test/v1/component-maps");
          const headers = init?.headers as Record<string, string>;
          expect(headers["x-askdepth-deploy-token"]).toBe("deploy-token-env");
          expect(headers["x-askdepth-build-id"]).toBe("build-env");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });

        const result = await uploadComponentMap(
          {
            dir: tempDir,
            buildId: "build-env",
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(true);
      } finally {
        if (prevUrl !== undefined) process.env.ASKDEPTH_INGEST_URL = prevUrl;
        else delete process.env.ASKDEPTH_INGEST_URL;
        if (prevKey !== undefined) process.env.ASKDEPTH_API_KEY = prevKey;
        else delete process.env.ASKDEPTH_API_KEY;
        if (prevWrite !== undefined) process.env.ASKDEPTH_WRITE_KEY = prevWrite;
        else delete process.env.ASKDEPTH_WRITE_KEY;
        if (prevDeploy !== undefined) process.env.ASKDEPTH_DEPLOY_TOKEN = prevDeploy;
        else delete process.env.ASKDEPTH_DEPLOY_TOKEN;
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
