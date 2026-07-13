import { describe, it, expect } from 'vitest';
import { cellRadial, panFromX } from '../src/geometry';

describe('geometry', () => {
  it('radial is 0 at center, 1 at corner', () => {
    expect(cellRadial(47.5, 47.5, 96, 96)).toBeCloseTo(0);
    expect(cellRadial(0, 0, 96, 96)).toBeCloseTo(1);
    expect(cellRadial(95, 95, 96, 96)).toBeCloseTo(1);
  });

  it('radial is clamped to at most 1', () => {
    expect(cellRadial(-10, -10, 96, 96)).toBe(1);
  });

  it('pan maps left edge to -1, center to 0, right edge to +1', () => {
    expect(panFromX(0, 96)).toBeCloseTo(-1);
    expect(panFromX(47.5, 96)).toBeCloseTo(0);
    expect(panFromX(95, 96)).toBeCloseTo(1);
  });
});
