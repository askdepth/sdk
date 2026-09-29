/**
 * @vitest-environment node
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AskdepthProvider } from '../src/index.js';

describe('SSR Safety Check (Node Environment)', () => {
  it('renders on the server without window or document', () => {
    expect(typeof window).toBe('undefined');
    const renderToString = () =>
      ReactDOMServer.renderToString(
        <AskdepthProvider writeKey="test-key" endpoint="https://example.test/v1">
          <div>Server Rendered Content</div>
        </AskdepthProvider>,
      );
    expect(renderToString).not.toThrow();
    expect(renderToString()).toContain('Server Rendered Content');
  });
});
