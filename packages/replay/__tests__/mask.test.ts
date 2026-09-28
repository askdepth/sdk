import { describe, expect, it } from 'vitest';
import { createEventSanitizer, maskInputValue, maskText, sanitizeEvent } from '../src/mask.js';

describe('privacy masking', () => {
  it('replaces an email input value before the event can be stored', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 10,
      data: {
        node: {
          type: 2,
          tagName: 'input',
          attributes: { type: 'text', value: 'ivan@example.com', placeholder: 'email' },
          childNodes: [],
        },
      },
    });
    const input = (event.data as { node: { attributes: { value: string; placeholder: string } } }).node;
    expect(input.attributes.value).toBe('[REDACTED_EMAIL]');
    expect(input.attributes.placeholder).toBe('');
    expect(JSON.stringify(event)).not.toContain('ivan@example.com');
  });

  it('keeps the length of an ordinary text input as stars', () => {
    expect(maskInputValue('secret')).toBe('******');
  });

  it('redacts a Visa number that passes the Luhn check', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 10,
      data: {
        node: {
          type: 2,
          tagName: 'p',
          attributes: {},
          childNodes: [{ type: 3, id: 2, textContent: 'card 4532 0123 4567 8910 on file' }],
        },
      },
    });
    const text = (event.data as { node: { childNodes: Array<{ textContent: string }> } }).node.childNodes[0]!.textContent;
    expect(text).toContain('[REDACTED_CARD]');
    expect(text).not.toContain('4532');
    expect(maskText('4532 0123 4567 8911')).toContain('4532');
  });

  it('redacts phone numbers and passport numbers', () => {
    expect(maskText('call +1 415 555 2671 now')).toContain('[REDACTED_PHONE]');
    expect(maskText('call +1 415 555 2671 now')).not.toContain('415');
    expect(maskText('passport 4510 123456')).toContain('[REDACTED_DOCUMENT]');
    expect(maskText('4510 123456')).toBe('[REDACTED_DOCUMENT]');
  });

  it('leaves short harmless text unchanged', () => {
    expect(maskText('hi')).toBe('hi');
    expect(maskText('hello')).toBe('hello');
  });

  it('cuts blocked subtrees down to an empty box with the original size', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 10,
      data: {
        node: {
          type: 2,
          tagName: 'div',
          attributes: {
            'data-askdepth-block': '',
            width: '120',
            height: '40',
            value: 'should-go',
          },
          childNodes: [
            { type: 2, tagName: 'script', attributes: {}, childNodes: [{ type: 3, textContent: 'alert(1)' }] },
            { type: 2, tagName: 'svg', attributes: {}, childNodes: [{ type: 3, textContent: 'graphic' }] },
          ],
        },
      },
    });
    const node = (event.data as { node: { attributes: Record<string, string>; childNodes: unknown[] } }).node;
    expect(node.childNodes).toEqual([]);
    expect(node.attributes.width).toBe('120');
    expect(node.attributes.height).toBe('40');
    expect(node.attributes.rr_width).toBe('120');
    expect(node.attributes.rr_height).toBe('40');
    expect(node.attributes.value).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain('alert(1)');
    expect(JSON.stringify(event)).not.toContain('graphic');
  });

  it('stars the contents of data-askdepth-mask and strips secrets from image URLs', () => {
    const event = sanitizeEvent({
      type: 3,
      timestamp: 10,
      data: {
        source: 0,
        adds: [
          {
            node: {
              type: 2,
              tagName: 'div',
              attributes: { 'data-askdepth-mask': '' },
              childNodes: [{ type: 3, textContent: 'ivan@example.com' }],
            },
          },
        ],
        texts: [],
      },
    });
    const text = (
      event.data as { adds: Array<{ node: { childNodes: Array<{ textContent: string }> } }> }
    ).adds[0]!.node.childNodes[0]!.textContent;
    expect(text).toBe('*'.repeat('ivan@example.com'.length));
    const image = sanitizeEvent({
      type: 2,
      timestamp: 11,
      data: {
        node: {
          type: 2,
          tagName: 'img',
          attributes: { src: 'https://cdn.test/a.png?token=abc&size=1' },
          childNodes: [],
        },
      },
    });
    const src = (image.data as { node: { attributes: { src: string } } }).node.attributes.src;
    expect(src).not.toContain('token');
    expect(src).toContain('size=1');
  });

  it('masks incremental input text', () => {
    const event = sanitizeEvent({
      type: 3,
      timestamp: 12,
      data: { source: 5, id: 4, text: 'ivan@example.com' },
    });
    expect((event.data as { text: string }).text).toBe('[REDACTED_EMAIL]');
  });

  it('masks a password field down to stars', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 13,
      data: {
        node: {
          type: 2,
          tagName: 'input',
          attributes: { type: 'password', value: 'hunter2', autocomplete: 'current-password' },
          childNodes: [],
        },
      },
    });
    expect((event.data as { node: { attributes: { value: string } } }).node.attributes.value).toBe('*******');
    expect(JSON.stringify(event)).not.toContain('hunter2');
  });

  it('masks contenteditable containers', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 14,
      data: {
        node: {
          type: 2,
          tagName: 'div',
          attributes: { contenteditable: 'true' },
          childNodes: [{ type: 3, textContent: 'Confidential client message' }],
        },
      },
    });
    const text = (event.data as { node: { childNodes: Array<{ textContent: string }> } }).node.childNodes[0]!.textContent;
    expect(text).toBe('*'.repeat('Confidential client message'.length));
    expect(JSON.stringify(event)).not.toContain('Confidential');
  });

  it('sanitizes aria-label, title, and alt attributes', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 15,
      data: {
        node: {
          type: 2,
          tagName: 'button',
          attributes: {
            'aria-label': 'Contact ivan@example.com for support',
            title: 'Phone: +1 415 555 2671',
            alt: 'Profile of ivan@example.com',
          },
          childNodes: [],
        },
      },
    });
    const attrs = (event.data as { node: { attributes: Record<string, string> } }).node.attributes;
    expect(attrs['aria-label']).toContain('[REDACTED_EMAIL]');
    expect(attrs['aria-label']).not.toContain('ivan@example.com');
    expect(attrs.title).toContain('[REDACTED_PHONE]');
    expect(attrs.alt).toContain('[REDACTED_EMAIL]');
  });

  it('redacts labeled cards even if they fail the Luhn checksum', () => {
    const text = maskText('Confidential invoice note: sent to billing@client.org on 2026-09-27. Card: 4111 2222 3333 4444. fdascaf');
    expect(text).toContain('[REDACTED_CARD]');
    expect(text).toContain('[REDACTED_EMAIL]');
    expect(text).not.toContain('4111');
    expect(text).not.toContain('billing@client.org');
  });

  it('masks elements with class askdepth-mask and blocks elements with class askdepth-block', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 16,
      data: {
        node: {
          type: 2,
          tagName: 'div',
          attributes: { class: 'content-area askdepth-mask' },
          childNodes: [{ type: 3, textContent: 'Secret Salary: 100000 USD' }],
        },
      },
    });
    const maskedText = (event.data as { node: { childNodes: Array<{ textContent: string }> } }).node.childNodes[0]!.textContent;
    expect(maskedText).toBe('*'.repeat('Secret Salary: 100000 USD'.length));

    const blockedEvent = sanitizeEvent({
      type: 2,
      timestamp: 17,
      data: {
        node: {
          type: 2,
          tagName: 'div',
          attributes: { class: 'widget askdepth-block', width: '200', height: '100' },
          childNodes: [{ type: 2, tagName: 'span', attributes: {}, childNodes: [{ type: 3, textContent: 'sensitive' }] }],
        },
      },
    });
    const blockedNode = (blockedEvent.data as { node: { childNodes: unknown[]; attributes: Record<string, unknown> } }).node;
    expect(blockedNode.childNodes).toEqual([]);
    expect(blockedNode.attributes.width).toBe('200');
    expect(blockedNode.attributes.height).toBe('100');
  });

  it('maintains asterisk masking for typing in contenteditable across incremental mutations', () => {
    const sanitizer = createEventSanitizer();

    // 1. Initial snapshot with contenteditable container
    sanitizer.sanitize({
      type: 2,
      timestamp: 20,
      data: {
        node: {
          type: 2,
          id: 10,
          tagName: 'div',
          attributes: { contenteditable: 'true' },
          childNodes: [{ type: 3, id: 11, textContent: 'Initial note' }],
        },
      },
    });

    // 2. Incremental typing inside the text node
    const typingEvent = sanitizer.sanitize({
      type: 3,
      timestamp: 21,
      data: {
        source: 0,
        texts: [{ id: 11, value: 'User just typed something secret here' }],
      },
    });

    const typedText = (typingEvent.data as { texts: Array<{ value: string }> }).texts[0]!.value;
    expect(typedText).toBe('*'.repeat('User just typed something secret here'.length));
    expect(typedText).not.toContain('secret');
  });

  it('redacts JWT tokens, Bearer tokens, and API key assignments', () => {
    const rawJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZXgifQ.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const textWithJwt = maskText(`User session token: ${rawJwt}`);
    expect(textWithJwt).toContain('[REDACTED_JWT]');
    expect(textWithJwt).not.toContain('eyJhbGci');

    const textWithBearer = maskText('Authorization: Bearer dGVzdC1hdXRoLXRva2VuLTEyMzQ1Ng==');
    expect(textWithBearer).toContain('Bearer [REDACTED_TOKEN]');
    expect(textWithBearer).not.toContain('dGVzdC1hdXRo');

    const textWithApiKey = maskText('config.apiKey = "secret_key_1234567890123456"');
    expect(textWithApiKey).toContain('[REDACTED_SECRET]');
    expect(textWithApiKey).not.toContain('secret_key_12345');
  });

  it('scrubs CSS style url query parameters and sensitive data-* attributes', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 30,
      data: {
        node: {
          type: 2,
          tagName: 'div',
          attributes: {
            style: "background-image: url('https://cdn.example.com/private/avatar.jpg?token=abc12345&user=john'); color: red;",
            'data-user-token': 'super-secret-user-token',
            'data-custom-safe': 'safe-value',
          },
          childNodes: [],
        },
      },
    });

    const attrs = (event.data as { node: { attributes: Record<string, string> } }).node.attributes;
    expect(attrs.style).not.toContain('token=abc12345');
    expect(attrs.style).toContain('avatar.jpg');
    expect(attrs['data-user-token']).toContain('*');
    expect(attrs['data-user-token']).not.toContain('super-secret');
    expect(attrs['data-custom-safe']).toBe('safe-value');
  });

  it('strictly enforces attribute allowlist on blocked nodes (strips class, id, style)', () => {
    const event = sanitizeEvent({
      type: 2,
      timestamp: 31,
      data: {
        node: {
          type: 2,
          tagName: 'div',
          attributes: {
            'data-askdepth-block': '',
            class: 'sensitive-class-name',
            id: 'secret-account-id',
            style: 'background-image: url("https://secret.com/leak.jpg"); width: 300px; height: 150px;',
            'aria-label': 'Confidential Card Info',
          },
          childNodes: [{ type: 3, textContent: 'private canvas' }],
        },
      },
    });

    const node = (event.data as { node: { attributes: Record<string, unknown>; childNodes: unknown[] } }).node;
    expect(node.childNodes).toEqual([]);
    expect(node.attributes.class).toBeUndefined();
    expect(node.attributes.id).toBeUndefined();
    expect(node.attributes['aria-label']).toBeUndefined();
    expect(node.attributes.width).toBe('300px');
    expect(node.attributes.height).toBe('150px');
    expect(node.attributes.rr_width).toBe('300px');
    expect(node.attributes.rr_height).toBe('150px');
  });

  it('scrubs incremental attribute and text mutations targeting a blocked node', () => {
    const sanitizer = createEventSanitizer();
    // 1. Snapshot with a blocked node id=10
    sanitizer.sanitize({
      type: 2,
      timestamp: 10,
      data: {
        node: {
          type: 2,
          id: 10,
          tagName: 'div',
          attributes: { 'data-askdepth-block': '' },
          childNodes: [],
        },
      },
    });

    // 2. Incremental attribute mutation trying to inject secret class and style
    const attrEvent = sanitizer.sanitize({
      type: 3,
      timestamp: 20,
      data: {
        source: 0,
        attributes: [
          {
            id: 10,
            attributes: {
              class: 'leaked-credit-class',
              style: 'color: red',
              width: '200px',
            },
          },
        ],
      },
    });

    const mutatedAttrs = (attrEvent.data as { attributes: Array<{ attributes: Record<string, unknown> }> }).attributes[0]!.attributes;
    expect(mutatedAttrs.class).toBeUndefined();
    expect(mutatedAttrs.style).toBeUndefined();
    expect(mutatedAttrs.width).toBe('200px');
    expect(mutatedAttrs['data-askdepth-block']).toBe('');

    // 3. Incremental text mutation targeting child of blocked node
    const textEvent = sanitizer.sanitize({
      type: 3,
      timestamp: 30,
      data: {
        source: 0,
        texts: [{ id: 10, value: 'Confidential Text' }],
      },
    });
    const mutatedText = (textEvent.data as { texts: Array<{ value: string }> }).texts[0]!.value;
    expect(mutatedText).toBe('');
  });
});


