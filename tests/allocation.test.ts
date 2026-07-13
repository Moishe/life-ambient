import { describe, it, expect } from 'vitest';
import { planPings, allocateVoices, orphanedVoiceIds } from '../src/audio/allocation';

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

  it('samples across the full range at the overflow boundary (n = 13)', () => {
    const plans = planPings(births(13));
    expect(plans).toHaveLength(12);
    expect(plans[0].x).toBe(0);          // first birth included
    expect(plans[11].x).toBe(12);        // last birth included
    expect(new Set(plans.map(p => p.x)).size).toBe(12); // all distinct
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

describe('orphanedVoiceIds', () => {
  it('returns nothing for an empty voice set', () => {
    expect(orphanedVoiceIds([], new Set([1, 2]))).toEqual([]);
  });

  it('returns nothing when every voice is live', () => {
    expect(orphanedVoiceIds([1, 2, 3], new Set([1, 2, 3]))).toEqual([]);
  });

  it('returns exactly the non-live voice ids', () => {
    expect(orphanedVoiceIds([1, 2, 3, 4], new Set([2, 4]))).toEqual([1, 3]);
  });

  it('returns all voice ids when nothing is live', () => {
    expect(orphanedVoiceIds([5, 6, 7], new Set<number>())).toEqual([5, 6, 7]);
  });
});
