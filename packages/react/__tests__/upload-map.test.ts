import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findManifestFile, parseArgs, runCli, uploadComponentMap } from '../src/cli/upload-map.js';

describe('upload-map CLI', () => {
  describe('parseArgs', () => {
    it('parses short and long flags with separate or equal values', () => {
      expect(parseArgs(['-e', 'http://localhost:8080', '-k', 'key123', '-b', 'b1', '-d', './maps'])).toEqual({
        endpoint: 'http://localhost:8080',
        apiKey: 'key123',
        buildId: 'b1',
        dir: './maps',
      });

      expect(parseArgs(['--endpoint=http://localhost:8080', '--api-key=key123', '--build-id=b1', '--dir=./maps'])).toEqual({
        endpoint: 'http://localhost:8080',
        apiKey: 'key123',
        buildId: 'b1',
        dir: './maps',
      });

      expect(parseArgs(['--write-key', 'wk_1'])).toEqual({
        apiKey: 'wk_1',
      });
    });
  });

  describe('findManifestFile', () => {
    it('finds existing manifest directly', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'manifest-find-'));
      try {
        const manifestPath = join(tempDir, 'my-build.manifest.json');
        writeFileSync(manifestPath, '{}');
        expect(findManifestFile(tempDir, 'my-build')).toBe(manifestPath);
        expect(findManifestFile(tempDir)).toBe(manifestPath);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('consolidates chunk files if manifest does not exist yet', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'manifest-chunk-find-'));
      try {
        const chunkDir = join(tempDir, 'chunk-build');
        mkdirSync(chunkDir, { recursive: true });
        writeFileSync(
          join(chunkDir, 'chunk1.json'),
          JSON.stringify({
            buildId: 'chunk-build',
            locations: {
              cmp_ca8a0529: 'src/Button.tsx:2:10',
            },
          }),
        );

        const found = findManifestFile(tempDir, 'chunk-build');
        expect(found).toBe(join(tempDir, 'chunk-build.manifest.json'));
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('returns null when directory does not exist or has no manifests', () => {
      expect(findManifestFile('/non-existent-dir-12345')).toBeNull();
      const emptyDir = mkdtempSync(join(tmpdir(), 'empty-manifest-'));
      try {
        expect(findManifestFile(emptyDir, 'unknown-build')).toBeNull();
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('uploadComponentMap', () => {
    it('fails with 401 when API key is missing', async () => {
      const prevKey = process.env.ASKDEPTH_API_KEY;
      const prevWrite = process.env.ASKDEPTH_WRITE_KEY;
      delete process.env.ASKDEPTH_API_KEY;
      delete process.env.ASKDEPTH_WRITE_KEY;
      try {
        const result = await uploadComponentMap({});
        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
        expect(result.message).toContain('Missing API key');
      } finally {
        if (prevKey !== undefined) process.env.ASKDEPTH_API_KEY = prevKey;
        if (prevWrite !== undefined) process.env.ASKDEPTH_WRITE_KEY = prevWrite;
      }
    });

    it('fails with 404 when manifest cannot be found', async () => {
      const result = await uploadComponentMap({
        apiKey: 'key_123',
        dir: '/non-existent-dir-maps',
      });
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.message).toContain('No component manifest found');
    });

    it('fails with 400 when manifest JSON is corrupted', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'corrupt-manifest-'));
      try {
        writeFileSync(join(tempDir, 'bad.manifest.json'), '{ not valid json');
        const result = await uploadComponentMap({
          apiKey: 'key_123',
          dir: tempDir,
          buildId: 'bad',
        });
        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain('Failed to read or parse');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('fails with 422 when manifest does not match ComponentMapPayloadSchema', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'invalid-manifest-'));
      try {
        writeFileSync(
          join(tempDir, 'invalid.manifest.json'),
          JSON.stringify({ build_id: 'b1', created_at: 'now', mappings: { bad_key: {} } }),
        );
        const result = await uploadComponentMap({
          apiKey: 'key_123',
          dir: tempDir,
          buildId: 'invalid',
        });
        expect(result.success).toBe(false);
        expect(result.status).toBe(422);
        expect(result.message).toContain('does not match ComponentMapPayloadSchema');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('uploads valid manifest successfully and passes headers and payload', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'valid-manifest-'));
      try {
        const payload = {
          build_id: 'build-success-123',
          created_at: new Date().toISOString(),
          mappings: {
            cmp_ca8a0529: {
              file: 'src/Button.tsx',
              line: 2,
              col: 10,
            },
          },
        };
        writeFileSync(join(tempDir, 'build-success-123.manifest.json'), JSON.stringify(payload));

        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
          expect(init?.method).toBe('POST');
          const headers = init?.headers as Record<string, string>;
          expect(headers['content-type']).toBe('application/json');
          expect(headers['x-askdepth-api-key']).toBe('secret-api-key');
          expect(headers['x-askdepth-write-key']).toBe('secret-api-key');
          expect(JSON.parse(String(init?.body))).toEqual(payload);
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        });

        const result = await uploadComponentMap(
          {
            apiKey: 'secret-api-key',
            dir: tempDir,
            buildId: 'build-success-123',
            endpoint: 'https://custom-ingest.test',
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(true);
        expect(result.status).toBe(200);
        expect(result.message).toContain('Successfully uploaded component map');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles server error response gracefully', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'server-err-manifest-'));
      try {
        const payload = {
          build_id: 'build-500',
          created_at: new Date().toISOString(),
          mappings: {},
        };
        writeFileSync(join(tempDir, 'build-500.manifest.json'), JSON.stringify(payload));

        const fetchMock = vi.fn(async () => new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }));

        const result = await uploadComponentMap(
          {
            apiKey: 'key',
            dir: tempDir,
            buildId: 'build-500',
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(500);
        expect(result.message).toContain('Upload failed (500 Internal Server Error): Internal Server Error');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles network failure gracefully', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'network-err-manifest-'));
      try {
        const payload = {
          build_id: 'build-net',
          created_at: new Date().toISOString(),
          mappings: {},
        };
        writeFileSync(join(tempDir, 'build-net.manifest.json'), JSON.stringify(payload));

        const fetchMock = vi.fn(async () => {
          throw new Error('fetch failed');
        });

        const result = await uploadComponentMap(
          {
            apiKey: 'key',
            dir: tempDir,
            buildId: 'build-net',
          },
          fetchMock as unknown as typeof fetch,
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(0);
        expect(result.message).toContain('Network error uploading');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('runCli', () => {
    it('sets exitCode to 0 on success and 1 on error', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await runCli(['--api-key', '']);
        expect(process.exitCode).toBe(1);
        expect(error).toHaveBeenCalled();
      } finally {
        log.mockRestore();
        error.mockRestore();
        process.exitCode = 0;
      }
    });
  });
});
