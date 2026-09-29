import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorClickEventSchema, RageClickEventSchema, DeadClickEventSchema } from '@askdepth/contracts';
import { Askdepth, onPointerDown } from '../src/sdk.js';
import { resetSdkForTests } from '../src/reset.js';
import { onAnomaly } from '../src/anomaly-bus.js';

const PROJECT = '550e8400-e29b-41d4-a716-446655440000';

function boot(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  window.fetch = fetchMock as typeof fetch;
  Askdepth.init({ writeKey: PROJECT, projectId: PROJECT, endpoint: 'https://ingest.test/v1', consent: 'granted', replay: true });
  return fetchMock;
}

async function events(fetchMock: ReturnType<typeof vi.fn>): Promise<Array<Record<string, unknown>>> {
  await vi.advanceTimersByTimeAsync(2_000);
  return fetchMock.mock.calls
    .filter((call) => String(call[0]) === 'https://ingest.test/v1')
    .flatMap((call) => (JSON.parse((call[1] as RequestInit).body as string) as { events: Array<Record<string, unknown>> }).events);
}

beforeEach(() => {
  resetSdkForTests();
  document.body.innerHTML = '';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  resetSdkForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('React frustration integration', () => {
  it('retains a shared resolver until its last registration is removed', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    const resolver = () => ({ componentName: 'Checkout', componentStack: ['Checkout'] });
    const unsubscribeFirst = Askdepth.registerComponentResolver(resolver);
    const unsubscribeSecond = Askdepth.registerComponentResolver(resolver);
    unsubscribeFirst();
    Askdepth.reportCaughtError(new Error('render failed'), button);
    const caught = (await events(fetchMock)).find((event) => event.type === 'ERROR_CLICK');
    expect(caught?.component).toEqual({ name: 'Checkout', stack: ['Checkout'] });
    unsubscribeSecond();
  });

  it('resolves the actual rage and dead targets and preserves bounded metadata on the wire', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    const seen: Element[] = [];
    const unsubscribe = Askdepth.registerComponentResolver((el) => {
      seen.push(el);
      return { componentName: 'Checkout', componentStack: ['Checkout'], sourceAttr: 'src/Checkout.tsx:12', hashId: 'a1b2' };
    });
    for (const time of [100, 200, 300]) {
      onPointerDown({ isTrusted: true, pointerType: 'mouse', clientX: 3, clientY: 3, timeStamp: time, target: button } as PointerEvent);
    }
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(800);
    const emitted = await events(fetchMock);
    const rage = emitted.find((event) => event.type === 'RAGE_CLICK');
    const dead = emitted.find((event) => event.type === 'DEAD_CLICK');
    expect(RageClickEventSchema.safeParse(rage).success).toBe(true);
    expect(DeadClickEventSchema.safeParse(dead).success).toBe(true);
    expect(rage?.component).toEqual({ name: 'Checkout', stack: ['Checkout'], source: 'src/Checkout.tsx:12', hash_id: 'a1b2' });
    expect(dead?.component).toEqual(rage?.component);
    expect(seen).toEqual([button, button]);
    unsubscribe();
    unsubscribe();
    Askdepth.reportCaughtError(new Error('after unmount'), button);
    const afterUnmount = (await events(fetchMock)).filter((event) => event.type === 'ERROR_CLICK').at(-1);
    expect(afterUnmount).not.toHaveProperty('component');
  });

  it('emits a handled ERROR_CLICK, redacts details, and publishes a replay anomaly', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const anomalies: string[] = [];
    const unsubscribe = onAnomaly((signal) => anomalies.push(signal.type));
    const error = new Error('token=secret123 https://host.test/pay?auth=secret123');
    error.stack = [
      'Error: token=secret123',
      ...Array.from({ length: 40 }, () => '    at Checkout (https://host.test/app.js?auth=secret123:17:2)'),
    ].join('\n');
    const componentStack = [
      '    at Checkout (https://host.test/src/Checkout.tsx?token=secret123:17:2)',
      '    at App (https://host.test/src/App.tsx?token=secret123:5:1)',
    ].join('\n');
    Askdepth.reportCaughtError(error, button, componentStack);
    const emitted = await events(fetchMock);
    const caught = emitted.find((event) => event.type === 'ERROR_CLICK');
    expect(ErrorClickEventSchema.safeParse(caught).success).toBe(true);
    expect((caught?.error_details as { handled: boolean }).handled).toBe(true);
    const details = caught?.error_details as { component_stack?: string; stack?: string };
    expect(details.component_stack).toBe('at Checkout:17:2\nat App:5:1');
    expect(details.component_stack?.length).toBeLessThanOrEqual(1_200);
    expect(details.stack).toContain('at Checkout:17:2');
    expect(details.stack?.length).toBeLessThanOrEqual(1_200);
    expect(details.stack?.split('\n').length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(caught)).not.toContain('secret123');
    expect(JSON.stringify(caught)).not.toContain('host.test');
    expect(anomalies).toContain('ERROR_CLICK');

    const oversizedComponentStack = {
      ...caught,
      error_details: { ...(caught?.error_details as Record<string, unknown>), component_stack: 'x'.repeat(1_201) },
    };
    expect(ErrorClickEventSchema.safeParse(oversizedComponentStack).success).toBe(false);
    unsubscribe();
  });

  it('reports an uncorrelated render error with a stable boundary selector', async () => {
    const fetchMock = boot();
    Askdepth.reportCaughtError(new Error('render failed'));
    const caught = (await events(fetchMock)).find((event) => event.type === 'ERROR_CLICK');
    expect(caught?.target_selector).toBe('react:error-boundary');
    expect(caught?.time_to_error_ms).toBe(0);
    expect(ErrorClickEventSchema.safeParse(caught).success).toBe(true);
  });

  it('drops unsafe source metadata before enqueueing', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    Askdepth.registerComponentResolver(() => ({
      componentName: 'Checkout', componentStack: ['Checkout'], sourceAttr: '../private/token.tsx?secret=abc', hashId: 'bad?secret=abc',
    }));
    Askdepth.reportCaughtError(new Error('render failed'), button);
    const caught = (await events(fetchMock)).find((event) => event.type === 'ERROR_CLICK');
    expect(caught?.component).toEqual({ name: 'Checkout', stack: ['Checkout'] });
    expect(JSON.stringify(caught)).not.toContain('secret=abc');
  });

  it('preserves common React HOC display names and stacks with parentheses', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    Askdepth.registerComponentResolver(() => ({
      componentName: 'Connect(Checkout)',
      componentStack: ['Connect(Checkout)', 'withRouter(Page)', 'ForwardRef(Button)'],
      sourceAttr: 'src/Checkout.tsx:10:4',
      hashId: 'cmp_12345678',
    }));
    Askdepth.reportCaughtError(new Error('hoc crash'), button);
    const caught = (await events(fetchMock)).find((event) => event.type === 'ERROR_CLICK');
    expect(caught?.component).toEqual({
      name: 'Connect(Checkout)',
      stack: ['Connect(Checkout)', 'withRouter(Page)', 'ForwardRef(Button)'],
      source: 'src/Checkout.tsx:10:4',
      hash_id: 'cmp_12345678',
    });
  });

  it('retains source and hash metadata substituting Anonymous when component name is invalid', async () => {
    const fetchMock = boot();
    const button = document.createElement('button');
    document.body.append(button);
    Askdepth.registerComponentResolver(() => ({
      componentName: '<Invalid!Component>',
      componentStack: [],
      sourceAttr: 'src/Page.tsx:20:2',
      hashId: 'cmp_abcdef12',
    }));
    Askdepth.reportCaughtError(new Error('invalid name crash'), button);
    const caught = (await events(fetchMock)).find((event) => event.type === 'ERROR_CLICK');
    expect(caught?.component).toEqual({
      name: 'Anonymous',
      stack: [],
      source: 'src/Page.tsx:20:2',
      hash_id: 'cmp_abcdef12',
    });
  });
});
