import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Askdepth } from '@askdepth/core';
import { resetSdkForTests } from '../../core/src/reset.js';
import { AskdepthCatch, AskdepthProvider } from '../src/index.js';
import { getLastUserInteraction, installInteractionMemory, resetInteractionMemoryForTests } from '../src/interaction.js';
import { resetPageViewsForTests } from '../src/page-view.js';

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

function sentEvents(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.flatMap((call) => {
    const body = (call[1] as RequestInit | undefined)?.body;
    if (typeof body !== 'string') return [];
    return (JSON.parse(body) as { events: Array<Record<string, unknown>> }).events;
  });
}

function bootCore(fetchMock: ReturnType<typeof vi.fn>): void {
  window.fetch = fetchMock as typeof fetch;
  Askdepth.init({ writeKey: PROJECT, endpoint: 'https://ingest.test/v1', consent: 'granted', sampleRate: 1 });
}

beforeEach(() => {
  resetSdkForTests();
  resetPageViewsForTests();
  resetInteractionMemoryForTests();
  document.body.innerHTML = '';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  resetPageViewsForTests();
  resetInteractionMemoryForTests();
  resetSdkForTests();
  vi.restoreAllMocks();
});

describe('<AskdepthCatch>', () => {
  it('sends a handled ERROR_CLICK with bounded, sanitized error details', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    window.fetch = fetchMock as typeof fetch;
    function SensitiveBomb() {
      const [crash, setCrash] = useState(false);
      if (crash) {
        const error = new Error('Failed at https://api.test/pay?token=secret-value');
        error.stack = 'Error: failed\n at https://api.test/pay?token=secret-value:9:2';
        throw error;
      }
      return <button onClick={() => setCrash(true)}>crash</button>;
    }
    render(
      <AskdepthProvider writeKey={PROJECT} endpoint="https://ingest.test/v1" consent="granted" sampleRate={1}>
        <AskdepthCatch fallback={<div>fallback</div>}>
          <SensitiveBomb />
        </AskdepthCatch>
      </AskdepthProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'crash' }));
    await vi.waitFor(() => {
      const events = sentEvents(fetchMock);
      const event = events.find((item) => item.type === 'ERROR_CLICK');
      expect(event).toMatchObject({
        type: 'ERROR_CLICK',
        target_selector: expect.any(String),
        error_type: 'js_exception',
        error_details: {
          message: 'React component error',
          stack: expect.any(String),
          component_stack: expect.stringContaining('SensitiveBomb'),
          handled: true,
        },
        time_to_error_ms: expect.any(Number),
      });
      expect(String(event?.target_selector).length).toBeGreaterThan(0);
      const details = event?.error_details as { component_stack: string };
      expect(details.component_stack.length).toBeLessThanOrEqual(1200);
      expect(details.component_stack).not.toContain('https://');
      expect(details.component_stack).not.toContain('catch.test.tsx');
      expect(JSON.stringify(event)).not.toContain('secret-value');
    });
  });

  it('reports a render failure caught during the provider’s first commit', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    window.fetch = fetchMock as typeof fetch;
    render(
      <AskdepthProvider writeKey={PROJECT} endpoint="https://ingest.test/v1" consent="granted" sampleRate={1}>
        <AskdepthCatch fallback={<div>fallback</div>}>
          <Problematic />
        </AskdepthCatch>
      </AskdepthProvider>,
    );
    await vi.waitFor(() => {
      expect(sentEvents(fetchMock).some((event) => event.type === 'ERROR_CLICK')).toBe(true);
    });
  });

  it('cancels deferred error reporting when the boundary unmounts', () => {
    vi.useFakeTimers();
    const reportCaughtError = vi.spyOn(Askdepth, 'reportCaughtError');
    try {
      const view = render(
        <AskdepthCatch fallback={<div>fallback</div>}>
          <Problematic />
        </AskdepthCatch>,
      );

      expect(vi.getTimerCount()).toBeGreaterThan(0);
      view.unmount();
      vi.runOnlyPendingTimers();

      expect(reportCaughtError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a custom fallback instead of the default alert', () => {
    render(
      <AskdepthCatch fallback={<div>Fallback Component</div>}>
        <Problematic />
      </AskdepthCatch>,
    );
    expect(screen.getByText('Fallback Component')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('renders the default alert and resets on retry', () => {
    let boom = true;
    function Flaky() {
      if (boom) throw new Error('Private token in error message');
      return <p>recovered</p>;
    }
    render(
      <AskdepthCatch>
        <Flaky />
      </AskdepthCatch>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Something went wrong');
    expect(screen.queryByText('Private token in error message')).toBeNull();
    boom = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('passes the error and reset callback to a function fallback', () => {
    let boom = true;
    function Flaky() {
      if (boom) throw new Error('Test Runtime Crash');
      return <p>recovered</p>;
    }
    render(
      <AskdepthCatch
        fallback={(error, reset) => (
          <button
            onClick={() => {
              boom = false;
              reset();
            }}
          >
            {error.message}
          </button>
        )}
      >
        <Flaky />
      </AskdepthCatch>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test Runtime Crash' }));
    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('reports an error click with the fiber location of the last interaction', () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    window.fetch = fetchMock as typeof fetch;
    function Bomb() {
      const [crash, setCrash] = useState(false);
      if (crash) throw new Error('Test Runtime Crash');
      return (
        <button
          id="target-btn"
          className="submit"
          data-askdepth-src="src/Bomb.tsx:8:4"
          data-askdepth-id="cmp_a7f9c2d1"
          onClick={() => setCrash(true)}
        >
          boom
        </button>
      );
    }
    render(
      <AskdepthProvider
        writeKey={PROJECT}
        endpoint="https://ingest.test/v1"
        consent="granted"
        sampleRate={1}
        environment="development"
      >
        <AskdepthCatch>
          <Bomb />
        </AskdepthCatch>
      </AskdepthProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'boom' }));
    const event = sentEvents(fetchMock).find((item) => item.type === 'ERROR_CLICK');
    expect(event).toMatchObject({
      target_selector: 'html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)',
      error_type: 'js_exception',
      component: {
        name: 'Bomb',
        source: 'src/Bomb.tsx:8:4',
        hash_id: 'cmp_a7f9c2d1',
      },
    });
    expect(getLastUserInteraction()).toBeNull();
  });

  it('reports a class-only target and survives a broken fiber', () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    bootCore(fetchMock);
    installInteractionMemory();
    installInteractionMemory();
    const button = document.createElement('button');
    button.className = 'submit danger';
    Object.defineProperty(button, '__reactFiber$bad', {
      get() {
        throw new Error('fiber');
      },
    });
    document.body.append(button);
    button.click();
    render(
      <AskdepthCatch>
        <Problematic />
      </AskdepthCatch>,
    );
    const event = sentEvents(fetchMock).find((item) => item.type === 'ERROR_CLICK');
    expect(event?.target_selector).toBe('html:nth-of-type(1) > body:nth-of-type(1) > button:nth-of-type(1)');
    expect(event?.component).toBeUndefined();
  });

  it('resolves a text-node click to the parent element', () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    bootCore(fetchMock);
    installInteractionMemory();
    const label = document.createElement('div');
    label.id = 'label';
    label.append(document.createTextNode('hi'));
    document.body.append(label);
    label.firstChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    render(
      <AskdepthCatch>
        <Problematic />
      </AskdepthCatch>,
    );
    const event = sentEvents(fetchMock).find((item) => item.type === 'ERROR_CLICK');
    expect(event?.target_selector).toBe('html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1)');
  });
});

function Problematic(): React.ReactElement {
  throw new Error('Test Runtime Crash');
}
