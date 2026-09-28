import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  askdepthRspackPlugin,
  askdepthUnplugin,
  askdepthVitePlugin,
  askdepthWebpackPlugin,
  createAskdepthPlugin,
  withAskdepth,
} from '../src/plugin/index.js';
import { askdepthVitePlugin as viteEntry } from '../src/plugin/vite.js';
import { askdepthWebpackPlugin as webpackEntry } from '../src/plugin/webpack.js';
import { askdepthRspackPlugin as rspackEntry } from '../src/plugin/rspack.js';
import { hashComponentId, shouldTransform, sourceLabel, transformJsxSource } from '../src/plugin/transformers/jsx-attribute.js';
import askdepthTurbopackLoader from '../src/turbopack-loader.js';

const BUTTON = 'export function Button() {\n  return <button id="go">Go</button>;\n}\n';

describe('jsx attribute transform', () => {
  it('stamps a development source location on host and composite elements', () => {
    const result = transformJsxSource(BUTTON, 'src/components/Button.tsx', { production: false });
    expect(result?.code).toContain('data-askdepth-src="src/components/Button.tsx:2:10"');
    const card = transformJsxSource('export const view = <Card />;\n', 'src/Card.tsx', { production: false });
    expect(card?.code).toContain('data-askdepth-src=');
  });

  it('keeps typescript assertions parseable', () => {
    const result = transformJsxSource(
      "export const view = <button id={'a' as string}>x</button>;\n",
      'src/Button.tsx',
      { production: false },
    );
    expect(result?.code).toContain('data-askdepth-src=');
  });

  it('hashes the location in production and stays stable', () => {
    const first = transformJsxSource(BUTTON, 'src/components/Button.tsx', { production: true });
    const second = transformJsxSource(BUTTON, 'src/components/Button.tsx', { production: true });
    const label = sourceLabel('src/components/Button.tsx', 2, 10);
    const id = hashComponentId(label);
    expect(id).toMatch(/^cmp_[0-9a-f]{8}$/);
    expect(first?.code).toContain(`data-askdepth-id="${id}"`);
    expect(first?.code).not.toContain('Button.tsx');
    expect(second?.code).toBe(first?.code);
  });

  it('relativizes absolute filenames', () => {
    const absolute = `${process.cwd()}/src/components/Button.tsx`;
    const result = transformJsxSource(BUTTON, absolute, { production: false });
    expect(result?.code).toContain('src/components/Button.tsx:2:10');
  });

  it('does not stamp twice and ignores fragments, bad syntax, and non-jsx files', () => {
    const once = transformJsxSource(BUTTON, 'src/components/Button.tsx', { production: false });
    expect(transformJsxSource(once?.code ?? '', 'src/components/Button.tsx', { production: false })).toBeNull();
    expect(transformJsxSource('export const view = <></>;\n', 'src/Frag.tsx', { production: false })).toBeNull();
    expect(transformJsxSource('const v = <button', 'src/Broken.tsx', { production: false })).toBeNull();
    expect(transformJsxSource('export const value = 1;\n', 'src/plain.ts', { production: false })).toBeNull();
    expect(transformJsxSource('<button />', 'src/Button.tsx?v=1', { production: false })?.code).toContain(
      'data-askdepth-src="src/Button.tsx:',
    );
  });

  it('stamps compiled jsx and jsxDEV calls, not user functions named jsx', () => {
    const compiled = [
      "import { jsx } from 'react/jsx-runtime';",
      "export const el = jsx('button', { id: 'go', children: 'Go' });",
      '',
    ].join('\n');
    expect(transformJsxSource(compiled, 'src/Button.tsx', { production: false })?.code).toContain('data-askdepth-src');

    const dev = [
      "import { jsxDEV } from 'react/jsx-dev-runtime';",
      "export const el = jsxDEV('button', { children: 'Go' }, void 0, false, { fileName: 'src/Button.tsx', lineNumber: 4, columnNumber: 2 }, this);",
      '',
    ].join('\n');
    expect(transformJsxSource(dev, 'src/Button.tsx', { production: false })?.code).toContain(':4:2');

    const local = ['function jsx(type, props) { return props; }', "jsx('button', { id: 'x' });", ''].join('\n');
    expect(transformJsxSource(local, 'src/local.tsx', { production: false })).toBeNull();
  });

  it('transforms JavaScript (.js) files that contain JSX or compiled JSX', () => {
    const rawJs = 'export function Page() {\n  return <main><h1>Title</h1></main>;\n}\n';
    const transformed = transformJsxSource(rawJs, 'src/pages/index.js', { production: false });
    expect(transformed?.code).toContain('data-askdepth-src="src/pages/index.js:2:10"');

    const compiledJs = [
      "import { jsx } from 'react/jsx-runtime';",
      "export const el = jsx('div', { id: 'app' });",
      '',
    ].join('\n');
    const transformedCompiled = transformJsxSource(compiledJs, 'src/components/App.js', { production: false });
    expect(transformedCompiled?.code).toContain('data-askdepth-src');

    expect(transformJsxSource('export const num = 42;\n', 'src/utils.js', { production: false })).toBeNull();
  });

  it('filters ids', () => {
    expect(shouldTransform('src/App.tsx')).toBe(true);
    expect(shouldTransform('src/App.tsx?t=1#hash')).toBe(true);
    expect(shouldTransform('src/App.ts')).toBe(false);
    expect(shouldTransform('src/pages/index.js')).toBe(true);
    expect(shouldTransform('src/pages/index.js', 'export const x = 1;')).toBe(false);
    expect(shouldTransform('src/pages/index.js', 'export const x = <div />;')).toBe(true);
    expect(shouldTransform('/repo/node_modules/pkg/App.tsx')).toBe(false);
    expect(shouldTransform('/repo/node_modules/pkg/App.js')).toBe(false);
    expect(shouldTransform('\0virtual.tsx')).toBe(false);
    expect(sourceLabel('src\\Button.tsx', 1, 1)).toBe('src/Button.tsx:1:1');
  });
});

