import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_INTERACTION_AGE_MS,
  clearLastUserInteraction,
  getLastUserInteraction,
  installInteractionMemory,
  resetInteractionMemoryForTests,
} from '../src/interaction.js';

describe('interaction memory', () => {
  beforeEach(() => {
    resetInteractionMemoryForTests();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  afterEach(() => {
    resetInteractionMemoryForTests();
    vi.useRealTimers();
  });

  it('records click interaction and returns target element', () => {
    const uninstall = installInteractionMemory();
    const btn = document.createElement('button');
    btn.id = 'click-btn';
    document.body.appendChild(btn);

    btn.click();
    const interaction = getLastUserInteraction();
    expect(interaction).not.toBeNull();
    expect(interaction?.targetElement).toBe(btn);

    uninstall();
  });

  it('drops interaction and returns null when interaction exceeds maxAgeMs (TTL)', () => {
    vi.useFakeTimers();
    const uninstall = installInteractionMemory();
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    btn.click();
    expect(getLastUserInteraction()).not.toBeNull();

    // Advance time past the default TTL
    vi.advanceTimersByTime(DEFAULT_MAX_INTERACTION_AGE_MS + 100);

    // Should expire and return null, releasing the retained element
    expect(getLastUserInteraction()).toBeNull();

    uninstall();
  });

  it('clears interaction explicitly via clearLastUserInteraction', () => {
    const uninstall = installInteractionMemory();
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    btn.click();
    expect(getLastUserInteraction()).not.toBeNull();

    clearLastUserInteraction();
    expect(getLastUserInteraction()).toBeNull();

    uninstall();
  });

  it('manages listener with reference counting and removes window listener when ref count hits 0', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

    const unbind1 = installInteractionMemory();
    const unbind2 = installInteractionMemory();

    expect(addListenerSpy).toHaveBeenCalledTimes(1);

    // First unbind does not remove listener
    unbind1();
    expect(removeListenerSpy).not.toHaveBeenCalled();

    // Second unbind removes listener
    unbind2();
    expect(removeListenerSpy).toHaveBeenCalledTimes(1);

    // Double unbind is safe and no-op
    unbind2();
    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
  });
});
