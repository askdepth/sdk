import type { ReactNode } from 'react';
import { AskdepthProvider } from './providers';

/**
 * Drop-in root layout fragment.
 * Copy into `app/layout.tsx` of a Next.js App Router project.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AskdepthProvider>{children}</AskdepthProvider>
      </body>
    </html>
  );
}
