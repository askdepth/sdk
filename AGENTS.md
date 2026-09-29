# Repository Guidelines

## Project Structure & Module Organization

This pnpm workspace contains four TypeScript packages under `packages/`: `contracts` defines wire schemas, `core` implements browser telemetry and consent, `replay` records and uploads sessions, and `react` provides React integration and build plugins. Package source lives in `src/`, unit tests in `__tests__/`, and browser tests in `packages/core/e2e/` and `packages/replay/e2e/`. Use `examples/` for integration demos and `docs/` for runtime and replay specifications. Package builds write to `dist/`.

## Build, Test, and Development Commands

Use Node 20 or newer and pnpm 9. Run `pnpm install` to install workspace dependencies, `pnpm build` to build packages through Turbo, `pnpm test` for unit tests, and `pnpm lint` or `pnpm typecheck` for TypeScript checks. Run `pnpm size` after bundle changes. For focused work, use `pnpm --filter @askdepth/core test`; replace the package name as needed. After building, `node examples/smoke.mjs` checks the example integration.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, semicolons, and explicit types at public boundaries. Keep strict typing enabled; `tsconfig.base.json` also checks indexed access and optional properties. Use kebab-case filenames such as `replay-loader.ts`, camelCase functions, and PascalCase types and React components. Local imports in source use `.js` extensions. No separate formatter or ESLint configuration is defined; `pnpm lint` currently runs `tsc --noEmit`.

## Testing Guidelines

Place Vitest cases beside each package in `__tests__/` as `*.test.ts` or `*.test.tsx`. Core, replay, and React enforce 90% line coverage in their Vitest configurations. Add or update focused tests when behavior changes, especially for consent, privacy masking, replay, and wire contracts. Run browser integration tests with `pnpm --filter @askdepth/core test:e2e` or `pnpm --filter @askdepth/replay test:e2e` when those flows change.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commit subjects such as `feat(replay): ...`, `fix(release): ...`, and `docs: ...`. Use the same format for commits and PR titles; CI validates PR titles. In a PR, describe the change, affected packages, and checks run; link a related issue and include screenshots for visible example changes when applicable. Add a changeset with `pnpm changeset` for package changes, or use the `skip-changeset` label when no release note is needed.
