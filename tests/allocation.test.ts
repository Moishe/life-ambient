import { describe, it, expect } from 'vitest';
import { planPings, allocateVoices } from '../src/audio/allocation';

const births = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));

describe('planPings', () => {
  it('returns nothing for no births', () => {
    expect(planPings([])).toEqual([]);
  });

  it('gives a single birth zero delay', () => {
    const plans = planPings(births(1));
    expect(plans).toHaveLength(1);
    expect(plans[0].delayMs).toBe(0);
  });

  it('staggers births across the spread window', () => {
    const plans = planPings(births(5));
    expect(plans).toHaveLength(5);
    expect(plans[0].delayMs).toBe(0);
    expect(plans[4].delayMs).toBe(80);
    expect(plans[2].delayMs).toBeCloseTo(40);
  });

  it('caps at 12 pings and boosts the first when overflowing', () => {
    const plans = planPings(births(40));
    expect(plans).toHaveLength(12);
    expect(plans[0].velocity).toBe(0.5);
    expect(plans[1].velocity).toBe(0.25);
  });

  it('uses normal velocity without overflow', () => {
    expect(planPings(births(12)).every(p => p.velocity === 0.25)).toBe(true);
  });
});

describe('allocateVoices', () => {
  it('keeps everything under the cap', () => {
    const set = allocateVoices([{ id: 1, cellCount: 3 }, { id: 2, cellCount: 5 }]);
    expect(set).toEqual(new Set([1, 2]));
  });

  it('keeps only the largest clusters over the cap', () => {
    const clusters = Array.from({ length: 20 }, (_, i) => ({ id: i, cellCount: i + 1 }));
    const set = allocateVoices(clusters, 16);
    expect(set.size).toBe(16);
    expect(set.has(19)).toBe(true); // biggest kept
    expect(set.has(3)).toBe(false); // smallest 4 dropped
  });

  it('does not mutate the input order', () => {
    const clusters = [{ id: 1, cellCount: 1 }, { id: 2, cellCount: 9 }];
    allocateVoices(clusters, 1);
    expect(clusters[0].id).toBe(1);
  });
});
