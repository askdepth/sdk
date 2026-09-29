import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveComponentLocation } from '../src/index.js';

function NestedCard() {
  return (
    <div className="card">
      <button id="target-btn">Click Me</button>
    </div>
  );
}

function AppContainer() {
  return (
    <section className="wrapper">
      <NestedCard />
    </section>
  );
}

afterEach(() => {
  cleanup();
});

describe('React Fiber Runtime Walker', () => {
  it('extracts the composite stack for a host node', () => {
    const { container } = render(<AppContainer />);
    const button = container.querySelector('#target-btn') as HTMLElement;
    expect(button).not.toBeNull();
    const location = resolveComponentLocation(button);
    expect(location).not.toBeNull();
    expect(location?.componentName).toBe('NestedCard');
    expect(location?.componentStack).toContain('NestedCard');
    expect(location?.componentStack).toContain('AppContainer');
  });

  it('prefers data-askdepth-src and data-askdepth-id on the element', () => {
    const { container } = render(
      <button id="btn-compiled" data-askdepth-src="src/Button.tsx:10:5" data-askdepth-id="cmp_a7f9c2d1">
        Test
      </button>,
    );
    const button = container.querySelector('#btn-compiled') as HTMLElement;
    const location = resolveComponentLocation(button);
    expect(location?.sourceAttr).toBe('src/Button.tsx:10:5');
    expect(location?.hashId).toBe('cmp_a7f9c2d1');
    expect(location?.componentName).toBeTruthy();
  });

  it('returns null when the node has no fiber and no compiler attribute', () => {
    const orphan = document.createElement('div');
    expect(resolveComponentLocation(orphan)).toBeNull();
  });

  it('skips Askdepth frames and reads compiler props from an ancestor fiber', () => {
    const button = document.createElement('button');
    const fiber = {
      tag: 0,
      type: { displayName: 'AskdepthProvider' },
      memoizedProps: { 'data-askdepth-src': 12 },
      return: {
        tag: 11,
        type: { render: { displayName: 'FancyButton' } },
        memoizedProps: { 'data-askdepth-src': 'src/Card.tsx:4:2', 'data-askdepth-id': 'cmp_deadbeef' },
        return: {
          tag: 1,
          type: { name: 'Screen' },
          memoizedProps: null,
          return: null,
        },
      },
    };
    Object.defineProperty(button, '__reactFiber$test', { value: fiber });
    const location = resolveComponentLocation(button);
    expect(location?.componentName).toBe('FancyButton');
    expect(location?.componentStack).toEqual(['FancyButton', 'Screen']);
    expect(location?.sourceAttr).toBe('src/Card.tsx:4:2');
    expect(location?.hashId).toBe('cmp_deadbeef');
  });

  it('reads legacy fiber keys, memo wrappers, and anonymous components', () => {
    const button = document.createElement('button');
    const loop: { render?: object; displayName?: string } = {};
    loop.render = loop;
    const fiber = {
      tag: 15,
      type: loop,
      memoizedProps: null,
      return: {
        tag: 14,
        type: { type: { displayName: 'MemoRow' } },
        memoizedProps: null,
        return: {
          tag: 0,
          type: 'div',
          memoizedProps: null,
          return: null,
        },
      },
    };
    Object.defineProperty(button, '__reactInternalInstance$legacy', { value: fiber });
    const location = resolveComponentLocation(button);
    expect(location?.componentStack).toContain('MemoRow');
    expect(location?.componentStack).toContain('Anonymous');
  });

  it('stops after the fiber depth cap', () => {
    const button = document.createElement('button');
    let node: { tag: number; type: unknown; return: unknown; memoizedProps: null } = {
      tag: 0,
      type: { displayName: 'TooDeep' },
      return: null,
      memoizedProps: null,
    };
    for (let i = 0; i < 70; i += 1) {
      node = { tag: 5, type: 'div', return: node, memoizedProps: null };
    }
    Object.defineProperty(button, '__reactFiber$deep', { value: node });
    expect(resolveComponentLocation(button)).toBeNull();
  });

  it('ignores a host-only fiber', () => {
    const button = document.createElement('button');
    Object.defineProperty(button, '__reactFiber$host', {
      value: { tag: 5, type: 'button', memoizedProps: {}, return: null },
    });
    expect(resolveComponentLocation(button)).toBeNull();
  });

  it('safely handles symbol types without throwing', () => {
    const button = document.createElement('button');
    const fiber = {
      tag: 0,
      type: Symbol.for('react.fragment'),
      memoizedProps: null,
      return: {
        tag: 0,
        type: { displayName: 'SafeSymbolOwner' },
        memoizedProps: null,
        return: null,
      },
    };
    Object.defineProperty(button, '__reactFiber$symbol', { value: fiber });
    const location = resolveComponentLocation(button);
    expect(location?.componentName).toBe('SafeSymbolOwner');
    expect(location?.componentStack).toEqual(['SafeSymbolOwner']);
  });

  it('resolves lazy component names and falls back to pendingProps and alternate props', () => {
    const button = document.createElement('button');
    const fiber = {
      tag: 16,
      type: {
        _payload: {
          _result: { displayName: 'LazyLoadedWidget' },
        },
      },
      memoizedProps: null,
      pendingProps: { 'data-askdepth-src': 'src/LazyWidget.tsx:12:3' },
      alternate: {
        memoizedProps: { 'data-askdepth-id': 'cmp_lazy_123' },
      },
      return: null,
    };
    Object.defineProperty(button, '__reactFiber$lazy', { value: fiber });
    const location = resolveComponentLocation(button);
    expect(location?.componentName).toBe('LazyLoadedWidget');
    expect(location?.sourceAttr).toBe('src/LazyWidget.tsx:12:3');
    expect(location?.hashId).toBe('cmp_lazy_123');
  });
});
