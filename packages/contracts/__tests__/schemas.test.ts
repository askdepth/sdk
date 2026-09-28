import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  RageClickEventSchema,
  DeadClickEventSchema,
  ErrorClickEventSchema,
  TelemetryEnvelopeSchema,
  createTelemetryEnvelope,
  TraceparentHeaderSchema,
  parseTraceparent,
  formatTraceparent,
  TrackEventSchema,
  IdentifyEventSchema,
} from '../src/index.js';

const sessionId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const batchId = '4f8b2bb0-9de0-4b1e-8ae0-0485ff1f0a0f';
const eventId = 'ee7c905d-4aef-4cc5-9c63-9bfeb718bc7f';

describe('TelemetryEnvelope', () => {
  it('freezes protocol_version at 0.1.0 and accepts identified events without client project ownership', () => {
    expect(PROTOCOL_VERSION).toBe('0.1.0');
    const envelope = createTelemetryEnvelope({
      sdk_name: '@askdepth/core',
      sdk_version: '1.4.2',
      environment: 'production',
      session_id: sessionId,
      batch_id: batchId,
      sent_at: new Date().toISOString(),
      events: [],
    });
    expect(envelope.protocol_version).toBe('0.1.0');
    expect(TelemetryEnvelopeSchema.parse(envelope)).toEqual(envelope);
    const tracked = createTelemetryEnvelope({
      sdk_name: '@askdepth/core',
      sdk_version: '1.4.2',
      environment: 'production',
      session_id: sessionId,
      batch_id: batchId,
      sent_at: new Date().toISOString(),
      events: [
        { event_id: eventId, ...TrackEventSchema.parse({ type: 'track', name: 'signup' }) },
        { event_id: 'd1ce0b0c-0985-41b1-85e9-b1f7e42ab7aa', ...IdentifyEventSchema.parse({ type: 'identify', user_id: 'user_1' }) },
      ],
    });
    expect(tracked.events).toHaveLength(2);
  });

  it('rejects an invalid batch or event id and a bad environment', () => {
    expect(
      TelemetryEnvelopeSchema.safeParse({
        protocol_version: '0.1.0',
        sdk_name: '@askdepth/core',
        sdk_version: '1.0.0',
        environment: 'test',
        session_id: sessionId,
        batch_id: 'not-a-uuid',
        sent_at: new Date().toISOString(),
        events: [{ event_id: 'not-a-uuid', type: 'track', name: 'signup' }],
      }).success,
    ).toBe(false);
  });
});

describe('anomaly schemas', () => {
  it('bounds custom payloads and rejects unsupported or unbounded values', () => {
    expect(TrackEventSchema.parse({
      type: 'track',
      name: 'checkout_completed',
      properties: { total: 99.5, items: ['sku-1'], nested: { coupon: null } },
    }).properties).toBeTruthy();
    expect(TrackEventSchema.safeParse({
      type: 'track',
      name: 'x'.repeat(201),
    }).success).toBe(false);
    expect(IdentifyEventSchema.safeParse({
      type: 'identify',
      user_id: 'user-1',
      traits: { deep: { a: { b: { c: { d: 'too deep' } } } } },
    }).success).toBe(false);
    expect(TrackEventSchema.safeParse({
      type: 'track',
      name: 'signup',
      properties: { value: 'x'.repeat(513) },
    }).success).toBe(false);
  });

  it('validates RAGE_CLICK', () => {
    const event = {
      type: 'RAGE_CLICK' as const,
      target_selector: 'button#pay',
      coordinates: [
        { x: 1, y: 2, timestamp: 1 },
        { x: 1, y: 2, timestamp: 2 },
        { x: 1, y: 2, timestamp: 3 },
      ],
      click_count: 3,
      target_tag: 'BUTTON',
    };
    expect(RageClickEventSchema.parse(event)).toEqual(event);
  });

  it('validates DEAD_CLICK', () => {
    const event = {
      type: 'DEAD_CLICK' as const,
      target_selector: 'button#pay',
      computed_styles: {
        cursor: 'pointer',
        'pointer-events': 'auto',
        display: 'block',
        opacity: '1',
      },
      observed_duration_ms: 800 as const,
      is_interactive_element: true,
    };
    expect(DeadClickEventSchema.parse(event)).toEqual(event);
  });

  it('validates ERROR_CLICK js and network variants', () => {
    expect(
      ErrorClickEventSchema.parse({
        type: 'ERROR_CLICK',
        target_selector: '.submit-btn',
        error_type: 'js_exception',
        error_details: { message: 'API fail', stack: 'Error: API fail', handled: false },
        time_to_error_ms: 100,
      }).error_type,
    ).toBe('js_exception');

    expect(
      ErrorClickEventSchema.parse({
        type: 'ERROR_CLICK',
        target_selector: '.submit-btn',
        error_type: 'network_error',
        error_details: {
          method: 'POST',
          url: '/api/pay',
          status_code: 500,
          duration_ms: 40,
        },
        time_to_error_ms: 2000,
      }).error_type,
    ).toBe('network_error');

    expect(
      ErrorClickEventSchema.safeParse({
        type: 'ERROR_CLICK',
        target_selector: 'button.pay',
        error_type: 'js_exception',
        error_details: { message: 'x'.repeat(241), stack: 'at app:1:1', handled: false },
        time_to_error_ms: 100,
      }).success,
    ).toBe(false);
    expect(
      ErrorClickEventSchema.safeParse({
        type: 'ERROR_CLICK',
        target_selector: 'button.pay',
        error_type: 'network_error',
        error_details: { method: 'post', url: '/pay', status_code: 500, duration_ms: 600_001 },
        time_to_error_ms: 100,
      }).success,
    ).toBe(false);

    expect(
      ErrorClickEventSchema.safeParse({
        type: 'ERROR_CLICK',
        target_selector: '.submit-btn',
        error_type: 'js_exception',
        error_details: { message: 'late', stack: '', handled: false },
        time_to_error_ms: 600,
      }).success,
    ).toBe(false);
  });
});

describe('traceparent', () => {
  const sample = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

  it('accepts the W3C format and rejects drift', () => {
    expect(TraceparentHeaderSchema.parse(sample)).toBe(sample);
    expect(() => TraceparentHeaderSchema.parse('00-zz-00-01')).toThrow();
    expect(parseTraceparent(sample).traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(formatTraceparent(parseTraceparent(sample))).toBe(sample);
    expect(() =>
      TraceparentHeaderSchema.parse(`00-${'0'.repeat(32)}-${'0'.repeat(16)}-01`),
    ).toThrow();
  });
});
