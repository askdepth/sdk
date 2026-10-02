# @askdepth/react

React 18+ and Next.js adapter for Askdepth. It mounts `@askdepth/core` from a client component, maps frustration clicks back to React components, and can stamp JSX with source locations at compile time.

- **Client-only:** the package entry starts with `'use client'`. Server Components import the provider without starting listeners.
- **Idempotent mount:** a second provider with the same config does not attach another set of core listeners.
- **Route changes:** `history.pushState`, `replaceState`, and `popstate` emit `page_view` events. Query strings and fragments are omitted; dynamic path segments are redacted, while a small allowlist of common static route names is retained. Next.js App Router navigation has not been verified end to end.
- **Component location:** `data-askdepth-src` / `data-askdepth-id` when the compiler plugin is installed, otherwise a React Fiber walk.

## Installation

```bash
pnpm add @askdepth/react @askdepth/core react react-dom
```

Peer dependencies: `react` and `react-dom` `>=18`. The compiler plugin dependencies (`unplugin`, Babel parser) install with this package and stay out of the browser runtime bundle.

## Provider

```tsx
'use client';

import { AskdepthProvider } from '@askdepth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AskdepthProvider
      writeKey={process.env.NEXT_PUBLIC_ASKDEPTH_WRITE_KEY!}
      endpoint={process.env.NEXT_PUBLIC_ASKDEPTH_ENDPOINT!}
      consent="granted"
      environment={process.env.NODE_ENV === 'production' ? 'production' : 'development'}
      replay={true}
    >
      {children}
    </AskdepthProvider>
  );
}
```

`useAskdepth()` returns `track`, `identify`, `getTraceparent`, `isReady`, and `getSessionId`. Outside the provider those methods are no-ops.

## Error boundary

`<AskdepthCatch>` reports a handled `ERROR_CLICK` through core's frustration event path, which triggers the replay flash when replay is enabled. Core uses a recent click selector when available, attaches the resolved component location, and sanitizes and bounds the error and React component stacks. The error message sent in telemetry is generic.

```tsx
import { AskdepthCatch } from '@askdepth/react';

<AskdepthCatch fallback={(error, reset) => <button onClick={reset}>{error.message}</button>}>
  <Checkout />
</AskdepthCatch>
```

## Compiler plugin

Development and staging add `data-askdepth-src="src/components/Button.tsx:42:10"`. Production adds `data-askdepth-id="cmp_"` plus the first 8 hex characters of SHA-256 over that same `path:line:column` label, keeping source file paths completely out of client bundles.

Production builds automatically consolidate component mappings on `buildEnd` / `closeBundle` into a single manifest:
```
.askdepth/component-maps/<build-id>.manifest.json
```

The plugin automatically detects the build ID from environment variables (`ASKDEPTH_BUILD_ID`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `BUILD_ID`) or options. For Vite, Webpack, and Rspack plugins, `buildId` and `mappingDir` override the defaults. Set `ASKDEPTH_COMPONENT_MAP_DIR` to customize the output folder.

```ts
import { askdepthVitePlugin } from '@askdepth/react/plugin';

export default defineConfig({
  plugins: [react(), askdepthVitePlugin({ environment: process.env.NODE_ENV })],
});
```

```js
const { withAskdepth } = require('@askdepth/react/plugin');

module.exports = withAskdepth({
  // existing Next config; the helper adds the plugin to client/server webpack and turbopack rules
});
```

Or push the plugin yourself in a Webpack build:

```js
const { askdepthWebpackPlugin } = require('@askdepth/react/plugin');

webpack(config) {
  config.plugins.push(askdepthWebpackPlugin({ environment: process.env.NODE_ENV }));
  return config;
}
```

For Turbopack, `withAskdepth` configures the loader automatically. For manual Turbopack loader setup in Next.js:

```js
module.exports = {
  turbopack: {
    rules: {
      '*.tsx': {
        loaders: ['@askdepth/react/turbopack-loader'],
        as: '*.tsx',
      },
      '*.jsx': {
        loaders: ['@askdepth/react/turbopack-loader'],
        as: '*.jsx',
      },
    },
  },
};
```

Without the plugin, `resolveComponentLocation` walks the Fiber tree from the DOM node and returns the nearest composite component name plus its ancestors.

## Component map upload CLI

Upload the compiled manifest to Askdepth Cloud Ingest using `askdepth-upload-map`:

```bash
# Upload using auto-detected buildId and env vars
askdepth-upload-map

# Or explicitly pass options
askdepth-upload-map \
  --endpoint https://in.askdepth.com \
  --api-key your_api_key \
  --build-id commit_sha \
  --dir ./.askdepth/component-maps
```

For CI/CD workflows (GitHub Actions, GitLab CI, Vercel), see [CI/CD Integration Guide](../../examples/ci-cd/README.md) and [Component Mapping Specification](../../docs/COMPONENT_MAPPING.md).

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `writeKey` | `string` | *(required)* | Client write key sent as `x-askdepth-write-key`. `apiKey` is an alias. |
| `projectId` | `string` | | UUID/CUID project identifier. Required when the write key is not itself a UUID/CUID. |
| `endpoint` | `string` | | Ingest URL. Required before collectors start. |
| `consent` | `'granted' \| 'denied' \| 'unknown'` | `'unknown'` | User consent state. |
| `buildId` | `string` | | Deployment / build identifier forwarded to telemetry envelopes. Falls back to `process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` or `NEXT_PUBLIC_ASKDEPTH_BUILD_ID`. |
| `replay` | `boolean \| object` | `false` | Session replay, forwarded to core. |
| `sampleRate` | `number` | `1` | Session sampling probability. |
| `environment` | `'production' \| 'staging' \| 'development'` | `'production'` | Forwarded to core. |
| `allowedTracingOrigins` | `string[]` | `[]` | Origins that receive `traceparent`. |

## Bundle budget

The runtime entry (`dist/index.mjs`) stays under 4.8 KB gzip. The compiler plugin is a separate Node entry and is not part of that budget.

## Ingest compatibility status

The local SDK and `apps/analytics-ingest` worktrees currently share protocol version `0.1.0`, telemetry envelope schemas, and the `x-askdepth-write-key` project-binding flow. Replay uploads use bounded binary chunks. The package version stays at its published `0.1.1`; this source change needs a Changesets-generated release before external consumers receive protocol `0.1.0`. The ingest Docker build has not been validated against that published dependency, and shared network conformance tests have not run. Treat browser write keys as publishable restricted keys, not secrets.

## License

MIT © [Askdepth](https://github.com/askdepth)