describe('unplugin adapters', () => {
  it('passes a source map for transformed JSX to the bundler', () => {
    const result = createAskdepthPlugin({ environment: 'development' }).transform(
      BUTTON,
      'src/components/Button.tsx',
    );

    expect(result).toMatchObject({
      map: {
        version: 3,
        sources: ['src/components/Button.tsx'],
        sourcesContent: [BUTTON],
        mappings: expect.any(String),
      },
    });
  });

  it('exposes vite, webpack, and rspack plugins', () => {
    const vite = askdepthVitePlugin({ environment: 'development' });
    const fromEntry = viteEntry({ environment: 'staging' });
    const resolved = Array.isArray(vite) ? vite[0] : vite;
    expect(resolved?.name).toContain('askdepth');
    expect(fromEntry).toBeTruthy();
    expect(askdepthWebpackPlugin()).toBeTruthy();
    expect(webpackEntry()).toBeTruthy();
    expect(askdepthRspackPlugin()).toBeTruthy();
    expect(rspackEntry()).toBeTruthy();
    expect(askdepthUnplugin).toBeTruthy();
  });

  it('uses source locations outside production and hashes in production', () => {
    const dev = createAskdepthPlugin({ environment: 'staging' });
    expect(dev.transformInclude('src/App.tsx')).toBe(true);
    expect(dev.transformInclude('src/App.ts')).toBe(false);
    expect(dev.transformInclude('/node_modules/pkg/App.tsx')).toBe(false);
    const stamped = dev.transform(BUTTON, 'src/components/Button.tsx');
    expect(stamped && 'code' in stamped ? stamped.code : stamped).toContain('data-askdepth-src');

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const prod = createAskdepthPlugin();
      const hashed = prod.transform('export const view = <b />;\n', 'src/App.tsx');
      expect(hashed && 'code' in hashed ? hashed.code : hashed).toContain('data-askdepth-id');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('composes a Next.js webpack hook and skips the server compiler', () => {
    const client = { plugins: [] as unknown[] };
    const composed = withAskdepth({
      webpack(config) {
        config.plugins.push('previous');
        return config;
      },
    });
    composed.webpack(client, { isServer: false, dev: true });
    expect(client.plugins).toHaveLength(2);
    expect(client.plugins[0]).toBe('previous');
    expect(client.plugins[1]).not.toBe('previous');

    const server = { plugins: [] as unknown[] };
    withAskdepth().webpack(server, { isServer: true, dev: false });
    expect(server.plugins).toHaveLength(0);

    const prod = { plugins: [] as unknown[] };
    withAskdepth().webpack(prod, { isServer: false, dev: false });
    expect(prod.plugins).toHaveLength(1);
  });

  it('appends to the client config returned by an existing webpack hook', () => {
    const replacement = { plugins: ['user-returned-plugin'] as unknown[] };
    const result = withAskdepth({
      webpack() {
        return replacement;
      },
    }).webpack({ plugins: [] }, { isServer: false, dev: true });

    expect(result).toBe(replacement);
    expect(result.plugins).toHaveLength(2);
    expect(result.plugins[0]).toBe('user-returned-plugin');
    expect(result.plugins[1]).not.toBe('user-returned-plugin');
  });

  it('loads tsx for turbopack and leaves non-jsx source untouched', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const code = askdepthTurbopackLoader.call({ resourcePath: 'src/Button.tsx' }, BUTTON);
      expect(code).toContain('data-askdepth-src');
      expect(askdepthTurbopackLoader.call({ resourcePath: 'src/plain.ts' }, 'export const value = 1;\n')).toBe(
        'export const value = 1;\n',
      );
      const broken = askdepthTurbopackLoader.call(undefined, 'const v = <');
      expect(broken).toBe('const v = <');
    } finally {
      process.env.NODE_ENV = previous;
    }

    process.env.NODE_ENV = 'production';
    try {
      const hashed = askdepthTurbopackLoader.call({ resourcePath: 'src/Button.tsx' }, BUTTON);
      expect(hashed).toContain('data-askdepth-id');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('passes transformed source and its map through the Turbopack loader callback', () => {
    const callback = vi.fn();
    const returned = askdepthTurbopackLoader.call(
      { resourcePath: 'src/components/Button.tsx', callback },
      BUTTON,
    );

    expect(returned).toBeUndefined();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.stringContaining('data-askdepth-src'),
      expect.objectContaining({
        version: 3,
        sources: ['src/components/Button.tsx'],
        sourcesContent: [BUTTON],
        mappings: expect.any(String),
      }),
    );
  });
});

describe('hash helper', () => {
  it('matches a direct sha256 prefix', () => {
    const digest = createHash('sha256').update('src/A.tsx:1:1').digest('hex').slice(0, 8);
    expect(hashComponentId('src/A.tsx:1:1')).toBe(`cmp_${digest}`);
  });
});
