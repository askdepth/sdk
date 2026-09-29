import { afterEach, describe, expect, it } from 'vitest';
import { cssPath } from '../src/selector.js';

describe('cssPath privacy', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('uses structural paths without exposing token- or email-like id and class values', () => {
    const section = document.createElement('section');
    section.id = 'user-alice@example.com';
    section.className = 'customer-alice@example.com';

    const firstDiv = document.createElement('div');
    const container = document.createElement('div');
    container.id = 'session_token=private-value';
    container.className = 'account-user@example.com';

    const firstButton = document.createElement('button');
    const button = document.createElement('button');
    button.id = 'access_token=private-value';
    button.className = 'alice@example.com';

    container.append(firstButton, button);
    section.append(firstDiv, container);
    document.body.append(section);

    const selector = cssPath(button);

    expect(selector).toBe(
      'html:nth-of-type(1) > body:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(2) > button:nth-of-type(2)',
    );
    expect(selector).not.toContain('alice@example.com');
    expect(selector).not.toContain('token');
    expect(selector).not.toContain('private-value');
  });
});
