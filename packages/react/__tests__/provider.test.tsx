import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Askdepth } from '@askdepth/core';
import { resetSdkForTests } from '../../core/src/reset.js';
import { AskdepthProvider, useAskdepth } from '../src/index.js';
import { resetInteractionMemoryForTests } from '../src/interaction.js';
import { resetPageViewsForTests } from '../src/page-view.js';

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

function granted(endpoint = 'https://ingest.test/v1') {
  return {
    writeKey: PROJECT,
    endpoint,
    consent: 'granted' as const,
    sampleRate: 1,
    environment: 'development' as const,
  };
}

function Probe() {
  const api = useAskdepth();
  return (
    <div>
      <span data-testid="ready">{String(api.isReady())}</span>
      <span data-testid="session">{api.getSessionId() ?? ''}</span>
      <span data-testid="trace">{api.getTraceparent() ?? ''}</span>
      <button type="button" onClick={() => api.track('checkout', { ok: true })}>
        track
      </button>
      <button type="button" onClick={() => api.identify('user_1', { plan: 'pro' })}>
        identify
      </button>
    </div>
  );
}

beforeEach(() => {
  resetSdkForTests();
  resetPageViewsForTests();
  resetInteractionMemoryForTests();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  resetPageViewsForTests();
  window.history.replaceState({}, '', '/');
  resetInteractionMemoryForTests();
  resetSdkForTests();
  vi.restoreAllMocks();
});

describe('<AskdepthProvider>', () => {
  it('does not initialize collection when its render suspends before commit', () => {
    const init = vi.spyOn(Askdepth, 'init');
    const pending = new Promise<never>(() => undefined);
    function SuspendedChild(): never {
      throw pending;
    }

    render(
      <React.Suspense fallback={<div>loading</div>}>
        <AskdepthProvider {...granted()}>
          <SuspendedChild />
        </AskdepthProvider>
      </React.Suspense>,
    );

    expect(screen.getByText('loading')).toBeTruthy();
    expect(init).not.toHaveBeenCalled();
  });

  it('updates hook readiness after commit and forwards calls once collectors are listening', async () => {
    const track = vi.spyOn(Askdepth, 'track');
    const identify = vi.spyOn(Askdepth, 'identify');
    render(
      <AskdepthProvider {...granted()}>
        <Probe />
      </AskdepthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'));
    expect(screen.getByTestId('session').textContent).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(screen.getByTestId('trace').textContent).toMatch(/^00-[0-9a-f]{32}-/i);
    fireEvent.click(screen.getByRole('button', { name: 'track' }));
    fireEvent.click(screen.getByRole('button', { name: 'identify' }));
    expect(track).toHaveBeenCalledWith('checkout', { ok: true });
    expect(identify).toHaveBeenCalledWith('user_1', { plan: 'pro' });
  });

  it('returns a no-op api outside the provider', () => {
    function Outside() {
      const api = useAskdepth();
      api.track('ignored');
      api.identify('ignored');
      return (
        <span data-testid="ready">
          {String(api.isReady())}:{String(api.getTraceparent())}:{String(api.getSessionId())}
        </span>
      );
    }
    render(<Outside />);
    expect(screen.getByTestId('ready').textContent).toBe('false:null:null');
  });

  it('does not attach a second set of core listeners for the same config', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const { unmount } = render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    const first = add.mock.calls.filter((call) => call[0] === 'pointerdown').length;
    unmount();
    render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    const second = add.mock.calls.filter((call) => call[0] === 'pointerdown').length;
    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('registers the React component resolver with core until unmount', () => {
    const unregister = vi.fn();
    const register = vi.spyOn(Askdepth, 'registerComponentResolver').mockReturnValue(unregister);
    const { unmount } = render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    const element = document.createElement('button');
    element.setAttribute('data-askdepth-src', 'src/components/Checkout.tsx:12');
    element.setAttribute('data-askdepth-id', 'checkout-button');

    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]?.[0](element)).toEqual({
      componentName: 'button',
      componentStack: ['button'],
      sourceAttr: 'src/components/Checkout.tsx:12',
      hashId: 'checkout-button',
    });
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('reinitializes when the endpoint changes', () => {
    const init = vi.spyOn(Askdepth, 'init');
    const { rerender } = render(
      <AskdepthProvider {...granted('https://a.test/v1')}>
        <div>child</div>
      </AskdepthProvider>,
    );
    rerender(
      <AskdepthProvider {...granted('https://b.test/v1')}>
        <div>child</div>
      </AskdepthProvider>,
    );
    expect(init).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: 'https://b.test/v1' }));
  });

  it('tracks native History API route navigations', () => {
    const track = vi.spyOn(Askdepth, 'track');
    render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    expect(track).toHaveBeenCalledWith('page_view', { url: '/' });
    track.mockClear();
    window.history.pushState({}, '', '/dashboard?tab=1');
    expect(track).toHaveBeenCalledWith('page_view', { url: '/dashboard' });
    track.mockClear();
    window.history.replaceState({}, '', '/settings');
    expect(track).toHaveBeenCalledWith('page_view', { url: '/settings' });
    track.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(track).toHaveBeenCalledWith('page_view', { url: '/settings' });
  });

  it('omits query parameters from the initial page view', () => {
    window.history.replaceState({}, '', '/account?token=secret');
    const track = vi.spyOn(Askdepth, 'track');
    render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );

    expect(track).toHaveBeenCalledWith('page_view', { url: '/account' });
    expect(track).not.toHaveBeenCalledWith('page_view', expect.objectContaining({ url: expect.stringContaining('secret') }));
  });

  it.each([
    ['/account/alice@example.com', '/account/:redacted'],
    ['/account/alice%40example.com', '/account/:redacted'],
    ['/users/123456789', '/users/:redacted'],
    ['/users/550e8400-e29b-41d4-a716-446655440000', '/users/:redacted'],
    ['/auth/eyJhbGciOiJIUzI1NiJ9.e30.signature', '/auth/:redacted'],
    ['/account/settings', '/account/settings'],
  ])('sanitizes page view pathname %s', (pathname, expected) => {
    window.history.replaceState({}, '', pathname);
    const track = vi.spyOn(Askdepth, 'track');
    render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    expect(track).toHaveBeenCalledWith('page_view', { url: expected });
  });

  it('bounds page view path length and segment count', () => {
    const longPath = `/${Array.from({ length: 40 }, () => 'users').join('/')}/${'x'.repeat(1_000)}`;
    window.history.replaceState({}, '', longPath);
    const track = vi.spyOn(Askdepth, 'track');
    render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    const url = track.mock.calls.find(([name]) => name === 'page_view')?.[1]?.url;
    expect(typeof url).toBe('string');
    expect((url as string).length).toBeLessThanOrEqual(256);
    expect(url).toMatch(/\/:truncated$/);
    expect(url).not.toContain('x'.repeat(20));
  });

  it('accepts apiKey as an alias for writeKey', () => {
    const init = vi.spyOn(Askdepth, 'init');
    render(
      <AskdepthProvider apiKey={PROJECT} endpoint="https://ingest.test/v1" consent="granted">
        <div>child</div>
      </AskdepthProvider>,
    );
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        writeKey: PROJECT,
        endpoint: 'https://ingest.test/v1',
      }),
    );
  });

  it('restores history and cleans up listeners when unmounted', () => {
    const origPush = window.history.pushState;
    const { unmount } = render(
      <AskdepthProvider {...granted()}>
        <div>child</div>
      </AskdepthProvider>,
    );
    expect(window.history.pushState).not.toBe(origPush);
    unmount();
    expect(window.history.pushState).toBe(origPush);
  });
});
