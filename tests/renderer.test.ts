import { describe, it, expect } from 'vitest';
import { clusterHue } from '../src/ui/renderer';

describe('clusterHue', () => {
  it('is stable for a given id', () => {
    expect(clusterHue(7)).toBe(clusterHue(7));
  });

  it('stays within [0, 360)', () => {
    for (let id = 1; id < 100; id++) {
      expect(clusterHue(id)).toBeGreaterThanOrEqual(0);
      expect(clusterHue(id)).toBeLessThan(360);
    }
  });

  it('spreads consecutive ids apart', () => {
    const gap = Math.abs(clusterHue(1) - clusterHue(2));
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(60);
  });
});
