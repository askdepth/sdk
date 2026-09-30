# Askdepth SDK — Next.js App Router Verification Example

This example demonstrates integrating `@askdepth/react` into a Next.js App Router application with automatic client boundary isolation, distributed tracing, automated SPA page-view tracking on `next/link` transitions, React Error Boundary (`<AskdepthCatch>`), and the Next.js compiler AST plugin (`withAskdepth`).

---

## Key Concepts Demonstrated

1. **Client Boundary Isolation (`'use client'`)**:
   - Next.js Server Components cannot access browser DOM or `window`.
   - `AskdepthProvider` lives inside `app/providers.tsx` behind `'use client'`, ensuring zero hydration errors and full SSR safety.
2. **`useAskdepth()` Hook**:
   - Access to `track()`, `identify()`, active `sessionId`, and W3C `traceparent`.
3. **App Router Navigation Tracking**:
   - Client navigation between `/`, `/orders`, `/billing`, and `/settings` via `next/link` automatically fires `page_view` without full page reloads.
4. **React Error Boundary (`<AskdepthCatch>`)**:
   - Catches runtime React component errors, preserves fiber component stack, and reports `ERROR_CLICK` with AST source mapping.
5. **Next.js Webpack AST Transformer (`withAskdepth`)**:
   - Stamped `data-askdepth-src` (in dev) or `data-askdepth-id` (in production) on JSX elements.
6. **Live Ingest Connection**:
   - Pre-configured to deliver real telemetry directly to Cloud Run:
     `https://analytics-ingest-927740258959.europe-west1.run.app/v1/telemetry` with write-key `my_dynamic_key_99`.

---

## Directory Structure

```
examples/nextjs-app/
├── app/
│   ├── layout.tsx         # RootLayout wrapping tree with <Providers>
│   ├── providers.tsx      # 'use client' AskdepthProvider configuration
│   ├── page.tsx           # Interactive verification dashboard
│   ├── orders/page.tsx    # Subpage for testing App Router page_view
│   ├── billing/page.tsx   # Subpage for testing App Router page_view
│   └── settings/page.tsx  # Subpage for testing App Router page_view
├── components/
│   └── Card.tsx           # Clean surface card UI
├── next.config.mjs        # withAskdepth compiler plugin integration
├── tsconfig.json          # Next.js TypeScript config
├── package.json           # Dependencies and scripts
└── .env.local.example     # Environment variables template
```

---

## How to Run

### 1. Install dependencies
From this directory:
```bash
pnpm install
```

### 2. Configure environment
Create `.env.local` (or use defaults already built into `providers.tsx`):
```bash
NEXT_PUBLIC_ASKDEPTH_WRITE_KEY=my_dynamic_key_99
NEXT_PUBLIC_ASKDEPTH_ENDPOINT=https://analytics-ingest-927740258959.europe-west1.run.app/v1/telemetry
```

### 3. Start development server
```bash
pnpm dev -p 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
