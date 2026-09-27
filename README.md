# Askdepth SDK

High-performance TypeScript monorepo for Askdepth client packages. Each package is **independently versioned** via [Changesets](https://github.com/changesets/changesets).

## Packages

| Package | npm | Role |
|---|---|---|
| [`packages/contracts`](packages/contracts) | `@askdepth/contracts` | Zod schemas & types (events, anomalies, `traceparent`, telemetry envelope, replay slice manifest) |
| [`packages/core`](packages/core) | `@askdepth/core` | Browser RUM, heuristics, consent, tracing, batcher, kill-switch, lazy replay loader |
| [`packages/replay`](packages/replay) | `@askdepth/replay` | rrweb recorder + 45s Ring Buffer + Zero-PII masking + W3C keepalive upload |
| [`packages/react`](packages/react) | `@askdepth/react` | React 19 / Next.js provider + AST compiler plugin |

## Policy & Specification docs

- [`docs/SPRINT_2_REPLAY_SPEC.md`](docs/SPRINT_2_REPLAY_SPEC.md) — Session Replay architecture, Ring Buffer invariants, and Zero-PII masking specification
- [`docs/VERSIONING_AND_LIFECYCLE.md`](docs/VERSIONING_AND_LIFECYCLE.md) — SemVer, 12–18 month major lifecycle, kill-switch
- [`docs/RUNTIME_SUPPORT.md`](docs/RUNTIME_SUPPORT.md) — verified runtime matrix (no optimism)

## Examples

See [`examples/`](examples/):
- [`examples/session-replay`](examples/session-replay/) — visual replay demo with interactive player and frustration triggers.
- [`examples/browser-vanilla`](examples/browser-vanilla/) — standalone HTML/JS integration.
- [`examples/nextjs-app`](examples/nextjs-app/) — Next.js App Router integration.
- [`examples/vite-spa`](examples/vite-spa/) — Vite SPA integration.

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
pnpm size          # check bundle sizes via Turbo (@askdepth/core < 10 kB, @askdepth/replay < 35 kB)
pnpm size-limit    # check root size-limit assertions directly
pnpm changeset     # declare an independent version bump
```

## Release flow

1. On a PR: add a changeset (`pnpm changeset`) unless labelled `skip-changeset`.
2. Merge to `master` → Changesets opens/updates the **Version Packages** PR.
3. Merge that PR → `release.yml` publishes changed packages to npm with provenance.
4. Snapshot/canary: comment `/release:snapshot` or run `snapshot.yml` manually.

Requires Node ≥ 20 and pnpm 9.
