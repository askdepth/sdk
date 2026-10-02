# Askdepth Component Map CI/CD Integration

This guide demonstrates how to automatically generate and upload component maps (`.manifest.json`) in your CI/CD pipelines (GitHub Actions, GitLab CI, Vercel).

## Overview

In production builds, `@askdepth/react` instruments React components with opaque hashed IDs (`cmp_xxxxxxxx`) instead of plain source paths. This keeps file paths and internal architecture private while allowing the Askdepth analytics engine to resolve errors and friction anomalies back to the exact component file, line, and column.

The component map (`.askdepth/component-maps/<buildId>.manifest.json`) must be uploaded to Askdepth Ingestion so it can resolve component hashes.

---

## Method 1: Automatic via `package.json` (`postbuild`)

The simplest approach is adding a `postbuild` script in `package.json`. npm, pnpm, and yarn automatically run `postbuild` after `build`:

```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "askdepth-upload-map"
  }
}
```

Ensure the following environment variables are set in your CI environment:
- `ASKDEPTH_API_KEY`: Your project ingestion API key or write key.
- `ASKDEPTH_INGEST_URL`: Ingestion server URL (e.g. `https://in.askdepth.com` or your Cloud Run URL).
- `ASKDEPTH_BUILD_ID`: (Optional) Deployment / commit SHA. If omitted, it automatically detects `GITHUB_SHA`, `VERCEL_GIT_COMMIT_SHA`, or `BUILD_ID`.

---

## Method 2: GitHub Actions

Copy [`github-actions.yml`](./github-actions.yml) into your `.github/workflows/deploy.yml`:

```yaml
- name: Build Application
  run: pnpm build
  env:
    NODE_ENV: production
    ASKDEPTH_BUILD_ID: ${{ github.sha }}

- name: Upload Component Map to Askdepth
  run: npx askdepth-upload-map
  env:
    ASKDEPTH_API_KEY: ${{ secrets.ASKDEPTH_API_KEY }}
    ASKDEPTH_INGEST_URL: https://in.askdepth.com
    ASKDEPTH_BUILD_ID: ${{ github.sha }}
```

---

## Method 3: Vercel Deployments

In Vercel project settings:
1. Under **Environment Variables**, add:
   - `ASKDEPTH_API_KEY`: `<your-write-key>`
   - `ASKDEPTH_INGEST_URL`: `<your-ingest-url>`
2. In `package.json`:
   ```json
   "scripts": {
     "build": "next build",
     "postbuild": "askdepth-upload-map"
   }
   ```
Vercel automatically exposes `VERCEL_GIT_COMMIT_SHA`, which `@askdepth/react` detects automatically as the `build_id`.

---

## CLI Options Reference

You can run `askdepth-upload-map` with flags:

```bash
askdepth-upload-map \
  --endpoint https://in.askdepth.com \
  --api-key your_api_key \
  --build-id commit_sha \
  --dir ./.askdepth/component-maps
```

| Flag | Shorthand | Environment Variable | Default |
|---|---|---|---|
| `--endpoint` | `-e` | `ASKDEPTH_INGEST_URL` | `https://in.askdepth.com` |
| `--api-key` | `-k`, `--write-key` | `ASKDEPTH_API_KEY`, `ASKDEPTH_WRITE_KEY` | *Required* |
| `--build-id` | `-b` | `ASKDEPTH_BUILD_ID`, `GITHUB_SHA`, `VERCEL_GIT_COMMIT_SHA` | Auto-detected |
| `--dir` | `-d` | `ASKDEPTH_COMPONENT_MAP_DIR` | `./.askdepth/component-maps` |
