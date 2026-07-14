import { describe, it, expect } from 'vitest';
import { SCALES, KEYS, midiToFreq, quantize, radialToDegree, degreeToFreq } from '../src/audio/scale';

describe('scale quantization', () => {
  it('has 6 scales and 12 keys', () => {
    expect(Object.keys(SCALES)).toHaveLength(6);
    expect(KEYS).toHaveLength(12);
  });

  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(48)).toBeCloseTo(130.81, 1);
  });

  it('radial 0 in C is the root (C3)', () => {
    expect(quantize(0, 'C', 'majorPentatonic')).toBeCloseTo(130.81, 1);
  });

  it('radial 1 in C is two octaves up (C5)', () => {
    expect(quantize(1, 'C', 'majorPentatonic')).toBeCloseTo(523.25, 1);
  });

  it('radial 0.5 in C major pentatonic is exactly one octave up (C4)', () => {
    // 11 degrees, index 5 = first degree of octave 2 = C4
    expect(quantize(0.5, 'C', 'majorPentatonic')).toBeCloseTo(261.63, 1);
  });

  it('respects the key: root of D is D3', () => {
    expect(quantize(0, 'D', 'majorPentatonic')).toBeCloseTo(146.83, 1);
  });

  it('all outputs land on scale tones', () => {
    const steps = SCALES.dorian;
    for (let r = 0; r <= 1.0001; r += 0.05) {
      const freq = quantize(r, 'C', 'dorian');
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      expect(steps).toContain(((midi - 48) % 12 + 12) % 12);
    }
  });

  it('clamps radial outside 0..1', () => {
    expect(quantize(-0.5, 'C', 'majorPentatonic')).toBeCloseTo(quantize(0, 'C', 'majorPentatonic'));
    expect(quantize(1.5, 'C', 'majorPentatonic')).toBeCloseTo(quantize(1, 'C', 'majorPentatonic'));
  });
});

describe('radialToDegree', () => {
  it('maps endpoints to first and last degree', () => {
    expect(radialToDegree(0, 'majorPentatonic')).toBe(0);
    expect(radialToDegree(1, 'majorPentatonic')).toBe(10); // 2 octaves x 5 steps
    expect(radialToDegree(1, 'dorian')).toBe(14); // 2 octaves x 7 steps
  });

  it('clamps out-of-range radial', () => {
    expect(radialToDegree(-1, 'majorPentatonic')).toBe(0);
    expect(radialToDegree(2, 'majorPentatonic')).toBe(10);
  });
});

describe('degreeToFreq', () => {
  it('degree 0 is the base root', () => {
    expect(degreeToFreq(0, 'C', 'majorPentatonic')).toBeCloseTo(130.81, 1); // C3
  });

  it('degree = scale length is exactly one octave up', () => {
    expect(degreeToFreq(5, 'C', 'majorPentatonic')).toBeCloseTo(261.63, 1); // C4
    expect(degreeToFreq(7, 'C', 'dorian')).toBeCloseTo(261.63, 1);
  });

  it('keeps climbing across octaves without wrapping', () => {
    expect(degreeToFreq(10, 'C', 'majorPentatonic')).toBeCloseTo(523.25, 1); // C5
    expect(degreeToFreq(12, 'C', 'majorPentatonic')).toBeCloseTo(659.25, 1); // E5 (midi 76)
  });

  it('applies the key offset', () => {
    expect(degreeToFreq(0, 'D', 'majorPentatonic')).toBeCloseTo(146.83, 1); // D3
  });

  it('composes into quantize', () => {
    expect(quantize(0.5, 'C', 'majorPentatonic')).toBeCloseTo(
      degreeToFreq(radialToDegree(0.5, 'majorPentatonic'), 'C', 'majorPentatonic'),
    );
  });

  it('folds pitches above maxMidi down by whole octaves, keeping the pitch class', () => {
    // degree 45 pentatonic from base 60: octave 9, step 0 -> midi 168, folds to 108 (C8)
    expect(degreeToFreq(45, 'C', 'majorPentatonic', 60, 108)).toBeCloseTo(4186.01, 0);
    // degree 12 from base 48 is midi 76 (E5); ceiling 72 folds it to 64 (E4)
    expect(degreeToFreq(12, 'C', 'majorPentatonic', 48, 72)).toBeCloseTo(329.63, 1);
  });

  it('leaves pitches at or below maxMidi untouched', () => {
    expect(degreeToFreq(10, 'C', 'majorPentatonic', 48, 108)).toBeCloseTo(523.25, 1);
  });
});
