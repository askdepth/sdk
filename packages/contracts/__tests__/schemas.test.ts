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

const projectId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('TelemetryEnvelope', () => {
  it('freezes protocol_version at 1 and accepts a full batch', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    const envelope = createTelemetryEnvelope({
      sdk_name: '@askdepth/core',
      sdk_version: '1.4.2',
      project_id: projectId,
      environment: 'production',
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      events: [],
    });
    expect(envelope.protocol_version).toBe(1);
    expect(TelemetryEnvelopeSchema.parse(envelope)).toEqual(envelope);
    const tracked = createTelemetryEnvelope({
      sdk_name: '@askdepth/core',
      sdk_version: '1.4.2',
      project_id: projectId,
      environment: 'production',
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      events: [
        TrackEventSchema.parse({ type: 'track', name: 'signup' }),
        IdentifyEventSchema.parse({ type: 'identify', user_id: 'user_1' }),
      ],
    });
    expect(tracked.events).toHaveLength(2);
  });

  it('rejects a non-uuid project id and a bad environment', () => {
    expect(
      TelemetryEnvelopeSchema.safeParse({
        protocol_version: 1,
        sdk_name: '@askdepth/core',
        sdk_version: '1.0.0',
        project_id: 'not-an-id',
        environment: 'test',
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        events: [],
      }).success,
    ).toBe(false);
  });
});

describe('anomaly schemas', () => {
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
