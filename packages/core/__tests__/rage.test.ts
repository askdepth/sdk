import { afterEach, describe, expect, it } from 'vitest';
import { isRapidAllowed, pushRageClick, resetRage, type ClickRecord } from '../src/rage.js';

function rec(partial: Partial<ClickRecord> & Pick<ClickRecord, 'x' | 'y' | 'time'>): ClickRecord {
  const target = document.createElement('button');
  return {
    target,
    selector: 'button#pay',
    tag: 'BUTTON',
    ...partial,
  };
}

afterEach(() => resetRage());

describe('rage clicks', () => {
  it('emits exactly one RAGE_CLICK for 3 clicks at the same point within 1.5s', () => {
    expect(pushRageClick(rec({ x: 100, y: 100, time: 0 }))).toBeNull();
    expect(pushRageClick(rec({ x: 100, y: 100, time: 400 }))).toBeNull();
    const event = pushRageClick(rec({ x: 100, y: 100, time: 800 }));
    expect(event?.type).toBe('RAGE_CLICK');
    expect(event?.click_count).toBe(3);
    expect(event?.coordinates).toHaveLength(3);
    expect(pushRageClick(rec({ x: 100, y: 100, time: 900 }))).toBeNull();
  });

  it('does not emit when the 3rd click is 50px away', () => {
    expect(pushRageClick(rec({ x: 0, y: 0, time: 0 }))).toBeNull();
    expect(pushRageClick(rec({ x: 25, y: 0, time: 600 }))).toBeNull();
    expect(pushRageClick(rec({ x: 50, y: 0, time: 1200 }))).toBeNull();
  });

  it('does not treat a far middle click as a cluster', () => {
    expect(pushRageClick(rec({ x: 10, y: 10, time: 0 }))).toBeNull();
    expect(pushRageClick(rec({ x: 900, y: 900, time: 100 }))).toBeNull();
    expect(pushRageClick(rec({ x: 20, y: 20, time: 200 }))).toBeNull();
  });

  it('counts only the clicks inside the cluster', () => {
    expect(pushRageClick(rec({ x: 0, y: 0, time: 0 }))).toBeNull();
    expect(pushRageClick(rec({ x: 0, y: 0, time: 10 }))).toBeNull();
    expect(pushRageClick(rec({ x: 4, y: 4, time: 100_000 }))).toBeNull();
    expect(pushRageClick(rec({ x: 5, y: 5, time: 100_100 }))).toBeNull();
    const event = pushRageClick(rec({ x: 6, y: 6, time: 100_200 }));
    expect(event?.click_count).toBe(3);
    expect(event?.coordinates.map((point) => point.timestamp)).toEqual([100_000, 100_100, 100_200]);
  });

  it('ignores elements that allow rapid clicks', () => {
    document.body.innerHTML = '<button id="spin" data-askdepth-allow-rapid></button>';
    const el = document.getElementById('spin')!;
    expect(isRapidAllowed(el, [])).toBe(true);
    const input = document.createElement('input');
    input.type = 'number';
    document.body.append(input);
    expect(isRapidAllowed(input, [])).toBe(true);
    const custom = document.createElement('div');
    custom.className = 'spinner';
    expect(isRapidAllowed(custom, ['.spinner'])).toBe(true);
    const stepper = document.createElement('div');
    stepper.innerHTML = '<button class="minus">-</button><input type="number" /><button class="plus">+</button>';
    document.body.append(stepper);
    expect(isRapidAllowed(stepper.querySelector('.plus')!, [])).toBe(true);
  });
});
