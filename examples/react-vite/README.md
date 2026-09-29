# Askdepth React + Vite Example

This example demonstrates integrating `@askdepth/react` into a modern Vite + React application with automated component location tracking, error boundary handling, and the `askdepthVitePlugin` compiler AST transformer.

## Features Demonstrated

1. **`AskdepthProvider`**: Boots the SDK with credentials, handles consent lifecycle, and registers fiber component resolvers.
2. **`useAskdepth()` Hook**: Access to `track()`, `identify()`, session status, and distributed tracing metadata.
3. **`AskdepthCatch` Error Boundary**: Catches runtime component errors, captures React component stacks, and dispatches handled `ERROR_CLICK` events with AST source locations.
4. **SPA Route Navigation**: Automatic `page_view` emission upon `history.pushState` changes.
5. **`askdepthVitePlugin`**: Automatic AST injection of `data-askdepth-src` (in dev) or `data-askdepth-id` (in production) into JSX elements at build time.
6. **Live DOM & Event Inspector**: On-screen real-time stream of outbound telemetry and rendered DOM attributes.

## Quick Start

### 1. Build the Monorepo Packages
```bash
pnpm build
```

### 2. Run the Verification Script
Tests component mounting, action triggers (`track`, `identify`), SPA route navigation, error boundary reporting, and verifies the generated HTML attributes:
```bash
pnpm example:vite:verify
```

### 3. Run Vite Build
Compiles the application with `askdepthVitePlugin` and generates production bundles:
```bash
pnpm example:vite:build
```

### 4. Run Vite Dev Server
Starts the local interactive demo:
```bash
pnpm example:vite
```

### 5. Preview Production Build
Serves the production bundle built in step 3:
```bash
pnpm example:vite:preview
# or
pnpm example:vite:start
```
