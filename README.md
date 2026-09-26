# Askdepth SDK

High-performance TypeScript monorepo for Askdepth client packages. Each package is **independently versioned** via [Changesets](https://github.com/changesets/changesets).

## Packages

| Package | npm | Role |
|---|---|---|
| [`packages/contracts`](packages/contracts) | `@askdepth/contracts` | Zod schemas & types (events, anomalies, `traceparent`, telemetry envelope) |
| [`packages/core`](packages/core) | `@askdepth/core` | Browser RUM, heuristics, consent, tracing, batcher, kill-switch |
| [`packages/replay`](packages/replay) | `@askdepth/replay` | rrweb wrapper + 45s ring buffer |
| [`packages/react`](packages/react) | `@askdepth/react` | React 19 / Next.js provider + AST compiler plugin |

## Policy docs

- [`docs/VERSIONING_AND_LIFECYCLE.md`](docs/VERSIONING_AND_LIFECYCLE.md) — SemVer, 12–18 month major lifecycle, kill-switch
- [`docs/RUNTIME_SUPPORT.md`](docs/RUNTIME_SUPPORT.md) — verified runtime matrix (no optimism)

## Examples

See [`examples/`](examples/) — SSR smoke, vanilla browser, Next.js App Router, Vite SPA.

```bash
pnpm build
node examples/smoke.mjs
```

## Workspace commands

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm size          # @askdepth/core must stay < 10 KB gzipped
pnpm changeset     # declare an independent version bump
```

## Release flow

1. On a PR: add a changeset (`pnpm changeset`) unless labelled `skip-changeset`.
2. Merge to `master` → Changesets opens/updates the **Version Packages** PR.
3. Merge that PR → `release.yml` publishes changed packages to npm with provenance.
4. Snapshot/canary: comment `/release:snapshot` or run `snapshot.yml` manually.

Requires Node ≥ 20 and pnpm 9.
